// CCS 20.0.1 脚本：报告目标当前状态（核名、连接、停机、PC、可用复位类型、关键调试设置）。
// Usage: run.bat ccs20_0_1_target_state.js <ccxml_path>
//
// 这里只报告"静态查不到、只能运行时问"的东西。注意查询本身要连接目标，而连接会复位并停机，
// 所以本脚本回答的是"连接之后"的状态，不是"刚才那一瞬间"的状态。
//
// 关键设置项在不同目标上暴露的名字不同，问不到就显示 <not available>——这不是错误。
// 其中 AutoResetOnConnect 值得关注：它默认已是 false，说明"连接即复位"另有来源。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_target_state.js <ccxml_path>";

const SETTING_IDS = [
    "AutoResetOnConnect",
    "KeepDebugPoweredAtDisconnect",
    "EnableSoftwareBreakpoints",
    "ClearBreakpointsOnLoad",
];

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 1 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    const halted = session.target.isHalted();
    console.log("core      : " + session.getName());
    console.log("connected : " + session.target.isConnected());
    console.log("halted    : " + halted + (halted ? "" : " (running)"));
    console.log("PC        : " + ccs.readPC(session));
    const resets = session.target.getResets();
    const resetNames = Object.keys(resets);
    console.log("resets    : " + (resetNames.length === 0
        ? "<none>"
        : resetNames.map((name) => name + "=" + resets[name]).join(", ")));
    for (const id of SETTING_IDS) {
        let value = "<not available>";
        try { value = session.settings.get(id); } catch (err) { /* 该目标不暴露此项 */ }
        console.log("setting   : " + id + " = " + value);
    }
} catch (err) {
    console.error("State query failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
