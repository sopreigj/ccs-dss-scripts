// CCS 20.0.1 脚本：求值并打印一个或多个 C 表达式。
// Usage: run.bat ccs20_0_1_eval_expr.js <ccxml_path> [--symbols <out_file>] <expr1> [expr2 ...]
//
// --symbols 是正经的选项，可以出现在任意位置（原来只在"第一个可选参数位"被识别，
// 写在后面会被当成待求值表达式）。也可以用环境变量 CCS_SYMBOLS。
// 符号名（如固件里的全局变量）必须先有符号表；纯地址表达式（如 *(unsigned short*)0xC000）不需要。
//
// 退出码：**任何一个表达式求值失败就返回 1**。原来失败也返回 0，于是 .bat 里的
// `if %errorlevel% neq 0` 形同虚设，读不到变量却一路绿灯。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = "Usage: run.bat ccs20_0_1_eval_expr.js <ccxml_path> [--symbols <out_file>] <expr1> [expr2 ...]";

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: { "--symbols": { takesValue: true } },
    confFill: ["CCXML"], maxPositional: null,
});
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const exprs = args.positional.slice(1);
if (exprs.length === 0) cli.usageError("missing required argument: expr1", USAGE);

// 命令行优先，其次环境变量。这里要区分"没给 --symbols"、"给了空串"、"给了路径"三种：
// 空串是"给了一个空路径"，不是"不加载符号表"——在 .bat 里 `--symbols "%SYM%"` 遇到没设的变量就是这个样子，
// 静默按"没有符号表"继续跑，会让人以为符号加载过了（与 mem_import 拒收 --binary 下的 <count> 同一口径：
// 不肯定的输入宁可报错，不靠猜）。
const symbolsArg = args.flags["--symbols"];
if (symbolsArg === "") {
    cli.usageError("--symbols needs a non-empty path (omit the option entirely to run without symbols)", USAGE);
}
const symbolsPath = symbolsArg !== undefined ? symbolsArg : (process.env.CCS_SYMBOLS || null);
if (symbolsPath) cli.requireAbsoluteFile(symbolsPath, "symbols file");

let failures = 0;
try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    if (symbolsPath) {
        console.log("Loading symbols: " + symbolsPath);
        ccs.loadSymbols(session, symbolsPath);
    }
    console.log("");
    console.log("==== Expression Evaluation ====");
    for (const expr of exprs) {
        try {
            const value = session.expressions.evaluate(expr);
            // 整型结果是 BigInt。同时给出十六进制与十进制：符号求值（如 "main"）拿到的是地址，
            // 只打十进制没法用；而计数/物理量只打十六进制同样没法看。
            if (typeof value === "bigint") {
                // 负数也要给十六进制：C28x 的有符号量（如 (int)-1）用十进制看是 -1，
                // 用十六进制看才是它在寄存器里的样子（0xFFFFFFFF），缺一半就等于缺了关键信息。
                console.log(expr + " = " + (value >= 0n
                    ? "0x" + value.toString(16) + " (" + value.toString(10) + ")"
                    : "-0x" + (-value).toString(16) + " (" + value.toString(10) + ", negative)"));
            } else {
                console.log(expr + " = " + String(value));
            }
        } catch (err) {
            console.log(expr + " = [evaluation failed: " + err.message + "]");
            failures++;
        }
    }
    console.log("====================");
} catch (err) {
    console.error("Evaluation failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

if (failures > 0) {
    console.error(failures + " of " + exprs.length + " expression(s) failed to evaluate.");
}

ccs.finishQuietly();
process.exit(failures > 0 ? cli.EXIT_FAIL : cli.EXIT_OK);
