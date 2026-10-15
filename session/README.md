# `session/` — 共享库

**这一层不被用户直接调用**，只被 `atomic/` 与 `workflows/` 的脚本装载。

| 文件 | 被谁用 | 职责 |
|---|---|---|
| `session.js` | 所有 `.js`（经引导块装载） | 参数解析与校验、会话语义、结果标记、配置读取 |
| `config.vbs` | 只有 `.vbs` 启动器 | 配置文件解析、对话框与非交互规则 |
| `orch_driver.js` | `workflows/` 入口与 `orchestration/` | 驱动门面：把本技术栈的能力暴露成与技术栈无关的名字表 |

**为什么它是三层里唯一知道本技术栈调用顺序的地方**：把调用形状关在这里，上层就不必知道。
见 [`../docs/dev/dev-architecture.md`](../docs/dev/dev-architecture.md)。

**改这一层之前**：读 [`../docs/dev/dev-session-layer.md`](../docs/dev/dev-session-layer.md)
（每个导出的契约）与 [`../docs/dev/dev-launcher-contract.md`](../docs/dev/dev-launcher-contract.md)
（判定与启动器契约）。

**注意**：`.js` 与 `.vbs` 的配置读取是**两处独立实现**，改配置格式要同时改两处。
