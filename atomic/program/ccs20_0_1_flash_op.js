// CCS 20.0.1 脚本：列出或执行目标的 flash 操作，并可在同一会话内先改写该操作要用到的属性。
// Usage: run.bat ccs20_0_1_flash_op.js <ccxml_path> --list
//        run.bat ccs20_0_1_flash_op.js <ccxml_path> --op "<operation>" [--op "<operation>" ...] [--set <id>=<value> ...]
//
// `--op` 可重复，按给出顺序在**同一个会话**里执行：`FrequencyTest` 与 `EndFrequencyTest` 是一对
// （开始/结束），跨会话做不成——换个会话属性读回默认值、测试状态也没了。操作名做**精确匹配**
// （`listSupportedOperations()` 返回的是一个用 `|` 分隔的字符串，先拆再比；用 indexOf 直接判等于子串匹配）。
//
// 操作名**不能静态枚举**，只能运行时问 listSupportedOperations()。本机实测返回：
//   Erase | CalculateChecksum | DepletionRecovery | FrequencyTest | EndFrequencyTest
//   | ProgramPassword | Lock | Unlock
// 注意里面**没有 Program**：烧录与校验由 memory.loadProgram / verifyProgram 负责
// （见 ccs20_0_1_load_program.js、ccs20_0_1_verify_program.js），这也是 TI 的接口划分。
//
// 危险操作 —— 这 8 个名字就是 CCS「Flash Settings」对话框里的那 8 个按钮（该芯片的属性文件逐条
// <action> 可证），而 `performOperation(operation)` **只接一个操作名、没有第二个参数**：擦哪些扇区、
// 密码写什么、频率测试用哪个引脚，全部取自**调试属性**。所以后果不由操作名决定，而由当时的属性值决定：
//   Erase             → FlashSectorA..H 默认全为 1 ⇒ 擦掉**整片**（0x300000-0x33FFFF = 262144 个字）
//   ProgramPassword   → FlashKey0..7 默认全 FFFF ⇒ 写入的是**空密码**
//   FrequencyTest     → FTPin 默认 GPIO0 ⇒ 把该引脚驱动成闪存时钟输出（会动真实引脚）
//   CalculateChecksum → 只读；算完可从属性 FlashChecksum / OTPChecksum 读出来（不只是屏幕上的字）
//
// 属性的可读可写（本机实测，修正了早期"脚本既不能指定也不能预读"的结论）：
//   * 读：`session.settings.get(id)` / `getDetailedSettings()`（后者给出 type / allowedValues /
//     allowedRange，本脚本的 --set 就用它校验）；
//   * 写：`session.settings.set(id, value)`——**只影响当前会话，不持久化**。实测：在会话内把一个
//     "频测用哪个引脚"的属性设成某个具体引脚，紧接着做频测，算法驱动的就是那个引脚；
//     换一个新会话再跑，读回的是该属性的默认值，驱动的也就是默认引脚。
//     所以"设属性"与"执行操作"必须落在同一次调用里，这正是 --set 存在的理由：单独用 --op 跑
//     FrequencyTest 永远只会驱动该属性的默认引脚。
//   * 由此多出一个**部分擦除**能力：`--set FlashSectorH=false --op Erase` 只擦 H 以外的扇区。
//
// 加密线封死——本脚本**拒绝执行**两条加密路径，解密保留：
//   * `--op ProgramPassword`：在打开会话**之前**就直接 exit 1。它是唯一的"确定性变砖"操作：非空密码
//     写进 0x33FFF8-0x33FFFF 又没人记得 ⇒ flash 再也擦不掉/烧不进。量产保护 IP 请去 CCS GUI 手动做。
//   * `--set FlashKey0..7=...`：同样 exit 1。单独设密码属性虽不写 flash（属性是会话级的），但它是
//     ProgramPassword 的"上膛"动作——封操作名不封它，等于收枪不收子弹。
//   * `--op Lock`：**保留可执行**，执行前打 WARNING（可逆性未证明）。
//   * `--op Unlock`：**保留**——解密/清锁路径，误操作后的恢复手段（真板实测 exit 0、校验和不变）。
// 旁路封堵：CSMSCR 的字地址是 0x0AEF——mem_write/mem_fill 对覆盖它的写直接拒绝（FORCESEC 写 1 等同
// Lock，但绕过这里的 WARNING）；write_reg 对寄存器名 CSMSCR 拒绝（当前寄存器 DB 无此名，属纵深防御）。
// Erase 的可逆性：可用 load_program 烧回（更稳的是先 mem_export 把扇区 dump 成 HEX）。
// 已实测（真板）：Erase、CalculateChecksum、Unlock、DepletionRecovery、FrequencyTest + EndFrequencyTest
// （同一会话内、引脚指向空闲的 GPIO51）；ProgramPassword 与 Lock 从不实测升级为**主动拒绝**（前者）
// 与**WARNING 后放行**（后者）。
// 依据：<CCS_ROOT>\ccs\ccs_base\DebugServer\propertyDB\ 下的芯片 Flash 属性定义文件

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = 'Usage: run.bat ccs20_0_1_flash_op.js <ccxml_path> --list\n'
    + '       run.bat ccs20_0_1_flash_op.js <ccxml_path> --op "<operation>" [--op "<operation>" ...] '
    + '[--set <id>=<value> ...]';

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: {
        "--list": { takesValue: false },
        // --op 可重复：`FrequencyTest` 与 `EndFrequencyTest` 是"开始/结束"一对，必须落在**同一个会话**里
        // （跨会话属性与测试状态都不保持），一次只接一个操作名就没法用它俩。多个操作按给出顺序执行。
        "--op": { takesValue: true, repeat: true },
        "--set": { takesValue: true, repeat: true },
    },
    confFill: ["CCXML"], maxPositional: 1,
});
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const operations = args.flags["--op"] || [];
const listRequested = Boolean(args.flags["--list"]);
const assignments = args.flags["--set"] || [];
if (!listRequested && operations.length === 0) {
    cli.usageError("either --list or --op \"<operation>\" is required", USAGE);
}
if (listRequested && operations.length > 0) {
    // 两个都给时静默偏向一个，会让人以为另一个也生效了——宁可报用法错误。
    cli.usageError("--list and --op are mutually exclusive", USAGE);
}
if (listRequested && assignments.length > 0) {
    // --list 什么都不执行，属性又不持久化，配 --set 只说明使用者以为"改了会留下来"。
    cli.usageError("--list performs nothing and properties do not persist, so --set is meaningless with it", USAGE);
}

