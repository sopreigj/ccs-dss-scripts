// CCS 20.0.1 脚本：校验目标里的程序与 .out 文件是否一致（读回并比对，不烧录）。
// Usage: run.bat ccs20_0_1_verify_program.js <ccxml_path> <out_file_path>
//
// 用途：回答"烧录到底成功了没有"。load_program 返回 0 只说明命令发出去了，这个脚本才是证据。
// 实测（F28335，260 KB 固件）：verifyProgram 约 0.8 秒，成功时调试器自己打印
// "Program verification successful"；不一致时抛错，本脚本返回 1。
//
// 前置条件：目标里必须已经烧了**同一个** .out（否则校验必然失败，这是正确行为而不是脚本故障）。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_verify_program.js <ccxml_path> <out_file_path>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: 2 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const outPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 1, "out_file_path", USAGE), "out path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    console.log("Verifying target contents against: " + outPath);
    session.memory.verifyProgram(outPath);
    console.log("Verify: OK. Target contents match the file.");
} catch (err) {
    console.error("Verify FAILED: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
