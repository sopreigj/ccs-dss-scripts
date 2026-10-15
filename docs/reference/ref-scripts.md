# 脚本参数手册

每一节给出脚本的用法；命令前缀统一写成运行器加脚本路径。路径都相对仓库根目录。

## 通用约定（所有脚本一致）

### 成败：退出码 + 输出里的原因

- 退出码 `0` = 成功；`1` = 任何失败（用法错误、文件不存在、会话失败、操作失败）；
- **失败原因在输出里**，不在退出码里；
- 本技术栈的运行器会把脚本的退出状态透传出来，所以退出码是可靠的判据。

> 这与另一套实现**相反**（那边退出码不可靠、改看 stdout 标记行），
> 见 [`ref-stack-differences.md`](ref-stack-differences.md)。

### 地址必须带 `0x`

裸数字会被拒绝，不替你猜进制。

### 路径必须绝对

**输入与输出都一样**。相对路径会被解析到与调用者无关的地方，导致"文件写到哪去了"不可知。
脚本要求绝对路径，并会明确报错。

### 位置参数与选项

- 位置参数顺序固定：先目标配置，再固件，然后是该脚本自己的参数；
- 选项一律 `--名字 值`，可以出现在任意位置；
- 每个脚本声明它接受多少个位置参数，**多余的会被拒绝**，不是静默忽略。

### 必须经运行器调用

运行器会在命令行里插入脚本名，脚本自己从第 3 个位置起读参数。
直接 `node <脚本>` 调用会让第一个参数被吃掉。所有命令都从仓库根目录执行。

### 收尾行为

每个脚本在退出前都会把目标停住（个别脚本刻意让目标继续运行，见各节说明）。

### `.vbs` 启动器

双击时逐项弹框问参数；带参数调用则不弹框，参数顺序与同名 `.js` 完全一致；
启动器会把工作目录钉到仓库根，并按退出码判定成败、把失败原因显示出来。

**本技术栈没有"完全不弹框"的开关**——无人值守场景请直接调 `.js`。

### 可用的环境变量

| 变量 | 用途 |
|---|---|
| `CCS20_0_1_ROOT` | 运行器位置（只对 `.vbs` 启动器有意义，且只影响 `CCS_ROOT`） |
| `CCS_CCXML` / `CCS_OUT` | 目标配置 / 固件的默认值 |
| `CCS_EVAL_EXPR` | 默认求值表达式（`;` 分隔） |
| `CCS_WRITE_EXPR` | 默认赋值表达式 |
| `CCS_SYMBOLS` | 符号表路径 |

参数的引号处理：本栈运行器透传参数，命令行里可以直接写含空格与 `=` 的表达式；
**但在 PowerShell 里拼 `cmd /c` 时要小心引号被 PowerShell 先处理一遍**，见
[`ref-decision-tables.md`](ref-decision-tables.md)。

---

# 原子脚本（18 个）

## `atomic/target/` — 连接与运行控制

### `ccs20_0_1_check_connection.js <ccxml_path>`

连接目标并报告结果。最小的一次健康检查。

### `ccs20_0_1_target_state.js <ccxml_path>`

报告目标身份与状态：核名、是否连接、是否停机、PC、可用复位类型、若干关键调试设置。

**注意**：核名一行来自目标配置文件的身份声明，**不是探测结果**——用 v2 的配置连 v1 的探针
也会显示 v2。判断手上插的是哪个仿真器要人工对账，见 [`../start/setup.md`](../start/setup.md)。

### `ccs20_0_1_target_run.js <ccxml_path>`

让目标继续运行，然后释放会话（**目标会保持运行**）。这是少数刻意不停机的脚本。

### `ccs20_0_1_target_halt.js <ccxml_path>`

把目标停住。注意停机只在本次会话内有效，会话一释放目标就自由运行了。

### `ccs20_0_1_target_reset.js <ccxml_path> [--list | --kind "<复位类型名>"]`

复位目标。复位类型名不能在代码里枚举，只能运行时问目标，所以 `--list` 是这个脚本的一半用途。

不传 `--kind` 时使用目标的默认复位。**默认复位的落点不是"程序入口"**：要"复位后停在程序入口"
应该用 `workflows/ccs20_0_1_run_to_bp.js`。

