# 目标：烧录、运行、读回来

## 为什么这三步必须写在一个脚本里

它们**看起来**可以是三条命令：

```bat
run.bat atomic\program\ccs20_0_1_load_program.js      "<ccxml>" "<out>"   :: 只烧录，不运行
run.bat atomic\target\ccs20_0_1_target_run.js         "<ccxml>"          :: 让它跑
run.bat atomic\expression\ccs20_0_1_eval_expr.js      "<ccxml>" "<expr>"  :: 读一个变量
```

但这样是错的，原因是**会话就是状态的边界**：

- 每一次调用都**新开一个调试会话**，会话结束时目标被释放；而下一次调用连上目标时，
  目标的运行状态、符号表、断点、外设配置都不会保持。
- 于是"烧录"与"运行"之间隔了一次断开连接，"运行"与"读值"之间又隔了一次
  ——第三步读到的不是你刚才那次运行留下的现场。

结论：**要连续的现场，就用 `workflows/` 里的脚本**，它们把多步放进一个会话。

> 想自己验证这条结论：先烧录并运行，再单独调一次读值脚本，比较读到的值与你预期的是否一致。
> 现象是"读到的是另一个时刻的值"。这就是为什么跨脚本传状态在本项目里被当作不成立。

## 三个现成的脚本

| 你的目标 | 用哪个 | 参数 |
|---|---|---|
| 烧录后**让它一直跑**，立刻释放会话 | `workflows/ccs20_0_1_load_run.js` | `<ccxml> <out>` |
| 烧录 → 跑 N 毫秒 → 停机 → 读若干表达式 | `workflows/ccs20_0_1_load_run_read.js` | `<ccxml> <out> <run_ms> [表达式...]` |
| 烧录 → **写**若干表达式 → 跑 N 毫秒 → **读回** | `workflows/ccs20_0_1_load_write_run_read.js` | `<ccxml> <out> <run_ms> [--settle <ms>] [--set "赋值"]... [--read "表达式"]...` |

第二个脚本的表达式列表可以**整体省略**：那样它退化成"纯烧录 → 跑 N 毫秒 → 停机"，
只报告停机时的 PC，不读任何值。这在"我只要确认它跑起来了"时很有用。

### 例：烧录、跑 2 秒、读一个变量

```bat
"%CCS_ROOT%\ccs\scripting\run.bat" workflows\ccs20_0_1_load_run_read.js "<ccxml>" "<out>" 2000 "your_symbol.Var" "PC"
```

输出会依次告诉你：连上了、烧进去了、从哪个 PC 开始跑、停了、停机时的 PC、然后是每个表达式的值。

### 例：写一个变量再运行，验证写入有没有生效

```bat
"%CCS_ROOT%\ccs\scripting\run.bat" workflows\ccs20_0_1_load_write_run_read.js "<ccxml>" "<out>" 2000 --settle 500 --set "your_symbol.Var = 1" --read "your_symbol.Var"
```

**`--settle` 是关键**。刚烧录完就写变量、然后立刻运行，读回往往是你写之前的旧值——
因为程序启动阶段的初始化把这个变量重新赋了一遍。先让程序跑 500 毫秒（`--settle 500`）
把启动阶段跑过去，再写，值就留得住。完整原理见
[`gu-modify-state.md`](gu-modify-state.md)。

> 在 PowerShell 里拼这条命令时注意引号会被 PowerShell 先处理一遍；最稳的做法是把表达式
> 放进环境变量（脚本也认 `CCS_WRITE_EXPR` / `CCS_EVAL_EXPR`），或者直接用 `cmd` 执行。

## 直接用 `examples/` 里的示例

`examples/` 下有 5 个 `.bat`，可以直接照抄：

| 文件 | 演示什么 |
|---|---|
| `load_and_run.bat` | 烧录并让它跑起来（一个会话） |
| `load_set_run_read.bat` | 烧录 → 写变量 → 运行 → 读回 |
| `breakpoint_step.bat` | 断点、单步、观察点各来一次 |
| `run_one_step.bat` | **判定原语**：包住任意一条命令，把它翻译成一行判定 |
| `pipeline_template.bat` | 流水线骨架：你把步骤列表填进去就是一条流水线 |

这些示例都从配置文件读默认值，参数顺序与同名脚本一致。它们的细节见
[`../dev/dev-examples-layer.md`](../dev/dev-examples-layer.md)。

## 失败长什么样

- 任一步骤失败 → 脚本以 **1** 退出，原因在输出里；
- 用 `run_one_step.bat` 包起来时，你会看到 `STEP_VERDICT=FAIL`；
- 用 `pipeline_template.bat` 时，最后一行是 `PIPELINE_VERDICT=FAIL`，且**第一步就停**（fail-fast）。

找不到原因时，先确认退出码与输出的关系：本栈的退出码**是**可靠的，所以"退出码 1 但输出里
只有正常信息"通常意味着失败发生在很早的阶段（如参数校验），去看输出的前几行。

## 下一步

- 只看状态、不改任何东西：[`gu-inspect-state.md`](gu-inspect-state.md)
- 改寄存器 / 内存 / 变量：[`gu-modify-state.md`](gu-modify-state.md)
- 断点、单步、观察点：[`gu-debug-target.md`](gu-debug-target.md)
