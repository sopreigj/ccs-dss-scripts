// 通用编排层驱动门面（CCS 20.0.1 实现）。契约就是本文件导出的名字表（见文件末尾的 ORCH_DRIVER）。
//
// 本门面把 session/ 与 cli/ 的助手映射成编排层一致的表面，orchestration/ 的共享
// 源码只准用这些名字：原始 session 对象、BigInt/字符串差异、run(false)/runAsynch 差异
// 全部留在本文件里。session 由本驱动持有——一次脚本一个会话。
//
// ES3 子集（test/static_checks.js 机械检查禁词）：var/function、
// 无 let/const/箭头/模板串/Object.keys/JSON。
// 本表故意不含 flash/CSM 通路：加密线解析期守卫留在原子脚本，共享层碰不到扳机。
var sess = require("./session.js");
var cli = require("./cli.js");

var _session = null;
var _symbolsPath = null;

function _req() {
    if (_session === null) throw new Error("orch_driver: openTarget() has not been called");
    return _session;
}

// argv 偏移：run.bat 把脚本与参数交给 launcher，launcher 再插入目标脚本名，所以脚本看到的
// process.argv 是 [node.exe, launcher.mjs, <script.js>, ...用户参数]——用户参数从 index 3 起
// （26 个脚本共用的约定）。直接 `node <script.js> ...` 调用会少两段，参数会错位。
function parseArgs(spec) {
    return cli.parseArgs(process.argv.slice(3), spec);
}
function requiredArg(positional, index, name, usage) {
    return cli.requiredArg(positional, index, name, usage);
}
function requireAbsoluteFile(path, label) {
    return cli.requireAbsoluteFile(path, label);
}
function requireAbsolutePath(path, label) {
    return cli.requireAbsolutePath(path, label);
}
function parseAddress(text, label) {
    return cli.parseAddress(text, label);
}
function parseInteger(text, label) {
    return cli.parseInteger(text, label);
}
function parseNumber(text, label) {
    return cli.parseNumber(text, label);
}
function parseBitSize(text, label) {
    return cli.parseBitSize(text, label);
}
function usageError(message, usage) {
    cli.usageError(message, usage);
}
function envList(name) {
    var raw = process.env[name];
    if (!raw) return [];
    var parts = ("" + raw).split(";");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var item = parts[i].replace(/^\s+|\s+$/g, "");
        if (item) out.push(item);
    }
    return out;
}

function openTarget(ccxmlPath) {
    // 这两行日志在原始 session 层没有，在驱动里补齐，共享层不再各打一遍。
    printLog("Configuring target configuration: " + ccxmlPath);
    _session = sess.openTarget(ccxmlPath);
}
function loadProgram(outPath) {
    _req().memory.loadProgram(outPath);
}
// Explicit symbol load for the shared main's --symbols-only mode: same lazy per-path
// semantics as evalExpr/runToBreakpoint already use internally (one concept, one function).
function loadSymbols(symbolsPath) {
    _ensureSymbols(symbolsPath);
}
function readPC() {
    return sess.readPC(_req());
}
function runTarget() {
    _req().target.run(false);
}
function runForMs(ms) {
    runTarget();
    sess.sleep(ms);
    _req().target.halt();
    return readPC();
}
function haltTarget() {
    _req().target.halt();
}
// 严格查询：错误向上传播，绝不把"查询失败"吞成 false——load_run 一类脚本的
// 承诺是"目标在跑"，查询失败必须失败（waitUntilHalted 的轮询仍走 session.js 的安静版，行为不变）。
function isHalted() {
    return _req().target.isHalted();
}
function waitUntilHalted(timeoutMs) {
    return sess.waitUntilHalted(_req(), timeoutMs);
}
function step(kind) {
    // asm 走的是本栈既有的那次调用（板测 0x301bfc -> 0x301bfd -> 0x301bff -> 0x301c01）；
    // 机制差异留在这里，不进共享代码。
    if (kind === "into") _req().target.stepInto();
    else if (kind === "over") _req().target.stepOver();
    else if (kind === "out") _req().target.stepOut();
    else if (kind === "asm") _req().target.stepInto(true);
    else cli.usageError("step kind must be into|over|out|asm, got: " + kind, null);
}
// 符号表按路径惰性加载一次：sample_exprs 会对同一批表达式反复求值，不能每次重载（GEL_SymbolLoad 是秒级的）。
function _ensureSymbols(symbolsPath) {
    if (symbolsPath && symbolsPath !== _symbolsPath) {
        sess.loadSymbols(_req(), symbolsPath);
        _symbolsPath = symbolsPath;
    }
}
function evalExpr(expr, symbolsPath) {
    _ensureSymbols(symbolsPath);
    var value = _req().expressions.evaluate(expr);
    // 输出格式按本栈的已实测行为——对整数给 "0x… (十进制)"。
    if (typeof value === "bigint") return "0x" + value.toString(16) + " (" + value.toString(10) + ")";
    return String(value);
}
// 采样/写回用的原始单元格串：**保持既有 CSV 列格式**——本栈对整型只给
// "0x…"（CSV 列类型稳定，evalExpr 的 "0x… (十进制)" 带空格括号会毁掉下游按 hex 的解析），
// 其余类型 toString。
function evalRaw(expr, symbolsPath) {
    _ensureSymbols(symbolsPath);
    var value = _req().expressions.evaluate(expr);
    if (typeof value === "bigint") return "0x" + value.toString(16);
    return String(value);
}
// 整文件写入：共享层拼好文本（含 \r\n）一次性落盘——字节一致，行尾不交给平台分隔符。
function writeTextFile(path, text) {
    require("fs").writeFileSync(path, text);
}
// 复合操作内部用的原始数值求值（"已在 X"判命中要按数值比 PC，不能用带括号的展示格式）。
function _rawEval(expr) {
    return Number(_req().expressions.evaluate(expr));
}
function sleepMs(ms) {
    sess.sleep(ms);
}
function printLog(msg) {
    console.log(msg);
}
function hex(value) {
    return "0x" + Number(value).toString(16);
}
function readMem(address, bitSize, count) {
    var raw = _req().memory.read(address, count, bitSize);
    var out = [];
    for (var i = 0; i < raw.length; i++) out.push(Number(raw[i]));
    return out;
}
function writeMem(address, value, bitSize) {
    _req().memory.write(address, value, bitSize);
}

