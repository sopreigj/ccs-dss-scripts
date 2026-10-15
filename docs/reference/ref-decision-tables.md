# 速查表

三张表，按你手上的问题选一张。

---

## 表 1：意图 → 用哪条命令

| 我想…… | 命令 |
|---|---|
| 确认连得上 | `atomic/target/ccs12_2_0_check_connection.js` |
| 看目标现在什么状态 | `atomic/target/ccs12_2_0_target_state.js` |
| 把固件装进去 | `atomic/program/ccs12_2_0_load_program.js` |
| 确认目标里的固件和文件一致 | `atomic/program/ccs12_2_0_verify_program.js` |
| 让目标跑 | `atomic/target/ccs12_2_0_target_run.js` |
| 让它跑一会儿再停 | `atomic/target/ccs12_2_0_run_for_ms.js` |
| 把它停住 | `atomic/target/ccs12_2_0_target_halt.js` |
| 复位它 | `atomic/target/ccs12_2_0_target_reset.js` |
| 读一段内存 | `atomic/memory/ccs12_2_0_mem_read.js` |
| 往地址写一个值 | `atomic/memory/ccs12_2_0_mem_write.js` |
| 把一段内存填成同一个值 | `atomic/memory/ccs12_2_0_mem_fill.js` |
| 导出 / 导入内存 | `atomic/memory/ccs12_2_0_mem_export.js` / `ccs12_2_0_mem_import.js` |
| 读 / 写 CPU 寄存器 | `atomic/register/ccs12_2_0_read_reg.js` / `ccs12_2_0_write_reg.js` |
| 求一个表达式的值 | `atomic/expression/ccs12_2_0_eval_expr.js` |
| 执行一个赋值 | `atomic/expression/ccs12_2_0_write_expr.js` |
| 看 flash 支持哪些操作 | `atomic/program/ccs12_2_0_flash_op.js --list` |
| 执行 flash 操作 | `atomic/program/ccs12_2_0_flash_op.js --op "<操作>"` |
| **烧录后跑一会儿再读一个值** | `workflows/ccs12_2_0_load_run_read.js` |
| **烧录后让它一直跑** | `workflows/ccs12_2_0_load_run.js` |
| **写一个值再运行、确认写住了** | `workflows/ccs12_2_0_load_write_run_read.js` |
| 跑到某个位置 | `workflows/ccs12_2_0_run_to_bp.js` |
| 单步 | `workflows/ccs12_2_0_step.js` |
| 看是谁在改这个变量 | `workflows/ccs12_2_0_watch_write.js` |
| 在断点上挂一个写动作 | `workflows/ccs12_2_0_bp_write_action.js` |
| 定期采样几个表达式 | `workflows/ccs12_2_0_sample_exprs.js` |
| 驱动一个空闲引脚 | `workflows/ccs12_2_0_pin_drive.js` |

**看不懂就记一句**："要连续动作 → `workflows/`；其余 → `atomic/`"。

> **要组合它们、或者要自己建一层** → 看
> [`../guides/gu-compose-your-own.md`](../guides/gu-compose-your-own.md)：
> 该用什么、能不能拆、你自己的脚本放哪、叫什么。

---

## 表 2：现象 → 怎么办

| 现象 | 大概率原因 | 怎么办 |
|---|---|---|
| 输出里**一行标记都没有** | 参数里的 `=` 或空格把 cmd 弄崩，运行时根本没起来 | 走环境变量通道，见[表 3](#表-3参数里的特殊字符怎么传) |
| `... was unexpected at this time`、退出码 255 | 同上 | 同上 |
| `session/session.js not found above` | 不在仓库内执行 | 在仓库根（或任意子目录）执行 |
| `Cannot find dss.bat` | `ccs_root` 不对 | 检查配置文件；或用 `.vbs` 相应用的环境变量 |
| 连不上、`Error -151` 一类 | 板子/探针/配置三者不一致 | [`../start/setup.md`](../start/setup.md) 第 5 节 |
| 读变量报 `identifier not found` | 会话里没有符号表 | 先装载程序，或给脚本 `--symbols` |
| 写完读回还是旧值 | 程序启动初始化把值覆盖了 | 用 `--settle` 让它先跑过去，见 [`../guides/gu-modify-state.md`](../guides/gu-modify-state.md) |
| 同一地址两次读值不同 | 那是固件在持续写的变量 | 这是预期行为；要固定现场就用工作流 |
| 单步失败 | 目标没停机，或没有符号信息 | 先停机；源码级单步需要符号表 |
| 断点设了但"运行"没停过去 | 目标本来就停在该位置 | 这是正常路径，看报告的 PC 是否等于断点地址 |
| 中文乱码 / 解析错位 | 代码文件里有非 ASCII | 代码保持 ASCII，中文只进 `.md` |
| stderr 有运行时日志噪音（如日志库的警告） | 与成败无关 | 忽略它，看标记行 |
| 双击 `.vbs` 卡住 | 完成提示是弹窗，没人点就一直等 | 设非交互环境变量；自动化直接调 `.js` |
| `PIPELINE_VERDICT=FAIL` 但看不出哪一步 | fail-fast，第一步就停了 | 看它前面那几行的 `STEP_VERDICT` |

更细的排障见 [`../guides/gu-troubleshooting.md`](../guides/gu-troubleshooting.md)。

---

## 表 3：参数里的特殊字符怎么传

**规则**：给底层运行器的参数里**不要出现 `=` 或空格**，否则 cmd 在解析阶段中止，运行时根本起不来。

| 你要传的东西 | 怎么写 |
|---|---|
| 一个赋值表达式（含 `=` 和空格） | `set CCS_WRITE_EXPR=你的表达式`，然后只给脚本位置参数 |
| 一个求值表达式（含空格） | `set CCS_EVAL_EXPR=你的表达式`（多个用 `;` 分隔） |
| 符号表路径（含空格） | `set CCS_SYMBOLS=路径` |
| 一个纯地址或纯数字 | 直接写在命令行上（如 `0xC000`、`2000`） |
| 一个不含空格与 `=` 的表达式 | 可以直接写在命令行上 |

对应脚本：

| 脚本 | 认哪个环境变量 |
|---|---|
| `load_run_read` | `CCS_EVAL_EXPR` |
| `load_write_run_read` | `CCS_WRITE_EXPR`（写）/ `CCS_EVAL_EXPR`（读） |
| `eval_expr` / `write_expr` | `CCS_SYMBOLS`（符号表） |

**另一套实现没有这个限制**（它的运行器原样透传参数），
所以那边的写法不能照搬到本栈——见 [`ref-stack-differences.md`](ref-stack-differences.md)。
