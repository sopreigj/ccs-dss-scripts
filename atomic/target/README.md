# `atomic/target/` — 连接与运行控制

管的是**目标整体**的状态。

| 脚本 | 一句话 |
|---|---|
| `ccs20_0_1_check_connection.js` | 连上目标并报告结果 |
| `ccs20_0_1_target_state.js` | 报告核名、连接、停机、PC、可用复位类型与关键调试设置 |
| `ccs20_0_1_target_run.js` | 让目标继续运行（**离开时不停机**） |
| `ccs20_0_1_target_halt.js` | 把目标停住 |
| `ccs20_0_1_target_reset.js` | 复位；`--list` 列出可用复位类型 |
| `ccs20_0_1_run_for_ms.js` | 运行 N 毫秒后停住，报告前后 PC |

每个脚本都配同名 `.vbs`。逐参数说明见
[`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md)。

**注意**：`target_state` 报告的探针型号来自目标配置文件的身份声明，不是探测结果——
要确认手上插的是哪个仿真器必须人工对账，见 [`../../docs/start/setup.md`](../../docs/start/setup.md)。

**停机只在本次会话内有效**：脚本退出时释放目标，随后目标自由运行。确定停机的手段是断电或
固件自身的停止逻辑。
