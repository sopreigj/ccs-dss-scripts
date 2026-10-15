// CCS 20.0.1 脚本：读取内存。
// Usage: run.bat ccs20_0_1_mem_read.js <ccxml_path> <address> <bit_size> <count>
//   <address>   必须是带 0x 前缀的十六进制（如 0xC000）
//   <bit_size>  8/16/24/32/40/48/64
//   <count>     读取的元素个数
//
// 地址进制统一由 session/cli.js 定义：**裸数字一律拒绝**。原来的 mem_read 把裸 `8000` 当十进制、
// mem_write 当十六进制，同一个地址写出两个结果，这种歧义在入口消掉。
//
// 输出只给"元素下标 + 值"，**不逐元素推算地址**。早期版本按 `起始地址 + i*(位宽/8)` 打印，
// 那等于先假设一个寻址单位再往外报地址，假设错了就会报出越过区间末尾的地址，看着像读越界。
// 实测：连续三个地址各写一个 16 位值，连续读回时三个值**逐个出现**，所以地址是**字节地址**
// （相邻地址各自承载一个元素，奇数地址也能直接寻址）。既然一个"元素"与一个地址一一对应，
// 打印裸下标就是最诚实的写法：需要地址的调用方自己用 `起始地址 + 下标 * 位宽/8` 算，不必由这里替他假设。
// 位宽也有个坑：端口 B 的 GPBDIR/GPBDAT 是 **32 位**寄存器，用默认的 16 位读只能看到低半段；
// 要读该端口的另一半必须显式给 32。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_mem_read.js <ccxml_path> <address> <bit_size> <count>";

const args = cli.parseArgs(process.argv.slice(3), { usage: USAGE, flags: {}, confFill: ["CCXML"], maxPositional: 4 });
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const address = cli.parseAddress(cli.requiredArg(args.positional, 1, "address", USAGE));
const bitSize = cli.parseBitSize(cli.requiredArg(args.positional, 2, "bit_size", USAGE));
const count = cli.parseInteger(cli.requiredArg(args.positional, 3, "count", USAGE), "count");
if (count < 1) cli.usageError("count must be at least 1", USAGE);

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    const values = session.memory.read(address, count, bitSize);
    console.log("Memory at 0x" + address.toString(16) + " (" + bitSize + "-bit x " + count + ", element index from 0):");
    for (let i = 0; i < count; i++) {
        // 64 位读回来的可能是 BigInt，Number() 会丢精度——所以按类型分开转，不统一走 Number()。
        const hex = typeof values[i] === "bigint" ? values[i].toString(16) : Number(values[i]).toString(16);
        console.log("  [" + i + "] 0x" + hex);
    }
} catch (err) {
    console.error("Memory read failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