// 加密线封死：在**打开会话之前**拒绝，拒绝路径不碰硬件、可离线复测。
if (operations.indexOf("ProgramPassword") >= 0) {
    console.error("REFUSED: ProgramPassword writes the CSM password into flash (0x33FFF8-0x33FFFF)."
        + " A non-blank password nobody remembers makes the device unrecoverable (erase needs CSM unlock)."
        + " Refused by policy; if production IP protection truly needs it,"
        + " do it by hand in the CCS GUI, not through this script.");
    process.exit(cli.EXIT_FAIL);
}
const keyWrites = assignments.map((a) => a.slice(0, a.indexOf("=")))
    .filter((id) => /^FlashKey[0-7]$/i.test(id));
if (keyWrites.length > 0) {
    console.error("REFUSED: --set " + keyWrites.join(", ") + " — writing the CSM password keys is the loading"
        + " step of the ProgramPassword path, which this script refuses (policy, ).");
    process.exit(cli.EXIT_FAIL);
}

// 把 `--set id=value` 应用到本会话。属性是"待执行操作"的全部参数来源，所以宁可因为一个不合法的值
// 就整体失败，也不要让调试器拿着一个意料之外的属性去擦 flash。
function applyAssignments(session, list) {
    const all = session.settings.getDetailedSettings();
    const byId = {};
    all.forEach((s) => { byId[s.id] = s; });
    list.forEach((assignment) => {
        const sep = assignment.indexOf("=");
        if (sep <= 0) {
            cli.usageError("--set expects <id>=<value>, got: " + assignment, USAGE);
        }
        const id = assignment.slice(0, sep);
        const raw = assignment.slice(sep + 1);
        const spec = byId[id];
        if (!spec) {
            cli.usageError("unknown setting: " + id + " (this target exposes: " + Object.keys(byId).join(", ") + ")", USAGE);
        }
        let value;
        if (spec.type === "bool") {
            if (raw !== "true" && raw !== "false") {
                cli.usageError(id + " is a boolean; use true or false, got: " + raw, USAGE);
            }
            value = raw === "true";
        } else if (spec.type === "numeric") {
            if (!/^\d+$/.test(raw)) {
                cli.usageError(id + " is numeric; got: " + raw, USAGE);
            }
            value = parseInt(raw, 10);
            if (spec.allowedRange && (value < spec.allowedRange.min || value > spec.allowedRange.max)) {
                cli.usageError(id + " must be within [" + spec.allowedRange.min + ", " + spec.allowedRange.max + "], got: " + raw, USAGE);
            }
        } else if (spec.allowedValues && spec.allowedValues.indexOf(raw) < 0) {
            cli.usageError(id + " does not accept " + raw + "; allowed: " + spec.allowedValues.join(", "), USAGE);
        } else {
            value = raw;
        }
        session.settings.set(id, value);
        // 回读确认：属性可能只读、也可能被目标规范化，写完不确认等于把"设了"当成"生效了"。
        const readBack = session.settings.get(id);
        console.log("  --set " + id + " = " + JSON.stringify(readBack));
        if (String(readBack) !== String(value)) {
            throw new Error("setting " + id + " read back as " + JSON.stringify(readBack) + ", expected " + JSON.stringify(value));
        }
    });
}

