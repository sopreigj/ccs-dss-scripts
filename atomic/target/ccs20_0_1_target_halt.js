// CCS 20.0.1 脚本：把目标停住（halt）。
// Usage: run.bat ccs20_0_1_target_halt.js <ccxml_path>
//
// 停机只在本次会话内有效：脚本退出时调试器释放目标，目标会继续跑固件（实测证据见
// session/session.js 的会话边界说明）。要确定停止，请断电或用固件自身的停止逻辑。
//
// 停机就是停机：不做"stop debug"这类名字更响、实际只 halt 的动作，也不在失败路径上返回 0
// （脚本失败必须给非零退出码——这是本仓库的硬规则之一）。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_target_halt.js <ccxml_path>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 1 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    session.target.halt();
    console.log("Target halted at PC " + ccs.readPC(session) + ".");
} catch (err) {
    console.error("Halt failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