### `ccs20_0_1_run_for_ms.js <ccxml_path> <milliseconds>`

让目标运行 N 毫秒后停住，并报告运行前后的 PC。

## `atomic/program/` — 程序与 flash

### `ccs20_0_1_load_program.js <ccxml_path> <out_file_path>`

把固件装进目标，**不运行**（装完通常停在程序入口）。同时把符号表带进会话。

### `ccs20_0_1_verify_program.js <ccxml_path> <out_file_path>`

只读地校验目标里的内容与固件文件是否一致（读回比对，不烧录）。用于回答"上次烧进去了吗"。

### `ccs20_0_1_flash_op.js <ccxml_path> --list`

列出目标支持的 flash 操作名。

### `ccs20_0_1_flash_op.js <ccxml_path> --op "<操作>" [--op "<操作>" ...] [--set <属性>=<值> ...]`

执行 flash 操作。**操作名本身不带任何参数**：擦哪些扇区、密码写什么、频率测试用哪个引脚，
全部来自**当时的属性值**，所以后果由属性决定，不由操作名决定。脚本在动手前会把生效中的属性打印出来。

- `--op` 可重复，多个操作按给出顺序在**同一个会话**内执行。
- `--set` 可以配合 `--op` 改写该操作要用的属性，从而做到"只擦某几个扇区"这类精细操作。
- **被主动拒绝的操作**：写芯片安全模块密码的操作，以及它的"上膛"动作（单独设置密码键）。
  拒绝发生在**打开会话之前**，不碰硬件、可离线复测。理由是一旦生效就不可恢复。
- 有一个操作会置位安全模块里的锁定位，可逆性**未证明**；脚本保留它，但执行前打警告。

## `atomic/memory/` — 内存

### `ccs20_0_1_mem_read.js <ccxml_path> <address> <bit_size> <count>`

读一段内存。位宽可取 8 / 16 / 24 / 32 / 40 / 48 / 64。
读到的是**本会话开始之后**的活值，不是上次停机的快照——见
[`../guides/gu-inspect-state.md`](../guides/gu-inspect-state.md)。

### `ccs20_0_1_mem_write.js <ccxml_path> <address> <value> [bit_size]`

写一个值到地址。值放不进去时会报用法错误，而不是静默截断。
覆盖安全寄存器地址且位宽够得着的写入被拒绝（见上面 `flash_op` 的说明）。

### `ccs20_0_1_mem_fill.js <ccxml_path> <address> <count> <value> [bit_size]`

把一段内存填成同一个值。与逐字写相比更快，也避免手写循环出错。
与 `mem_write` 同一条安全守卫。

### `ccs20_0_1_mem_export.js <ccxml_path> <address> <count> <file> [--format ...] [--binary] [--page data] [--append]`

把一段内存导出到文件。格式与落点见 [`ref-file-formats.md`](ref-file-formats.md)。

### `ccs20_0_1_mem_import.js <ccxml_path> <address> <count> <file> [--page data]`

### `ccs20_0_1_mem_import.js <ccxml_path> <address> <file> --binary [--page data]`

把文件内容导入目标内存。文本形与二进制形的位置参数个数不同；**二进制形不接受个数参数**
（整个文件都会导入），给了会明确报错，而不是让人以为它限制了长度。

## `atomic/register/` — 寄存器

### `ccs20_0_1_read_reg.js <ccxml_path> <register1> [register2 ...]`

读一个或多个 CPU 寄存器。

### `ccs20_0_1_write_reg.js <ccxml_path> <register> <value>`

写一个 CPU 寄存器。**写完回读不一定相等**：有些寄存器有被硬件强制的位或只读位。
所以它不把"写进去与读回来不同"当作失败，这是刻意的。外设寄存器属于内存映射，用
`mem_write` 或表达式赋值来写。

## `atomic/expression/` — 表达式

### `ccs20_0_1_eval_expr.js <ccxml_path> [--symbols <out_file>] <expr1> [expr2 ...]`

求值并打印一个或多个表达式。按符号名求值必须让会话里有符号表
（`loadProgram` 会带，或显式 `--symbols`）。

### `ccs20_0_1_write_expr.js <ccxml_path> [--symbols <out_file>] "<赋值表达式>"`

执行一个赋值表达式。**任意一个表达式失败就是整体失败**，退出码为 1 并给出失败个数。

