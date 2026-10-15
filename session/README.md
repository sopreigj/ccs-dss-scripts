# `session/` — 共享库

**这一层不被用户直接调用**，只被 `atomic/` 与 `workflows/` 的脚本使用。

| 文件 | 职责 |
|---|---|
| `session.js` | 会话生命周期、状态查询、收尾、超时与轮询常量 |
| `cli.js` | 参数解析与校验、退出码常量、位宽白名单 |
| `conf.js` | 配置文件解析：键取值、配置文件路径、示例文件名 |
| `orch_driver.js` | 驱动门面：把本技术栈的能力暴露成与技术栈无关的名字表 |

**为什么它是三层里唯一知道本技术栈调用顺序的地方**：把调用形状关在这里，上层就不必知道。
见 [`../docs/dev/dev-architecture.md`](../docs/dev/dev-architecture.md)。

**改这一层之前**：读 [`../docs/dev/dev-session-layer.md`](../docs/dev/dev-session-layer.md)
（每个导出的契约）与 [`../docs/dev/dev-launcher-contract.md`](../docs/dev/dev-launcher-contract.md)
（判定与启动器契约）。

**注意**：`orch_driver.js` 导出的名字表是**与另一套实现共用的冻结契约**（37 个键）。
改它等于改两侧的约定。
