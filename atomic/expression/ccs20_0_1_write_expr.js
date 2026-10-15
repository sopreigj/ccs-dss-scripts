// CCS 20.0.1 脚本：执行一个赋值表达式（写变量/寄存器/内存）。
// Usage: run.bat ccs20_0_1_write_expr.js <ccxml_path> [--symbols <out_file>] "<assignment_expr>"
//
// 赋值表达式含空格/括号/等号，**必须**用英文双引号括起来。
// --symbols 可以出现在任意位置（原来只在第一个可选参数位被识别），也可用 CCS_SYMBOLS 环境变量。
//
// 注意（实测）：赋值本身成功不代表值会留到下一个脚本——跨脚本状态不保持；而且如果程序还没跑过
// 启动代码（cinit），写的值会被覆盖。要"写变量→运行→读回"请用
// workflows\ccs20_0_1_load_write_run_read.js（--settle）。见 session/session.js 的会话边界说明。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = 'Usage: run.bat ccs20_0_1_write_expr.js <ccxml_path> [--symbols <out_file>] "<assignment_expr>"';

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: { "--symbols": { takesValue: true } },
    confFill: ["CCXML"], maxPositional: 2,
});
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");
const assignment = cli.requiredArg(args.positional, 1, "assignment_expr", USAGE);

// 命令行优先，其次环境变量；"没给 --symbols"、"给了空串"、"给了路径"是三种情况。
// 空串按用法错误处理：它意味着"给了一个空路径"（`.bat` 里 `--symbols "%SYM%"` 没设变量就是这样），
// 静默当成"不加载符号表"会让人以为符号加载过了；要"不加载符号表"就别给这个选项。
const symbolsArg = args.flags["--symbols"];
if (symbolsArg === "") {
    cli.usageError("--symbols needs a non-empty path (omit the option entirely to run without symbols)", USAGE);
}
const symbolsPath = symbolsArg !== undefined ? symbolsArg : (process.env.CCS_SYMBOLS || null);
if (symbolsPath) cli.requireAbsoluteFile(symbolsPath, "symbols file");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    const session = ccs.openTarget(ccxmlPath);
    if (symbolsPath) {
        console.log("Loading symbols: " + symbolsPath);
        ccs.loadSymbols(session, symbolsPath);
    }
    console.log("Executing assignment: " + assignment);
    // 赋值失败必须抛出（与 eval_expr 的容错循环不同）：写不进去却返回 0 是最危险的失败形态。
    const result = session.expressions.evaluate(assignment);
    console.log("Assignment result: " + result);
} catch (err) {
    console.error("Write failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
