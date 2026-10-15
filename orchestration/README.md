# `orchestration/` — 编排层

**与技术栈无关的会话内动作序列。** 它由 `workflows/` 的入口引用并驱动，自己不认识任何
本技术栈的调用名。

| 文件 | 角色 |
|---|---|
| `load_run.js` | 装载后让目标一直跑 |
| `load_run_read.js` | 装载 → 跑 N 毫秒 → 停机 → 求值表达式 |
| `load_write_run_read.js` | 装载 → 等一段 → 写 → 跑 → 回读 |
| `run_to_bp.js` | 设断点并运行到它 |
| `step.js` | 单步 N 次 |
| `watch_write.js` | 硬件数据观察点 |
| `sample_exprs.js` | 定间隔采样到 CSV |
| `pin_drive.js` | 驱动空闲引脚 |
| `_selftest.js` | 本层的机械自检（**不是一个动作**） |

**三条规则**（`_selftest.js` 机械检查）：

1. 只能用驱动名字表里的名字，不直接碰引擎；
2. 这一层不负责定位/装载共享库（那是入口的事）；
3. 这一层**不出现**技术栈名、运行器名、仓库名、文档路径。

**改这一层之前必须读**：[`../docs/dev/dev-orchestration-layer.md`](../docs/dev/dev-orchestration-layer.md)
（名字表 + 新增一对共享工作流的完整步骤 + 禁区）。

**注意**：这一层与另一套实现**共用同一份契约**（名字表 37 个键完全相同），
所以这里的改动要按"跨仓库改动"对待。
