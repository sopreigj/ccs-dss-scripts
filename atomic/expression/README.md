# `atomic/expression/` — 表达式

管的是**按符号或表达式**访问目标。

| 脚本 | 一句话 |
|---|---|
| `ccs20_0_1_eval_expr.js` | 求值并打印一个或多个表达式 |
| `ccs20_0_1_write_expr.js` | 执行一个赋值表达式 |

每个脚本都配同名 `.vbs`。逐参数说明见
[`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) 的 `atomic/expression/` 一节。

**按符号名求值需要符号表**：装载程序时会带进来，或者显式指定固件文件（`--symbols`）。
没有符号表就按名字求值会得到"找不到标识符"——那是明确的失败，不是"值是 0"。

**赋值就是求值一个赋值表达式**：本技术栈没有独立的赋值接口。

**表达式含空格或 `=` 时可以直接写在命令行上**（本栈运行器原样透传）；
但如果是在 PowerShell 里拼 `cmd /c`，引号可能被 PowerShell 先处理掉，见
[`../../docs/reference/ref-decision-tables.md`](../../docs/reference/ref-decision-tables.md) 表 3。
