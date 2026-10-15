---
name: ccs12_2_0-automation
description: >
  使用 CCS 12.2.0 的 DSS 接口驱动 C2000 开发板：调用本仓库的 ccs12_2_0_* 脚本、
  看懂 CCS12_2_0_RESULT 结果标记；硬件接线或连不上（Error -151）、仿真器不可用；
  装载与校验固件、flash 操作、读写变量与内存寄存器、断点单步观察点、表达式采样；
  脚本"报成功但事情没发生"、退出码恒为 0 分不清失败与脚本没找到；
  写脚本前要确认宿主语言的版本级别；以及误把另一套实现的做法照搬到本栈时。
---

# CCS 12.2.0 自动化调试脚本（AI 助手索引）

**本文是索引，不是手册。** 任何事实以 [`docs/`](../../docs/) 为准，不要依赖本文的复述。

| 要知道什么 | 看哪里 |
|---|---|
| 这是什么、怎么跑、目录结构、硬规则 | 根 [`README.md`](../../README.md) |
| 装好并跑通、换硬件、连不上 | [`docs/start/setup.md`](../../docs/start/setup.md) |
| 每个脚本的参数、退出码、"不做"清单 | [`docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) |
| 配置键与三个入口各自的覆盖链 | [`docs/reference/ref-configuration.md`](../../docs/reference/ref-configuration.md) |
| 本技术栈的接口能做什么、明确不能做什么 | [`docs/reference/ref-api-dss.md`](../../docs/reference/ref-api-dss.md) |
| 与另一套实现的差异（别照搬） | [`docs/reference/ref-stack-differences.md`](../../docs/reference/ref-stack-differences.md) |
| 出故障了 | [`docs/guides/gu-troubleshooting.md`](../../docs/guides/gu-troubleshooting.md) |
| 一张速查表 | [`docs/reference/ref-decision-tables.md`](../../docs/reference/ref-decision-tables.md) |
| 改这个仓库的代码 | [`docs/dev/dev-architecture.md`](../../docs/dev/dev-architecture.md) |
| 已经踩过的坑 | [`docs/dev/dev-gotchas.md`](../../docs/dev/dev-gotchas.md) |

## 什么时候用这套脚本

- 用：命令行装载/校验/运行固件；读改变量、内存、寄存器；跑到断点、单步、观察点；
  采样导出；flash 操作维护；查"为什么脚本报成功却没干活"。
- 不用：在调试器界面里手动点；另一套实现的任务（接口形状不同，结论不能照搬）；
  需要"跨脚本保持状态"的设计（会话结束即销毁，做不到）。

## 选路：先问"这件事单独跑有意义吗"

- **有** → `atomic/<分类>/ccs12_2_0_*.js`（每个自己开一个会话）。
- **没有（依赖会话内状态）** → `workflows/ccs12_2_0_*.js`。
  **跨脚本传状态是不成立的**，这是机制决定的，不是风格问题。

## 五条最容易踩的规则

1. **成败只认结果标记行** `CCS12_2_0_RESULT=OK` / `=FAIL <原因>`；退出码不可靠。
2. **地址必须带 `0x`**，裸数字被拒绝。
3. **参数里不要出现 `=` 或空格**：会让 cmd 在解析阶段中止（运行时根本没起来，
   输出里连标记行都没有）。表达式走环境变量通道。
4. **`.bat` 里链式调用必须写 `call`**，否则后续步骤静默不执行而退出码仍成功。
5. **延时不要用 `timeout`**：标准输入被重定向时会跳过延时。用固定次数的 `ping`。

## 三类已经踩过的坑（动手前先看）

1. **断点跨会话不存在**：设断点与跑到断点必须在**同一个**脚本里完成。
2. **目标已经停在断点位置 ≠ 命中失败**：那是正常路径，要看它报告的 PC。
3. **观察点要挂在"固件持续写"的地址上**：挂在没人写的地址上必然超时；
   另外观察点是硬件资源，数量有上限。

## 给 AI 助手的提醒

- **不要凭调试器界面的经验推断脚本能做什么**：能力边界只有
  [`docs/reference/ref-api-dss.md`](../../docs/reference/ref-api-dss.md) 与接口定义文件算数。
- **不要新建与既有脚本同义的脚本**：先查受控词汇表
  [`docs/reference/ref-terms.md`](../../docs/reference/ref-terms.md) 与各脚本头部的用法行。
- **改脚本前先读** [`docs/dev/dev-launcher-contract.md`](../../docs/dev/dev-launcher-contract.md)，
  改完跑 [`checklist`](../../docs/dev/dev-verification.md)。
- 写完 `.bat` / `.vbs` 必须确认行尾正确（用编辑器默认可能写成 LF，cmd 会把注释行当命令执行）。
- **本文与所有文档一律不写机器相关的绝对路径**；要指代读者自己的工程目录时用配置键的说法。
