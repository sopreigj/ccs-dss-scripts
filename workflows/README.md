# `workflows/` — 单会话多步脚本

**一个会话内连续做几步。** 这一层**只有 `.js`，没有 `.vbs` 启动器**——
它们的参数是"一次实验的配方"，不适合做成弹框逐项问。

| 脚本 | 一句话 | 依赖的会话内状态 |
|---|---|---|
| `ccs12_2_0_load_run.js` | 装载后让它一直跑 | 符号表 |
| `ccs12_2_0_load_run_read.js` | 装载 → 跑 N 毫秒 → 停机 → 读表达式 | 符号表、运行状态 |
| `ccs12_2_0_load_write_run_read.js` | 装载 → 等一段 → 写 → 跑 → 回读 | 符号表、写入的值 |
| `ccs12_2_0_run_to_bp.js` | 设断点并运行到它 | 断点对象 |
| `ccs12_2_0_step.js` | 单步 N 次 | 断点/单步位置、停机状态 |
| `ccs12_2_0_bp_write_action.js` | 在断点上挂一个写动作 | 断点对象、表达式上下文 |
| `ccs12_2_0_watch_write.js` | 硬件数据观察点：谁在改这个地址 | 观察点对象（硬件资源） |
| `ccs12_2_0_sample_exprs.js` | 定间隔采样到 CSV | 符号表、采样起始时刻 |
| `ccs12_2_0_pin_drive.js` | 驱动一个空闲引脚并恢复 | 外设寄存器配置 |

逐参数说明见 [`../docs/reference/ref-scripts.md`](../docs/reference/ref-scripts.md)；
为什么必须单会话、入口怎么接线见
[`../docs/dev/dev-workflows-layer.md`](../docs/dev/dev-workflows-layer.md)。

**为什么不能拆成多次调用**：断点、符号表、外设配置都是会话的子对象，会话一关就没了。
拆开写表面上每一步都"成功"，但现场已经丢了。
