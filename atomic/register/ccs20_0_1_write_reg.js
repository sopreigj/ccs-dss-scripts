// CCS 20.0.1 脚本：写一个 CPU 寄存器。
// Usage: run.bat ccs20_0_1_write_reg.js <ccxml_path> <register> <value>
//   <value> 十进制或 0x 前缀十六进制（**不接受负号**：要写全 1 就写 0xFFFF）
//
// 写完后回读并打印，作为"确实写进去了"的证据（寄存器写没有返回值）。
//
// 注意两件事：
//   1. 寄存器值不跨脚本保持——脚本退出即断开，所以"写寄存器"通常只是某个单 session 流程的一步；
//      单独运行它主要价值是确认寄存器可写、以及验证名字拼写。
//   2. 寄存器名是目标相关的（C28x 实测 "AL"、"PC" 可用），新 API 没有"列出寄存器"的接口。
//
// 外设寄存器（ePWM/ADC 等）不在这里：它们是内存映射的，用 ccs20_0_1_mem_write.js 或
// 表达式赋值（ccs20_0_1_write_expr.js，如 "EPwm1Regs.TBCTL.all = 0x2006"）。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_write_reg.js <ccxml_path> <register> <value>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 3 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const registerName = cli.requiredArg(args.positional, 1, "register", USAGE);
const value = cli.parseNumber(cli.requiredArg(args.positional, 2, "value", USAGE), "value");

// 加密线封死：CSMSCR 的 bit15 FORCESEC 写 1 会锁死 CSM。
// 当前 C28x 寄存器 DB 里根本没有 CSMSCR（它是内存映射外设，实际可达路径是 mem_write 0x0AEF），
// 所以这个守卫今天打不中任何东西——它是纵深防御：一旦 TI 把外设寄存器挂进寄存器名空间，这里挡住。
if (/^csmscr$/i.test(registerName)) {
    console.error("REFUSED: " + registerName + " is the CSM security register; setting FORCESEC locks the CSM."
        + " Refused by policy.");
    process.exit(cli.EXIT_FAIL);
}

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    console.log("Writing 0x" + value.toString(16) + " to " + registerName + "...");
    session.registers.write(registerName, value);
    const readBack = Number(session.registers.read(registerName));
    console.log(registerName + " = 0x" + readBack.toString(16) + " (read back)");
    // 回读不一致**不**算失败：C28x 有些寄存器有掩码/保留位（硬件强制为 1）或只读字段，
    // 写进去的值与原值不同是正常的。所以这里只把差异喊出来，退出码仍交给真正的失败（写不进去会抛错）——
    // 反过来"只要不一致就 exit 1"会把正常的掩码写成失败，那是另一种假象。
    if (readBack !== value) {
        console.log("  WARNING: read-back differs from the value written (0x" + value.toString(16)
            + "); the register may have masked/reserved bits or read-only fields.");
    }
} catch (err) {
    console.error("Register write failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
