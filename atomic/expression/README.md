# `atomic/expression/` — 表达式

管的是**按符号或表达式**访问目标。

| 脚本 | 一句话 |
|---|---|
| `ccs12_2_0_eval_expr.js` | 求值并打印一个或多个表达式 |
| `ccs12_2_0_write_expr.js` | 执行一个赋值表达式 |

每个脚本都配同名 `.vbs`。逐参数说明见
[`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) 的 `atomic/expression/` 一节。

**按符号名求值需要符号表**：装载程序时会带进来，或者显式指定固件文件（`--symbols`）。
没有符号表就按名字求值会得到"找不到标识符"——那是明确的失败，不是"值是 0"。

**赋值就是求值一个赋值表达式**：本技术栈没有独立的赋值接口。

**表达式里有 `=` 或空格时不要直接写在命令行上**：底层运行器会在解析阶段中止。
走环境变量通道，见
[`../../docs/reference/ref-decision-tables.md`](../../docs/reference/ref-decision-tables.md) 表 3。
