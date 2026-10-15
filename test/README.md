# `test/` — 验证装置

**这一层验证的是本仓库自己**，不是给用户用的能力。

| 装置 | 查什么 | 需要真板 |
|---|---|---|
| `verify_static.ps1` | 语法、引导块一致性、编码、行尾、启动器编译、文档链接 | 无 |
| `drive_checks.ps1` | 18 个启动器的非交互路径（镜像 + 桩运行器） | 无 |
| `checks.ps1` | 上面那个驱动的单格（一次一个进程） | 无 |
| `policy_probe.vbs` | 非交互判定规则本身（标签、拒绝文案、默认分类） | 无 |
| `usage.ps1` | 打印每个启动器的参数顺序与提示顺序（只读） | 无 |
| `verify_launchers.ps1` | 应答启动器对话框的旧尝试（**本环境跑不通**，不是关口） | 无 |
| `driver_smoke.js` | 驱动名字表每一类至少真跑一次 | **是** |
| `phase_d_pipeline.bat` | 三步真板管线（装载 → 运行 → 读回） | **是** |
| `probe_*.js` | 一次性测量工具（不是关口） | 视情况 |

## 怎么跑

```powershell
:: 提交前必跑（两个宿主各一次）
pwsh       -NoProfile -File test\verify_static.ps1
powershell -NoProfile -File test\verify_static.ps1
pwsh       -NoProfile -File test\drive_checks.ps1
powershell -NoProfile -File test\drive_checks.ps1

:: 证明装置自己"能红"
pwsh -NoProfile -File test\drive_checks.ps1 -SelfCheck
```

## 细节去哪看

- 装置清单、逐装置判据、已知局限： [`docs/dev-test-devices.md`](docs/dev-test-devices.md)
- 改完东西该跑哪些、按什么顺序： [`docs/dev-verification.md`](docs/dev-verification.md)
- 加一个新装置： [`docs/dev-adding-a-device.md`](docs/dev-adding-a-device.md)
- 装置目录索引： [`docs/README.md`](docs/README.md)
