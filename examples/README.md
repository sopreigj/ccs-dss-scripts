# `examples/` — 示例与可复用构件

五个 `.bat`：三个场景示例 + 一个判定原语 + 一个流水线模板。

| 文件 | 是什么 | 怎么用 |
|---|---|---|
| `load_and_run.bat` | 场景示例：装载并让它跑起来 | 照着改 |
| `load_set_run_read.bat` | 场景示例：装载 → 写 → 跑 → 读回 | 照着改 |
| `breakpoint_step.bat` | 场景示例：断点、单步、观察点各一次 | 照着改 |
| `run_one_step.bat` | **判定原语**：包住任意一步，翻译成一行判定 | 在流水线里 `call` 它 |
| `pipeline_template.bat` | **流水线模板**：骨架 + fail-fast | 复制、保留骨架、换步骤列表 |

判定原语与模板的契约（含"它是翻译器不是透传器"这条的后果）见
[`../docs/dev/dev-examples-layer.md`](../docs/dev/dev-examples-layer.md)；
场景示例逐行讲解见 [`../docs/guides/gu-flash-and-run.md`](../docs/guides/gu-flash-and-run.md)。

**这些示例都把默认值从配置文件取**，缺键时明确报错而不是猜。
所有命令都在仓库根目录执行。

**为什么这里只给模板、不给"成品流水线"**：一条真正有用的流水线里必然写死你的目标配置、固件、
变量名与地址——**这些值按设计就不入库**（见 `.gitignore`）。所以这里给的是**骨架**：
复制 `pipeline_template.bat`，保留它的 `call` / 延时 / 判定结构，换掉步骤列表。
组合方式的选择（该用 `atomic/` 还是 `workflows/`、能不能拆）见
[`../docs/guides/gu-compose-your-own.md`](../docs/guides/gu-compose-your-own.md)。

**判定原语与另一套实现同名同契约**：它存在的意义就是让同一份流水线骨架能在两套之间复用。
