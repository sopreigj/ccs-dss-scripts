// CCS 20.0.1 脚本：把文件内容导入目标内存。
// Usage: run.bat ccs20_0_1_mem_import.js <ccxml_path> <address> <count> <file> [--page data]
//        run.bat ccs20_0_1_mem_import.js <ccxml_path> <address> <file> --binary [--page data]
//   <count>     导入多少个元素；文本格式必需（loadData 的签名要求长度），--binary 时**不接受**该参数
//   --binary    用 loadBinary 读裸二进制（loadBinary **不能烧 flash**，也不会自动停机；
//               flash 以外的页可以写——早前写成"不能写 program 页"是把限制讲错了），
//               此时整个文件都会被导入，回读固定 4 项作为证据
//   --page data 写入数据空间（地址写成 0xADDR@DATA 形式），默认程序空间
//
// 与 ccs20_0_1_load_program.js 的区别：那个是 program load（可烧 flash、会清符号、默认跑到 main），
// 这个只是"往内存里灌数据"（loadData/loadBinary），不碰 flash、不改符号、不动 PC。
// 导入后回读前若干项作为证据。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_mem_import.js <ccxml_path> <address> <count> <file> [--page data]\n"
    + "       run.bat ccs20_0_1_mem_import.js <ccxml_path> <address> <file> --binary [--page data]";

const EVIDENCE_COUNT = 4;

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: {
        "--binary": { takesValue: false },
        "--page": { takesValue: true },
    },
    // 两种形态的位置参数个数不同（文本 4 个、二进制 3 个），这里声明较大的那个交给共用检查，
    // 再按模式收紧到 3：给 --binary 传 <count> 只会让人以为它限制了导入长度（其实整个文件都会导入），
    // 所以宁可报用法错误——这是"猜"与"说清楚"的分界（本仓库硬规则：宁可报用法错误，不替用户猜）。
    confFill: ["CCXML"], maxPositional: 4,
});
const isBinary = !!args.flags["--binary"];
if (isBinary && args.positional.length > 3) {
    cli.usageError("--binary does not take <count>; write: <ccxml_path> <address> <file> --binary", USAGE);
}
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const address = cli.parseAddress(cli.requiredArg(args.positional, 1, "address", USAGE));
const filePath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, isBinary ? 2 : 3, "file", USAGE), "input file");
// 二进制的 count 只决定"回读几项当证据"；文本格式的 count 是真实导入长度，必须由调用者给出。
const count = isBinary ? EVIDENCE_COUNT : cli.parseInteger(cli.requiredArg(args.positional, 2, "count", USAGE), "count");
const page = args.flags["--page"] || "program";
if (page !== "program" && page !== "data") cli.usageError("--page must be program or data", USAGE);
if (count < 1) cli.usageError("count must be at least 1", USAGE);

const location = page === "data" ? "0x" + address.toString(16) + "@DATA" : address;

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    if (isBinary) {
        console.log("Importing (binary) " + filePath + " -> " + String(location) + " (entire file)");
        session.memory.loadBinary(location, filePath);
    } else {
        console.log("Importing " + filePath + " -> " + String(location) + " (" + count + " elements)");
        session.memory.loadData(location, count, filePath);
    }
    // 文本格式的字长由文件头决定，这里用最通用的 16 位回读做证据；二进制模式同样如此。
    const readBack = session.memory.read(location, Math.min(count, EVIDENCE_COUNT), 16);
    console.log("Read back: " + readBack.map((v) => "0x" + Number(v).toString(16)).join(" "));
} catch (err) {
    console.error("Memory import failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
