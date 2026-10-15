// 会话层：所有脚本共用的 CCS 调试会话生命周期。
//
// 存在的理由：原来 18 个原子脚本各自复制了一份相同的 20 行骨架，且已经漂移出多种写法
// （两种 ccxml 校验文案、超时 30s/180s 并存、16/18 才有 process.exit(1)、仅 2/18 装了
// 被杀即停机的钩子、target_stop 失败仍返回 0）。这些差异没有一个是"故意的"，全是复制粘贴
// 的产物。会话生命周期只应该有一个实现。
//
// 依赖方向：atomic/*、workflows/* → session/*（单向，禁止反向 require）。

// 统一脚本超时。原项目 30s/180s 并存：180s 是为 XDS100v1 烧录 260KB 固件（实测约 23s）
// 留的余量，而对所有操作统一放宽不会带来额外风险——超时只是"卡死保护"，不是性能约束。
const SCRIPTING_TIMEOUT_MS = 180000;

const POLL_INTERVAL_MS = 50;

let activeDs = null;
let activeSession = null;
// 正常退出时是否把目标摁停。默认停（安全）；只有"本意就是让目标继续跑"的脚本
// （如 target_run）才声明 releaseOnExit()，否则收尾时的停机会把它的作用抵消掉。
// 被信号杀掉的情况不受这个开关影响——那种情况下**一律停机**，这是本项目的安全底线
// （历史事故：调试会话被强拆、目标继续跑电机控制算法）。
let haltOnExit = true;

function haltQuietly() {
    try {
        if (activeSession && activeSession.target) activeSession.target.halt();
    } catch (e) { /* 已停机或已断开 */ }
}

function shutdownQuietly() {
    haltQuietly();
    try {
        if (activeDs) activeDs.shutdown();
    } catch (e) { /* 会话已关闭 */ }
}

// 声明"脚本正常结束时不要停机"。给 target_run 这类脚本用。
function releaseOnExit() {
    haltOnExit = false;
}

// 正常路径的统一收尾（脚本末尾调用）。
function finishQuietly() {
    if (haltOnExit) haltQuietly();
    try {
        if (activeDs) activeDs.shutdown();
    } catch (e) { /* 会话已关闭 */ }
}

// 脚本被 Ctrl+C / kill / 异常退出时也要把目标摁停。原项目只有 run_for_ms、target_run 装了钩子，
// 而这两个恰恰是最需要停机保护的（它们让目标跑了起来）。
function installSafetyHooks() {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, () => {
            shutdownQuietly();
            process.exit(1);
        });
    }
    process.on("exit", () => finishQuietly());
}

// 建立会话并连接目标。connect() 会复位目标并使其停在 Boot ROM（实测 PC 恒为 0x3ff9ce），
// 这里显式再 halt 一次，保证后续读寄存器/内存时 CPU 确实停着。
function openTarget(ccxmlPath) {
    installSafetyHooks();
    activeDs = initScripting();
    activeDs.setScriptingTimeout(SCRIPTING_TIMEOUT_MS);
    activeDs.configure(ccxmlPath);
    activeSession = activeDs.openSession(/.*/);
    activeSession.target.connect();
    activeSession.target.halt();
    return activeSession;
}

// 只载符号，不重新烧录。符号名（如固件里的全局变量）必须先有符号表才能求值，
// 而 GEL_SymbolLoad 接受正斜杠路径更稳。
function loadSymbols(session, outPath) {
    session.expressions.evaluate('GEL_SymbolLoad("' + outPath.replace(/\\/g, "/") + '")');
}

function readPC(session) {
    return "0x" + session.registers.read("PC").toString(16);
}

function isHalted(session) {
    try {
        return session.target.isHalted();
    } catch (e) {
        return false;
    }
}

// 忙等。CCS 脚本环境里不能依赖 setTimeout 的回调在脚本结束前被调度，所以用忙等。
function sleep(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) { }
}

// 轮询等待目标停机（例如等待断点命中）。返回 true 表示等到了，false 表示超时。
function waitUntilHalted(session, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (isHalted(session)) return true;
        sleep(POLL_INTERVAL_MS);
    }
    return isHalted(session);
}

module.exports = {
    SCRIPTING_TIMEOUT_MS: SCRIPTING_TIMEOUT_MS,
    POLL_INTERVAL_MS: POLL_INTERVAL_MS,
    openTarget: openTarget,
    loadSymbols: loadSymbols,
    readPC: readPC,
    isHalted: isHalted,
    sleep: sleep,
    waitUntilHalted: waitUntilHalted,
    haltQuietly: haltQuietly,
    shutdownQuietly: shutdownQuietly,
    releaseOnExit: releaseOnExit,
    finishQuietly: finishQuietly,
};
