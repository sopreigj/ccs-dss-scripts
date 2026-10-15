# 本地验证：跑什么、按什么顺序

> 装置的完整清单与判据在 [`../../test/docs/dev-test-devices.md`](../../test/docs/dev-test-devices.md)。
> 本文只回答"**我刚改完东西，现在该跑什么**"。

## 1. 按改动范围选门禁

| 你改了什么 | 最低要求 | 是否有真板要求 |
|---|---|---|
| 只改 `.md` | 静态门禁（它会检查链接） | 无 |
| 改 `.js` 注释、改文档字符串 | 静态门禁 | 无 |
| 改 `.vbs` / 改启动器分类 | 静态门禁 + 启动器非交互路径装置 | 无 |
| 改 `session/` 或参数解析 | 静态门禁 + 参数层装置 + 启动器装置 | 无 |
| 改 `orchestration/` 或工作流 | 上面全部 + 编排层自检 + **真板跑一次相关工作流** | 部分需要 |
| 改判定方式、标记行、引导块 | 全部 + **全仓搜索引用点** | 视情况 |

## 2. 不需要真板的两套（提交前必跑）

```powershell
:: 静态门禁：语法、引导块一致性、编码、行尾、启动器编译、文档链接
pwsh       -NoProfile -File test\verify_static.ps1
powershell -NoProfile -File test\verify_static.ps1

:: 启动器非交互路径：把每个启动器的三种分支都跑一遍（用镜像 + 桩运行器，不碰真 DSS）
pwsh       -NoProfile -File test\drive_checks.ps1
powershell -NoProfile -File test\drive_checks.ps1
```

**为什么两个宿主都要跑**：Windows PowerShell 5.1 与 PowerShell 7 对原生命令的 stderr 处理不同。
只在一个宿主下"通过"**是缺陷**，因为另一宿主可能把正常输出当错误、或者反过来。
一个只在单宿主成立的装置，本身就不合格。

## 3. 参数层装置（改参数解析时必跑）

```powershell
powershell -NoProfile -File test\verify_maxpos.ps1
pwsh       -NoProfile -File test\verify_maxpos.ps1
```

它核对"脚本**声明**接受多少个位置参数、用法行**期望**多少、实际**行为**多少"三者一致。
只比对声明与期望是循环论证，实跑才算独立证据。

## 4. 真板装置（有条件时跑）

| 装置 | 性质 |
|---|---|
| 退出码/判定契约回归 | 需要真板 |
| 实机审计（若干条拒绝路径与正常路径） | 需要真板，含**不碰硬件**的几条 |
| 驱动契约冒烟 | 需要真板：名字表里每一类至少真跑一次 |
| 已填好的三步管线 | 需要真板：端到端连一次 |

逐条判据见 [`../../test/docs/dev-test-devices.md`](../../test/docs/dev-test-devices.md)。
**跑完把新的读数写回对应文档**，否则下次没人知道它到底有没有跑过。

## 5. 怎么判断装置自己有没有坏

合格的装置必须**能红**。所以每个判决类装置都带**负对照**：故意造一个坏样本，它必须报失败。

```powershell
:: 启动器装置的负对照（3 条）
pwsh -NoProfile -File test\drive_checks.ps1 -SelfCheck
```

**没有负对照的装置不算装置。** 加新装置时这条是硬要求，见
[`../../test/docs/dev-adding-a-device.md`](../../test/docs/dev-adding-a-device.md)。

## 6. 改完后的自查顺序

1. 跑第 2 节四行（两个宿主 × 两套装置）；
2. 如果改了参数或启动器，跑第 3 节；
3. 如果改了 `orchestration/`，确认编排层自检通过（静态门禁里已包含）；
4. 如果改了行为，跑一次**真实调用**验证（真板或桩，取决于改动）；
5. 全仓搜一遍你改掉的旧名字/旧路径，确认没有遗漏的引用；
6. 同笔更新文档。

## 7. 相关

- 装置清单：[`../../test/docs/dev-test-devices.md`](../../test/docs/dev-test-devices.md)
- 装置怎么加：[`../../test/docs/dev-adding-a-device.md`](../../test/docs/dev-adding-a-device.md)
- 踩过的坑：[`dev-gotchas.md`](dev-gotchas.md)
