// CCS 20.0.1 脚本：把一段目标内存导出到文件。
// Usage: run.bat ccs20_0_1_mem_export.js <ccxml_path> <address> <count> <file>
//                                    [--format "<format>"] [--binary] [--page data]
//   <count>     导出多少个元素；元素的字长由 --format 决定（二进制模式用目标默认字长）
//   <file>      输出文件，必须是**绝对路径**：实测相对路径会被调试器解析到
//               <CCS_ROOT>\ccs\ccs_base\DebugServer\bin 下（与调用者的当前目录无关），
//               既不在仓库也不在 %TEMP%，而日志只回显那个相对名 ⇒ 文件去向不可知
//   --format    文本格式，默认 "16-Bit Hex - TI Style"（实测该格式能被 mem_import 原样读回）
//   --binary    用 saveBinary 导出裸二进制（不写格式头，不能跨字长解释）
//   --page data 访问数据空间（地址写成 0xADDR@DATA 形式），默认程序空间
//
// 为什么需要它：目标里的实际值是唯一的真相，而"在调试器里看一眼"无法留证、无法比较两次运行。
// 导出成文件后可以用 diff/脚本比对，是长期调试与回归的基本手段。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = 'Usage: run.bat ccs20_0_1_mem_export.js <ccxml_path> <address> <count> <file> '
    + '[--format "<format>"] [--binary] [--page data]';

const DEFAULT_FORMAT = "16-Bit Hex - TI Style";

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: {
        "--format": { takesValue: true },
        "--binary": { takesValue: false },
        "--page": { takesValue: true },
    },
    confFill: ["CCXML"], maxPositional: 4,
});
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const address = cli.parseAddress(cli.requiredArg(args.positional, 1, "address", USAGE));
const count = cli.parseInteger(cli.requiredArg(args.positional, 2, "count", USAGE), "count");
const filePath = cli.requireAbsolutePath(cli.requiredArg(args.positional, 3, "file", USAGE), "output file");
const format = args.flags["--format"] || DEFAULT_FORMAT;
const page = args.flags["--page"] || "program";
if (page !== "program" && page !== "data") cli.usageError("--page must be program or data", USAGE);
if (count < 1) cli.usageError("count must be at least 1", USAGE);
// 二进制模式走 saveBinary，既不写格式头也不解释字长，--format 在代码里根本用不到；
// 静默忽略它会让人以为"导出的字长由 --format 决定"，宁可报用法错误（与 mem_import 拒收 --binary 下的 <count> 同一口径）。
if (args.flags["--binary"] && args.flags["--format"]) {
    cli.usageError("--binary does not use --format; give only one of them", USAGE);
}

// DSLocation 语法：程序空间直接写地址，数据空间写 "<addr>@DATA"（实测两种都可用）。
const location = page === "data" ? "0x" + address.toString(16) + "@DATA" : address;

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    if (args.flags["--binary"]) {
        console.log("Exporting " + count + " elements (binary) from " + String(location) + " to " + filePath);
        session.memory.saveBinary(location, count, filePath);
    } else {
        console.log("Exporting " + count + " elements as \"" + format + "\" from " + String(location) + " to " + filePath);
        session.memory.saveData(location, count, filePath, format);
    }
    console.log("Export done.");
} catch (err) {
    console.error("Memory export failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