---

# 工作流脚本（8 个，只有 `.js`）

工作流把多步放进**一个会话**。原因见 [`../guides/gu-flash-and-run.md`](../guides/gu-flash-and-run.md)。

### `workflows/ccs20_0_1_load_run.js <ccxml_path> <out_file_path>`

装载后**让它一直跑**，随后释放会话。刻意不停机。

它会先问目标当前是否停机，只有确实停机时才发出"运行"；如果目标在装载后已经在跑，
它如实报告而不是再发一次运行——因为这个脚本的承诺是"在跑"，不是"跑过一次"。

### `workflows/ccs20_0_1_load_run_read.js <ccxml_path> <out_file_path> <run_ms> [expr1] [expr2 ...]`

装载 → 跑 N 毫秒 → 停机 → 求值若干表达式。表达式列表**可以整体省略**（退化成只报停机 PC），
也可以用环境变量 `CCS_EVAL_EXPR` 传。

### `workflows/ccs20_0_1_load_write_run_read.js <ccxml_path> <out_file_path> <run_ms> [--settle <ms>] [--set "<赋值>"]... [--read "<表达式>"]...`

装载 → 等一段（`--settle`）→ 写 → 跑 N 毫秒 → 回读。写作与读列表都可以走环境变量
`CCS_WRITE_EXPR` / `CCS_EVAL_EXPR`。

**它是"写入真的生效了吗"这个问题的答案**：赋值报告没有报错，不代表值留住了。

### `workflows/ccs20_0_1_run_to_bp.js <ccxml_path> <out_file_path> <location> [--symbols-only] [--timeout <ms>]`

设断点并运行到它。目标已经停在该位置时算作已到达（正常路径）。
停机但位置不对时**不算命中**，如实报告。`--symbols-only` 表示只加载符号表，不装载程序。

### `workflows/ccs20_0_1_step.js <ccxml_path> <out_file_path> <count> [--from <位置>] [--kind into|over|out|asm] [--timeout <ms>]`

单步 N 次并打印每次的 PC。目标必须已停机。

### `workflows/ccs20_0_1_watch_write.js <ccxml_path> <out_file_path> <address> [--read] [--skip <n>] [--timeout <ms>]`

硬件数据观察点。跑到"某条指令写了这个地址"时停住，报告的 PC 就是那条指令。
`--skip <n>` 跳过前 n 次触发。

### `workflows/ccs20_0_1_sample_exprs.js <ccxml_path> <out_file_path> <interval_ms> <count> <csv_file> <expr1> [expr2 ...]`

按间隔采样若干表达式并写 CSV。**不会停住目标**；每一行的时间列是实测值。
CSV 路径必须绝对。表达式列表可走 `CCS_EVAL_EXPR`。

### `workflows/ccs20_0_1_pin_drive.js <ccxml_path> [--pin <名字>] [--level high|low|toggle] [--hold <ms>]`

把一个**空闲引脚**配成输出、给电平、可保持一段时间，然后恢复复位默认值。
只允许驱动"已知空闲"的引脚（有硬件上接线的引脚会被外部信号拉扯）。
如果该引脚的复用配置已经被固件占用，脚本在**第一次写之前**就拒绝，所以被拒绝的那次运行不留痕迹。

> **本仓库没有"在断点上挂写动作"那个工作流**：本技术栈没有对应能力。
> 这是两套实现之间少数无法镜像的差异之一，见
> [`ref-stack-differences.md`](ref-stack-differences.md)。

---

# 共用库

- `session/session.js` — 会话生命周期与状态管理。
- `session/cli.js` — 参数解析与校验。
- `session/conf.js` — 配置文件解析。
- `session/orch_driver.js` — 编排层驱动门面。

对脚本作者公开的成员与契约见 [`../dev/dev-session-layer.md`](../dev/dev-session-layer.md)。

# 相关文档

- 配置键与优先级：[`ref-configuration.md`](ref-configuration.md)
- 意图 → 入口的速查表：[`ref-decision-tables.md`](ref-decision-tables.md)
- 原子层的分类理由：[`ref-atomic-scripts.md`](ref-atomic-scripts.md)
- 接口能力边界：[`ref-api-scripting.md`](ref-api-scripting.md)
