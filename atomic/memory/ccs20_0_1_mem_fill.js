// CCS 20.0.1 脚本：把一段内存填成同一个值（比逐字 write 快，也比手写循环可靠）。
// Usage: run.bat ccs20_0_1_mem_fill.js <ccxml_path> <address> <count> <value> [bit_size]
//   <address>  带 0x 前缀的十六进制
//   <count>    填充的元素个数
//   <value>    十进制或 0x 前缀十六进制
//   [bit_size] 8/16/24/32/40/48/64，默认 16
//
// 填完后回读前若干项作为证据（fill 自身不返回值）。数据区（本项目 0xC200-0xC2FF）会被程序
// 启动阶段的初始化覆盖，填那里要配合 workflows 里的单 session 脚本；数据区之外的 RAM 跨脚本保持。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_mem_fill.js <ccxml_path> <address> <count> <value> [bit_size]";

// 回读的项数：够看出"填进去了"即可，不必把整段打出来。
const EVIDENCE_COUNT = 4;

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 5 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const address = cli.parseAddress(cli.requiredArg(args.positional, 1, "address", USAGE));
const count = cli.parseInteger(cli.requiredArg(args.positional, 2, "count", USAGE), "count");
const value = cli.parseNumber(cli.requiredArg(args.positional, 3, "value", USAGE), "value");
const bitSize = args.positional.length > 4 ? cli.parseBitSize(args.positional[4], "bit_size") : 16;
if (count < 1) cli.usageError("count must be at least 1", USAGE);
// 与 mem_write 同一条守卫：Memory.fill 在值放不进位宽时是**静默截断**（实测 16 位写 0x1FFFF 存进去是 0xFFFF），
// 于是"填进去的值不是你要的那个"却返回成功——属于硬规则第 4 条禁止的"失败仍返回成功"。
if (value > Math.pow(2, Math.min(bitSize, 53)) - 1) {
    cli.usageError("value " + value + " does not fit in " + bitSize + " bits", USAGE);
}
// 加密线封死（，与 mem_write 同一条）：填充区间覆盖 CSMSCR（0x0AEF）
// 且位宽够得着 bit15 ⇒ 填进去的 FORCESEC=1 会锁死 CSM。
const CSMSCR_WORD = 0x0AEF;
if (bitSize > 8 && address <= CSMSCR_WORD && CSMSCR_WORD < address + count) {
    cli.usageError("fill range covers CSMSCR (0x" + CSMSCR_WORD.toString(16) + "): setting FORCESEC locks the CSM"
        + " — refused by policy", USAGE);
}

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    console.log("Filling " + count + " x " + bitSize + "-bit with 0x" + value.toString(16)
        + " at 0x" + address.toString(16) + "...");
    session.memory.fill(address, count, value, bitSize);
    const probeCount = Math.min(count, EVIDENCE_COUNT);
    const readBack = session.memory.read(address, probeCount, bitSize);
    console.log("Read back: " + readBack.map((v) => "0x" + Number(v).toString(16)).join(" "));
} catch (err) {
    console.error("Memory fill failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