// 执行操作前把"这个操作要用的属性"打出来：后果由属性决定，属性就必须先可见。
function describeProperties(session) {
    const get = (id) => {
        try {
            return session.settings.get(id);
        } catch (err) {
            return null; // 有些属性（如 FlashChecksum 未算时）没有值可取
        }
    };
    const sectors = "ABCDEFGH".split("").filter((letter) => get("FlashSector" + letter) === true);
    const keys = [];
    for (let i = 0; i < 8; i++) keys.push(String(get("FlashKey" + i)));
    const keysBlank = keys.every((k) => /^f{4}$/i.test(k));
    console.log("Properties in effect: sectors=[" + (sectors.length ? sectors.join("") : "none") + "]"
        + "  FTPin=" + get("FTPin")
        + "  keys=" + (keysBlank ? "FFFF x8 (blank password)" : keys.join(","))
        + "  flashProgram=" + get("FlashOperations")
        + "  OSCCLK=" + get("FlashOSCCLK") + "MHz CLKINDV=" + get("FlashCLKINDV") + " PLLCR=" + get("FlashPLLCR"));
}

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    if (!session.flash.isFlashSupported()) {
        console.error("Flash is not supported by this target configuration.");
        ccs.shutdownQuietly();
        process.exit(cli.EXIT_FAIL);
    }
    const supported = session.flash.listSupportedOperations();
    if (listRequested) {
        console.log("Supported flash operations:");
        console.log("  " + supported);
    } else {
        // listSupportedOperations() 返回的是**一个字符串**（实测 "Erase | CalculateChecksum | ..."），
        // 所以必须先拆成名字再比较：直接 indexOf 等于**子串匹配**——"rase"、"Eras"、"Checksum" 都能过校验，
        // 然后由 performOperation 抛出含糊的底层错误（校验的存在意义就是在扣扳机之前挡住拼错的名字）。
        const supportedNames = String(supported).split("|")
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
        const unknown = operations.filter((op) => supportedNames.indexOf(op) < 0);
        if (unknown.length > 0) {
            cli.usageError("unknown flash operation: " + unknown.join(", ")
                + " (supported: " + supportedNames.join(", ") + ")", USAGE);
        }
        if (assignments.length > 0) {
            console.log("Applying properties for this session only (they do not persist to the next session):");
            applyAssignments(session, assignments);
        }
        describeProperties(session);
        // 全部操作在同一个会话里按顺序执行，会话结束时才收尾。
        operations.forEach((operation) => {
            if (operation === "Lock") {
                console.log("  WARNING: Lock sets CSMSCR.FORCESEC; its reversibility is UNPROVEN"
                    + " (this has never been measured). Continuing, because the decision"
                    + " to lock belongs to the operator — this warning exists so it is made knowingly.");
            }
            console.log("Performing flash operation: " + operation + "...");
            session.flash.performOperation(operation);
            console.log("Flash operation finished: " + operation);
        });
    }
} catch (err) {
    console.error("Flash operation failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
