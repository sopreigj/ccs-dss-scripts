# 本地验证：跑什么、按什么顺序

> 装置**逐条判据**在 [`dev-test-devices.md`](dev-test-devices.md)。
> 本文只回答"**我刚改完东西，现在该跑什么**"。

## 1. 按改动范围选

| 你改了什么 | 最低要求 | 需要真板 |
|---|---|---|
| 只改 `.md` | 静态门禁（它检查链接） | 无 |
| 改 `.js` 注释或文档字符串 | 静态门禁 | 无 |
| 改 `.vbs` 或启动器分类 | 静态门禁 + 启动器装置 | 无 |
| 改共享库或参数解析 | 静态门禁 + 参数层 + 启动器装置 | 无 |
| 改编排层或工作流 | 上面全部 + **真板跑一次相关工作流** | 部分 |
| 改判定方式、标记行、引导块 | 全部 + **全仓搜索引用点** | 视情况 |

## 2. 提交前必跑（都不需要真板）

```powershell
pwsh       -NoProfile -File test\verify_static.ps1
powershell -NoProfile -File test\verify_static.ps1
pwsh       -NoProfile -File test\drive_checks.ps1
powershell -NoProfile -File test\drive_checks.ps1
```

**两个宿主都要跑**：只在一个宿主下通过是缺陷。理由见
[`dev-test-devices.md`](dev-test-devices.md) 第 1 节。

## 3. 证明装置自己能红

```powershell
pwsh -NoProfile -File test\drive_checks.ps1 -SelfCheck
```

它故意把三个政策/分类改坏，装置必须相应报失败。**"装置通过"这件事要靠这一条才有意义。**

## 4. 真板装置（有条件时）

| 装置 | 性质 |
|---|---|
| `driver_smoke.js` | 名字表每一类至少真跑一次 |
| `phase_d_pipeline.bat` | 三步端到端管线；它的失败路也是有效证据 |

跑完**把新的读数写回** [`../../docs/reference/ref-api-dss.md`](../../docs/reference/ref-api-dss.md)
或 [`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) 的对应小节，
否则下一个人不知道它到底有没有跑过。

## 5. 怎么读结果

- **静态门禁**：最后一行给总判定；上面每一行是实测计数。若引导块那一行报摘要不符，
  先看是不是改块时漏改了某些文件（不一致）还是改齐了但没更新预期值（用重新标定开关重推）。
- **启动器装置**：最后一行的汇总里三个失败计数应当都是 0。
- **真板装置**：看脚本自己打印的判定行，不要看退出码。

## 6. 改完后的自查顺序

1. 跑第 2 节四行；
2. 改了参数或启动器 → 跑 §3 的自检；
3. 改了编排层 → 确认编排层自检通过（静态门禁已包含）；
4. 改了行为 → 用一次**真实调用**验证（真板或桩，取决于改动）；
5. 全仓搜一遍你改掉的旧名字/旧路径，确认没有遗漏；
6. 同笔更新文档。

## 7. 相关

- 装置清单与判据：[`dev-test-devices.md`](dev-test-devices.md)
- 加新装置：[`dev-adding-a-device.md`](dev-adding-a-device.md)
- 仓库级约定：[`../../docs/dev/dev-verification.md`](../../docs/dev/dev-verification.md)
- 踩过的坑：[`../../docs/dev/dev-gotchas.md`](../../docs/dev/dev-gotchas.md)
