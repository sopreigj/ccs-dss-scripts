// CCS 20.0.1 脚本：把 .out 烧录进目标（不运行）。
// Usage: run.bat ccs20_0_1_load_program.js <ccxml_path> <out_file_path>
//
// 耗时：260 KB 固件经 XDS100v1 实测约 23 秒，因此脚本超时统一设为 180 s（session/session.js）。
// 连接本身会复位目标（实测 PC 恒为 0x3ff9ce），烧录后程序停在入口。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_load_program.js <ccxml_path> <out_file_path>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: 2 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const outPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 1, "out_file_path", USAGE), "out path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    console.log("Loading program: " + outPath);
    session.memory.loadProgram(outPath);
    console.log("Program loaded. Target halted at program entry (PC " + ccs.readPC(session) + ").");
} catch (err) {
    console.error("Load failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
