# 速查表

三张表，按你手上的问题选一张。

---

## 表 1：意图 → 用哪条命令

| 我想…… | 命令 |
|---|---|
| 确认连得上 | `atomic/target/ccs20_0_1_check_connection.js` |
| 看目标现在什么状态 | `atomic/target/ccs20_0_1_target_state.js` |
| 把固件装进去 | `atomic/program/ccs20_0_1_load_program.js` |
| 确认目标里的固件和文件一致 | `atomic/program/ccs20_0_1_verify_program.js` |
| 让目标跑 | `atomic/target/ccs20_0_1_target_run.js` |
| 让它跑一会儿再停 | `atomic/target/ccs20_0_1_run_for_ms.js` |
| 把它停住 | `atomic/target/ccs20_0_1_target_halt.js` |
| 复位它 | `atomic/target/ccs20_0_1_target_reset.js` |
| 读一段内存 | `atomic/memory/ccs20_0_1_mem_read.js` |
| 往地址写一个值 | `atomic/memory/ccs20_0_1_mem_write.js` |
| 把一段内存填成同一个值 | `atomic/memory/ccs20_0_1_mem_fill.js` |
| 导出 / 导入内存 | `atomic/memory/ccs20_0_1_mem_export.js` / `ccs20_0_1_mem_import.js` |
| 读 / 写 CPU 寄存器 | `atomic/register/ccs20_0_1_read_reg.js` / `ccs20_0_1_write_reg.js` |
| 求一个表达式的值 | `atomic/expression/ccs20_0_1_eval_expr.js` |
| 执行一个赋值 | `atomic/expression/ccs20_0_1_write_expr.js` |
| 看 flash 支持哪些操作 | `atomic/program/ccs20_0_1_flash_op.js --list` |
| 执行 flash 操作 | `atomic/program/ccs20_0_1_flash_op.js --op "<操作>"` |
| **烧录后跑一会儿再读一个值** | `workflows/ccs20_0_1_load_run_read.js` |
| **烧录后让它一直跑** | `workflows/ccs20_0_1_load_run.js` |
| **写一个值再运行、确认写住了** | `workflows/ccs20_0_1_load_write_run_read.js` |
| 跑到某个位置 | `workflows/ccs20_0_1_run_to_bp.js` |
| 单步 | `workflows/ccs20_0_1_step.js` |
| 看是谁在改这个变量 | `workflows/ccs20_0_1_watch_write.js` |
| 定期采样几个表达式 | `workflows/ccs20_0_1_sample_exprs.js` |
| 驱动一个空闲引脚 | `workflows/ccs20_0_1_pin_drive.js` |

**看不懂就记一句**："要连续动作 → `workflows/`；其余 → `atomic/`"。

> **要组合它们、或者要自己建一层** → 看
> [`../guides/gu-compose-your-own.md`](../guides/gu-compose-your-own.md)：
> 该用什么、能不能拆、你自己的脚本放哪、叫什么。

> 另一套实现还多一个"在断点上挂写动作"的工作流——**本栈没有这个能力**，
> 见 [`ref-stack-differences.md`](ref-stack-differences.md)。

---

## 表 2：现象 → 怎么办

| 现象 | 大概率原因 | 怎么办 |
|---|---|---|
| 退出码 1，输出里说参数形状不对 | PowerShell 把引号吃掉了（拼 `cmd /c` 时） | 直接用 `cmd`，或让表达式从环境变量进来 |
| 找不到运行器 / `CCS_ROOT not configured` | `CCS_ROOT` 不对 | 检查配置文件；注意 `CCS20_0_1_ROOT` 只决定运行器在哪 |
| 连不上、`Error -151` 一类 | 板子/探针/配置三者不一致 | [`../start/setup.md`](../start/setup.md) 第 5 节 |
| 读变量报 `identifier not found` | 会话里没有符号表 | 先装载程序，或给脚本 `--symbols` |
| 写完读回还是旧值 | 程序启动初始化把值覆盖了 | 用 `--settle` 让它先跑过去，见 [`../guides/gu-modify-state.md`](../guides/gu-modify-state.md) |
| 同一地址两次读值不同 | 那是固件在持续写的变量 | 这是预期行为；要固定现场就用工作流 |
| 单步失败 | 目标没停机，或没有符号信息 | 先停机；源码级单步需要符号表 |
| 断点设了但"运行"没停过去 | 目标本来就停在该位置 | 这是正常路径，看报告的 PC 是否等于断点地址 |
| 流水线第一步之后什么都没发生，退出码还是 0 | 漏写了 `call` | 每个链式调用都写 `call` |
| 延时被跳过 | 用了 `timeout /t` 而标准输入被重定向 | 改用固定次数的 `ping` |
| 双击 `.vbs` 卡住 | 完成提示是弹窗，没人点就一直等 | 无人值守场景直接调 `.js` |
| `Cannot find module ...` | 不在仓库内执行，或共享库被挪走 | 从仓库内执行；`.js` 与 `.vbs` 成对保留 |
| `PIPELINE_VERDICT=FAIL` 但看不出哪一步 | fail-fast，第一步就停了 | 看它前面那几行的 `STEP_VERDICT` |

更细的排障见 [`../guides/gu-troubleshooting.md`](../guides/gu-troubleshooting.md)。

---

## 表 3：参数怎么传

| 场景 | 怎么写 |
|---|---|
| 普通参数（地址、数字、文件名） | 直接写在命令行上；地址带 `0x`，路径用绝对路径 |
| 含空格或 `=` 的表达式 | **可以直接写在命令行上**（本栈运行器原样透传） |
| 在 PowerShell 里拼 `cmd /c "..."` | 引号会被 PowerShell 先处理一遍：要么改用环境变量，要么直接用 `cmd` |
| 想避免每次拼长参数 | 用环境变量：`CCS_WRITE_EXPR` / `CCS_EVAL_EXPR` / `CCS_SYMBOLS` |

| 脚本 | 认哪个环境变量 |
|---|---|
| `load_run_read` | `CCS_EVAL_EXPR` |
| `load_write_run_read` | `CCS_WRITE_EXPR`（写）/ `CCS_EVAL_EXPR`（读） |
| `eval_expr` / `write_expr` | `CCS_SYMBOLS`（符号表） |

> **与另一套实现的差异**：那边运行器会吃含 `=` 或空格的参数，所以"必须走环境变量"。
> 在本栈这只是**可选做法**（除了 PowerShell 拼 `cmd` 的场合）。见
> [`ref-stack-differences.md`](ref-stack-differences.md)。
