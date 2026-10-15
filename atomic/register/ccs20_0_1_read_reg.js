// CCS 20.0.1 脚本：读一个或多个 CPU 寄存器。
// Usage: run.bat ccs20_0_1_read_reg.js <ccxml_path> <register1> [register2 ...]
//
// 支持一次读多个寄存器（原来是"一次一个"，读 PC 和 SP 要开两次会话、复位两次目标）。
// 名字大小写不敏感（CCS 侧按名解析，实测 "PC" 可用）。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_read_reg.js <ccxml_path> <register1> [register2 ...]";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: null });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const registerNames = args.positional.slice(1);
if (registerNames.length === 0) cli.usageError("missing required argument: register", USAGE);

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    for (const name of registerNames) {
        const value = session.registers.read(name);
        console.log(name + " = 0x" + Number(value).toString(16) + " (" + value + ")");
    }
} catch (err) {
    console.error("Register read failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
