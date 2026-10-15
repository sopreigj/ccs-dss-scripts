# 文档地图

这里有 **20 篇文档 + 5 份层指针**。本文件是唯一的总索引：先按你的身份选一行，再按需深入。

## 按身份进入

| 你是谁 | 从这读 |
|---|---|
| 第一次接触这个项目 | [`start/start-here.md`](start/start-here.md) → [`start/setup.md`](start/setup.md) |
| 想马上跑一条命令 | 根 [`README.md`](../README.md) 的"30 秒跑通" |
| 要完成一个目标（烧录、看状态、改状态、调试、流水线） | [`guides/`](guides/) 的七篇，按目标选 |
| 我要干一连串活，不知道该怎么组合、自己的脚本放哪 | [`guides/gu-compose-your-own.md`](guides/gu-compose-your-own.md) |
| 出故障了 | [`guides/gu-troubleshooting.md`](guides/gu-troubleshooting.md) |
| 要查参数 / 配置键 / 接口能力 | [`reference/`](reference/) |
| 要改这个仓库的代码 | [`dev/dev-architecture.md`](dev/dev-architecture.md) → [`dev/dev-contributing.md`](dev/dev-contributing.md) |
| 要加一个脚本或一个验证装置 | [`dev/dev-adding-a-script.md`](dev/dev-adding-a-script.md) / [`../test/docs/dev-adding-a-device.md`](../test/docs/dev-adding-a-device.md) |
| 我只想要一张速查表 | [`reference/ref-decision-tables.md`](reference/ref-decision-tables.md) |

## 全部篇目

### `start/` — 第一次用

| 文档 | 回答什么 |
|---|---|
| [`start-here.md`](start/start-here.md) | 这个项目解决什么问题、三个层次怎么分工、**你（使用者）站在哪一层**、能做什么不能做什么 |
| [`setup.md`](start/setup.md) | 前置条件、7 个配置键、怎么验证装对了、换芯片换仿真器、连不上怎么办 |
| [`first-script.md`](start/first-script.md) | 启动器的三种用法、直接调 `.js` 的方式、怎么看懂输出 |

### `guides/` — 按目标做事

| 文档 | 回答什么 |
|---|---|
| [`gu-flash-and-run.md`](guides/gu-flash-and-run.md) | 烧录 → 运行 → 读回，以及**为什么这几步必须在一个会话里** |
| [`gu-inspect-state.md`](guides/gu-inspect-state.md) | 读 PC / 寄存器 / 内存 / 表达式；为什么同一地址两次读到不同值 |
| [`gu-modify-state.md`](guides/gu-modify-state.md) | 写寄存器 / 内存 / 变量；写完读回是旧值怎么办 |
| [`gu-debug-target.md`](guides/gu-debug-target.md) | 断点、单步、硬件数据观察点 |
| [`gu-compose-your-own.md`](guides/gu-compose-your-own.md) | **你要干一连串活时**：该用什么、能不能拆、你自己的脚本放哪、叫什么 |
| [`gu-pipelines-ci.md`](guides/gu-pipelines-ci.md) | 决定好之后，怎么写成不会静默失败的 `.bat` / 无人值守运行 |
| [`gu-troubleshooting.md`](guides/gu-troubleshooting.md) | 按症状进门的排障手册 |

### `reference/` — 查

| 文档 | 回答什么 |
|---|---|
| [`ref-configuration.md`](reference/ref-configuration.md) | 配置文件的键、三个入口各自的覆盖链、缺键行为、换机器清单 |
| [`ref-scripts.md`](reference/ref-scripts.md) | 每个脚本的用法、参数、退出码与结果标记、"不做"清单 |
| [`ref-atomic-scripts.md`](reference/ref-atomic-scripts.md) | 原子层为什么这么分类、每一类各自负责什么 |
| [`ref-api-dss.md`](reference/ref-api-dss.md) | 本技术栈的 API：有什么、明确没有什么、还没确证什么 |
| [`ref-stack-differences.md`](reference/ref-stack-differences.md) | 与另一套实现的逐项差异——**别照搬** |
| [`ref-file-formats.md`](reference/ref-file-formats.md) | 导出/采样的文件格式与落点、怎么再导入回去 |
| [`ref-terms.md`](reference/ref-terms.md) | 受控词汇表：一个概念一个词 |
| [`ref-decision-tables.md`](reference/ref-decision-tables.md) | 三张速查表：意图→入口、现象→处置、特殊字符怎么传 |

### `dev/` — 改这个仓库

| 文档 | 回答什么 |
|---|---|
| [`dev-architecture.md`](dev/dev-architecture.md) | 三层源码全景、依赖方向、会话为什么是状态边界、停机规则 |
| [`dev-session-layer.md`](dev/dev-session-layer.md) | 共享库每个导出的契约 |
| [`dev-orchestration-layer.md`](dev/dev-orchestration-layer.md) | 编排层名字表 + 新增一对共享工作流的完整步骤 |
| [`dev-workflows-layer.md`](dev/dev-workflows-layer.md) | 工作流层 9 个入口的接线方式与状态依赖 |
| [`dev-examples-layer.md`](dev/dev-examples-layer.md) | `examples/` 的判定原语契约与模板骨架 |
| [`dev-launcher-contract.md`](dev/dev-launcher-contract.md) | 引导块、哨兵、标记行、非交互分类——**改脚本前必读** |
| [`dev-language-constraints.md`](dev/dev-language-constraints.md) | 三种宿主语言的硬约束 |
| [`dev-adding-a-script.md`](dev/dev-adding-a-script.md) | 新增脚本的完整步骤与检查清单 |
| [`dev-verification.md`](dev/dev-verification.md) | 本地该跑哪些门禁、按什么顺序 |
| [`dev-contributing.md`](dev/dev-contributing.md) | 命名、约束、提交纪律、文档同步义务 |
| [`dev-gotchas.md`](dev/dev-gotchas.md) | 踩坑账本：现象、原因、判据、怎么避免 |

### 各层目录里的指针

`atomic/`、`session/`、`orchestration/`、`workflows/`、`examples/`、`test/` 六个目录各有
一份 `README.md`，只写"这一层是干什么的 + 文件清单 + 指向本目录的哪一篇"。
它们的正文解释都在这里，**不要在层 README 里复述**——否则改一处要改两处，两份很快会互相矛盾。

## 文档的维护规则

1. **一个事实只有一个权威出处。** 例如"成败怎么判"只写在
   [`dev/dev-launcher-contract.md`](dev/dev-launcher-contract.md)，其它位置一律引用。
2. **层 README 是指针**，不超过一屏，只列文件与去向。
3. **文档与代码同笔提交**；`test/verify_static.ps1` 会检查所有 `.md` 的相对链接，
   死链等于门禁失败。
4. **不写机器相关路径**：仓库内的文档、脚本、注释都不出现绝对路径。要指代读者自己的工程目录时，
   用配置键的说法（配置键见 [`ref-configuration.md`](reference/ref-configuration.md)）。
5. **不写项目开发过程**：没有编号体系、没有工作日志、没有会话记录，也没有任何可识别出
   具体项目、硬件台架或个人的信息。只写结论与复现判据。
