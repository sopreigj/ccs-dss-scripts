// CCS 20.0.1 脚本：让目标继续运行（run/resume）后释放会话。
// Usage: run.bat ccs20_0_1_target_run.js <ccxml_path>
//
// 本脚本的语义就是"让目标接着跑"，所以显式声明 releaseOnExit()：正常收尾时不停机
// （否则收尾的 halt 会把本脚本的作用抵消掉）。但脚本被 Ctrl+C / kill 时仍然一律停机。
//
// 注意：脚本退出即断开调试器，目标会继续自由运行固件——对电机固件而言即 PWM 可能处于
// 活动状态。停止手段是断电或固件自身的停止逻辑，不是"再跑一个 halt 脚本"
// （见 session/session.js（会话边界））。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_target_run.js <ccxml_path>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 1 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    ccs.releaseOnExit();
    console.log("Running target from PC " + ccs.readPC(session) + "...");
    session.target.run(false);
    console.log("Target running. The session closes now; the target keeps running.");
} catch (err) {
    console.error("Run failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
