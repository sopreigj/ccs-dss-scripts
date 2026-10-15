// CCS 20.0.1 脚本：让目标运行 N 毫秒后停机，并报告运行前后的 PC。
// Usage: run.bat ccs20_0_1_run_for_ms.js <ccxml_path> <milliseconds>
//
// 报告 PC 是有意加的：原来只打印 "Target halted."，看不出程序到底跑没跑；
// 前后 PC 不同才是"确实执行了"的证据（实测 load 后 PC=0x301bfc，跑 2000 ms 后在 0x301c9b 一带）。
//
// 毫秒数是**忙等**（CCS 脚本环境里 setTimeout 的回调不保证在脚本结束前被调度）。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_run_for_ms.js <ccxml_path> <milliseconds>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 2 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const ms = cli.parseInteger(cli.requiredArg(args.positional, 1, "milliseconds", USAGE), "milliseconds");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    const pcBefore = ccs.readPC(session);
    console.log("Running " + ms + " ms from PC " + pcBefore + "...");
    session.target.run(false);
    ccs.sleep(ms);
    session.target.halt();
    console.log("Target halted. PC after: " + ccs.readPC(session) + " (was " + pcBefore + ")");
} catch (err) {
    console.error("Run failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
