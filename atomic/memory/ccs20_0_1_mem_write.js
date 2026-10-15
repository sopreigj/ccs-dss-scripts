// CCS 20.0.1 脚本：写一个整数到内存地址。
// Usage: run.bat ccs20_0_1_mem_write.js <ccxml_path> <address> <value> [bit_size]
//   <address>  必须是带 0x 前缀的十六进制（如 0xC000）
//   <value>    十进制或 0x 前缀十六进制
//   [bit_size] 8/16/24/32/40/48/64，默认 16
//
// 写"程序数据区"（本项目为 0xC200-0xC2FF）的值会被程序启动代码覆盖；数据区之外的地址
// 才跨脚本保持（实测 0xD000 写 0xE0E0 后新 session 读回一致）。见 session/session.js 的会话边界说明。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_mem_write.js <ccxml_path> <address> <value> [bit_size]";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 4 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const address = cli.parseAddress(cli.requiredArg(args.positional, 1, "address", USAGE));
const value = cli.parseNumber(cli.requiredArg(args.positional, 2, "value", USAGE), "value");
const bitSize = args.positional.length > 3 ? cli.parseBitSize(args.positional[3], "bit_size") : 16;

// 只查上界：cli.parseNumber 只接受非负的十进制/0x 字面量，所以没有下界要查。
if (value > Math.pow(2, Math.min(bitSize, 53)) - 1) {
    cli.usageError("value " + value + " does not fit in " + bitSize + " bits", USAGE);
}

// 加密线封死：0x0AEF 是 CSMSCR 的字地址，写 bit15 FORCESEC=1 即锁死
// CSM——与 flash_op --op Lock 等效，但走内存写就绕过了那边的 WARNING。位宽 ≤8 够不着 bit15，不拦。
const CSMSCR_WORD = 0x0AEF;
if (bitSize > 8 && address <= CSMSCR_WORD && CSMSCR_WORD < address + Math.ceil(bitSize / 16)) {
    cli.usageError("write covers CSMSCR (0x" + CSMSCR_WORD.toString(16) + "): setting FORCESEC locks the CSM"
        + " — refused by policy", USAGE);
}

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    console.log("Writing 0x" + value.toString(16) + " to 0x" + address.toString(16) + " (" + bitSize + "-bit)...");
    session.memory.write(address, value, bitSize);
    console.log("Memory written.");
} catch (err) {
    console.error("Memory write failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
