// CCS 20.0.1 脚本：检查目标连接是否正常。唯一的"断言型"脚本。
// Usage: run.bat ccs20_0_1_check_connection.js <ccxml_path>
//
// 退出码：0 = 已连接；1 = 未连接或失败。便于 .bat 里用 if errorlevel 直接判断。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_check_connection.js <ccxml_path>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 1 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");

let connected = false;
try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    connected = session.target.isConnected();
    console.log(connected
        ? "Connection: OK. Target connected."
        : "Connection: FAILED. Target not connected.");
} catch (err) {
    // 连不上就是"未连接"，不是脚本崩溃——退出码由 connected 统一决定。
    console.error("Connection check failed: " + err.message);
}

ccs.shutdownQuietly();
process.exit(connected ? cli.EXIT_OK : cli.EXIT_FAIL);
