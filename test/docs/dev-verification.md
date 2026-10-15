# 本地验证：跑什么、按什么顺序

> 装置**逐条判据**在 [`dev-test-devices.md`](dev-test-devices.md)。
> 本文只回答"**我刚改完东西，现在该跑什么**"。

## 1. 按改动范围选

| 你改了什么 | 最低要求 | 需要真板 |
|---|---|---|
| 只改 `.md` | 静态检查（行尾与编码） | 无 |
| 改 `.js` 注释或文档字符串 | 静态检查 | 无 |
| 改 `.vbs` | 静态检查 + **真跑一次该启动器** | 无 |
| 改参数解析或共享库 | 静态检查 + 参数层装置 | 无 |
| 改编排层或工作流 | 上面全部 + **真板跑一次相关工作流** | 部分 |
| 改退出码语义 | 全部 + **全仓搜索引用点** + 判定原语 | 视情况 |

## 2. 提交前必跑

```powershell
node test\static_checks.js
powershell -NoProfile -File test\verify_maxpos.ps1
pwsh       -NoProfile -File test\verify_maxpos.ps1
```

**两个 PowerShell 宿主都要跑**：只在一个宿主下通过是缺陷。理由见
[`dev-test-devices.md`](dev-test-devices.md) 第 2 节。

## 3. 阈值与判据

| 装置 | 判据 |
|---|---|
| `static_checks.js` | 最后一行给总判定；上面每行是实测计数 |
| `verify_maxpos.ps1` | 最后一行给出通过数与失败数，失败数必须为 0 |
| `exitcode.bat` | 每行实测值等于括号里的期望值 |
| `audit_fix_test.bat` | 同上；注意**被拒绝的用例期望退出码是 1** |
| `driver_smoke.js` / 管线 | 看脚本自己打印的通过行与最终判定，**不要看退出码之外的东西** |

## 4. 怎么判断装置自己有没有坏

合格的装置必须**能红**：要有一个"故意造坏"的用例，装置必须报失败。

> **与另一套实现的差异**：那一侧的启动器装置带三条负对照与一个自检开关
> （因为它的分类是机械规则，值得专门验证）。**本栈没有那一组装置**，
> 所以这项自查在本栈是"逐装置人工确认它曾经红过"。
> 加新装置时，**负对照是硬要求**，见
> [`dev-adding-a-device.md`](dev-adding-a-device.md)。

## 5. 改完后的自查顺序

1. 跑第 2 节三条命令；
2. 改了启动器 → **真跑一次**；
3. 改了编排层 → 确认机械自检通过（静态检查已包含）；
4. 改了行为 → 用一次**真实调用**验证（真板或桩，取决于改动）；
5. 全仓搜一遍你改掉的旧名字/旧路径，确认没有遗漏的引用；
6. 同笔更新文档。

## 6. 相关

- 装置清单与判据：[`dev-test-devices.md`](dev-test-devices.md)
- 加新装置：[`dev-adding-a-device.md`](dev-adding-a-device.md)
- 仓库级约定：[`../../docs/dev/dev-verification.md`](../../docs/dev/dev-verification.md)
- 踩过的坑：[`../../docs/dev/dev-gotchas.md`](../../docs/dev/dev-gotchas.md)