function addBreakpoint(location) {
    var id = _req().breakpoints.add(location);
    if (typeof id === "number" && id < 0) {
        throw new Error("breakpoint could not be set at " + location + " (add returned " + id + ")");
    }
    return id;
}
function removeBreakpoint(id) {
    try { _req().breakpoints.remove(id); } catch (e) { /* 不存在也要吞掉：清理不该改变结局 */ }
}
function removeAllBreakpoints() {
    try { _req().breakpoints.removeAll(); } catch (e) { /* 同上 */ }
}
// workflows/ccs20_0_1_run_to_bp.js 的已验证三步：解析地址 → "已在 X" 判命中 → run + 等待 + PC 比对。
// 静默返回结构化数据；文案（"Breakpoint HIT at …" 等）由共享层打印。
function runToBreakpoint(location, timeoutMs, symbolsPath) {
    _ensureSymbols(symbolsPath);
    var breakpointAddress = null;
    try {
        breakpointAddress = _rawEval(location);
    } catch (err) {
        if (/^0x[0-9a-fA-F]+$/.test(location)) breakpointAddress = Number(location);
    }
    var pcNow = _rawEval("PC");
    if (breakpointAddress !== null && pcNow === breakpointAddress) {
        return { hit: true, alreadyAt: true, halted: true, pc: readPC(), expected: hex(breakpointAddress) };
    }
    var id = addBreakpoint(location);
    runTarget();
    var halted = sess.waitUntilHalted(_req(), timeoutMs);
    var observedPC = _rawEval("PC");
    removeBreakpoint(id);
    var hit = halted && breakpointAddress !== null && observedPC === breakpointAddress;
    return { hit: hit, alreadyAt: false, halted: halted, pc: hex(observedPC), expected: breakpointAddress === null ? null : hex(breakpointAddress) };
}
// 本栈已验证流程：把 Hardware Configuration.Type 改成 Watchpoint 会重建整套属性 id，
// 必须切换之后重新按 type 定位（切换前枚举到的 id 全部失效）。
function watchWrite(address, access, skipCount) {
    var props = _req().breakpoints.createProperties(1);
    _req().breakpoints.setProperty(props, "Hardware Configuration.Type", "Watchpoint");
    var detailed = _req().breakpoints.getDetailedProperties(props);
    var locationProperty = null;
    for (var i = 0; i < detailed.length; i++) {
        if (detailed[i].type === "location") { locationProperty = detailed[i]; break; }
    }
    if (!locationProperty) {
        throw new Error("this target does not expose a location property for hardware watchpoints");
    }
    _req().breakpoints.setProperty(props, locationProperty.id, address);
    _req().breakpoints.setProperty(props, "Hardware Configuration.Type.Trigger Type.Memory", access);
    if (skipCount > 0) {
        _req().breakpoints.setProperty(props, "Hardware Configuration.Type.Trigger Type.Skip Count", skipCount);
    }
    var id = _req().breakpoints.addWithProperties(props);
    var enabled = _req().breakpoints.getProperty(id, "Hardware Configuration.Type.Action Type.Halt CPU");
    return { id: id, haltOnTrigger: enabled };
}

function releaseOnExit() {
    sess.releaseOnExit();
}
function finishOk() {
    sess.finishQuietly();
    process.exit(cli.EXIT_OK);
}
function finishFail(reason) {
    console.error(reason);
    sess.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

var ORCH_DRIVER = {
    sentinel: "ccs-orch-driver-v1",
    parseArgs: parseArgs,
    requiredArg: requiredArg,
    requireAbsoluteFile: requireAbsoluteFile,
    requireAbsolutePath: requireAbsolutePath,
    parseAddress: parseAddress,
    parseInteger: parseInteger,
    parseNumber: parseNumber,
    parseBitSize: parseBitSize,
    usageError: usageError,
    envList: envList,
    openTarget: openTarget,
    loadProgram: loadProgram,
    loadSymbols: loadSymbols,
    readPC: readPC,
    runTarget: runTarget,
    runForMs: runForMs,
    haltTarget: haltTarget,
    isHalted: isHalted,
    waitUntilHalted: waitUntilHalted,
    step: step,
    evalExpr: evalExpr,
    evalRaw: evalRaw,
    writeTextFile: writeTextFile,
    sleepMs: sleepMs,
    printLog: printLog,
    hex: hex,
    readMem: readMem,
    writeMem: writeMem,
    addBreakpoint: addBreakpoint,
    removeBreakpoint: removeBreakpoint,
    removeAllBreakpoints: removeAllBreakpoints,
    runToBreakpoint: runToBreakpoint,
    watchWrite: watchWrite,
    releaseOnExit: releaseOnExit,
    finishOk: finishOk,
    finishFail: finishFail,
};

// 导出哨兵：orchestration/ 的入口用同一个 sentinel 值确认共享 main 真的被加载进来了
// （require 缺文件天然抛错，这里的哨兵是给"载入的是不是这份文件"用的）。
if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_DRIVER;
}
