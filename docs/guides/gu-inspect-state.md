# 目标：看目标现在是什么状态

这一类操作**只读**，不改目标。用到的脚本：

| 想知道 | 用哪个脚本 |
|---|---|
| 连得上吗 | `atomic/target/ccs20_0_1_check_connection.js` |
| 目标身份与状态：核名、是否连接、是否停机、PC、可用复位类型、关键调试设置 | `atomic/target/ccs20_0_1_target_state.js` |
| 某个地址上一段内存 | `atomic/memory/ccs20_0_1_mem_read.js` |
| 一个或多个 CPU 寄存器 | `atomic/register/ccs20_0_1_read_reg.js` |
| 一个表达式（变量、外设寄存器域） | `atomic/expression/ccs20_0_1_eval_expr.js` |

## 最重要的一件事：每条命令都是"此刻的活值"

**每条命令自成一个会话**：它连接目标、读、然后释放目标并退出（退出前会把目标停住）。
所以读到的值属于**本次会话开始之后**的那一瞬间，**不是**上一次运行停机那一刻的快照。

这带来一个看起来像 bug 的现象：

> 同一个地址连续 `mem_read` 两次，值不一样（有时还是 0）——**这不是脚本坏了**。
> 如果那个地址是固件在运行中持续改写的变量，两次读本来就该不同。

如果你想要"跑完之后紧接着读"的那个现场，就不要用两条命令，改用一条工作流：

```bat
:: 一个会话内完成：烧录 → 跑 2000 毫秒 → 停机 → 读两个表达式
"%CCS_ROOT%\ccs\scripting\run.bat" workflows\ccs20_0_1_load_run_read.js "<ccxml>" "<out>" 2000 "your_symbol.Var" "PC"
```

也可以在**同一次调用**里读原始内存地址：把地址作为表达式写进表达式列表即可，
前提是同一会话里已经加载过符号表（`loadProgram` 会顺带加载）。

## 按符号名读必须有符号表

单独调用 `eval_expr` 时，符号表不一定在会话里：

- 用 `loadProgram` 烧过一次 → 符号表随程序一起进会话；
- 或者显式给它一个固件文件：

```bat
"%CCS_ROOT%\ccs\scripting\run.bat" atomic\expression\ccs20_0_1_eval_expr.js "<ccxml>" --symbols "<out>" "your_symbol.Var"
```

不带符号表又要按名字求值，就会得到"找不到标识符"。这是**明确的失败**，不是"值是 0"。

## 例：一套只读体检

```bat
:: 在仓库根目录执行。省略路径参数时从配置文件补齐
set RUN=%CCS_ROOT%\ccs\scripting\run.bat

"%RUN%" atomic\target\ccs20_0_1_check_connection.js
"%RUN%" atomic\target\ccs20_0_1_target_state.js
"%RUN%" atomic\register\ccs20_0_1_read_reg.js PC
"%RUN%" atomic\memory\ccs20_0_1_mem_read.js 0xC000 16 4
```

`target_state` 会额外报告几件容易看错的事：

- **核名那一行来自目标配置文件的身份，不是探测出来的**。用 v2 的配置连 v1 的探针，
  它照样显示配置里写的型号。别用它判断"手上插的是哪个仿真器"。
- 它报告的调试设置（例如连接时是否自动复位）是**当前会话读到的值**，不是配置承诺。
  注意这个设置的值本身**不能解释**"连接时目标到底发生了什么"——那是另一件事。
  实测结论是**连接不复位 RAM**（判据与结果见
  [`../reference/ref-api-scripting.md`](../reference/ref-api-scripting.md) 的"已经实测确认的行为"一节）。

## 关于地址

地址必须带 `0x` 前缀。裸数字会被拒绝而不是猜。

内存读取的位宽可以是 8 / 16 / 24 / 32 / 40 / 48 / 64 位，具体参数位置见
[`../reference/ref-scripts.md`](../reference/ref-scripts.md)。

## 下一步

- 要改东西：[`gu-modify-state.md`](gu-modify-state.md)
- 要在运行中抓现场：[`gu-debug-target.md`](gu-debug-target.md)
- 想写进流水线：[`gu-pipelines-ci.md`](gu-pipelines-ci.md)
