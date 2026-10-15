# `test/` — 验证装置

**这一层验证的是本仓库自己**，不是给用户用的能力。

| 装置 | 查什么 | 需要真板 |
|---|---|---|
| `static_checks.js` | 语法、启动器编译、行尾、编码；编排层与共享源码的机械自检 | 无 |
| `verify_maxpos.ps1` | 每个脚本"声明 / 期望 / 实际"的位置参数个数三者一致 | 无 |
| `exitcode.bat` | 退出码契约回归（含纯参数层的几项） | 部分 |
| `audit_fix_test.bat` | 实机审计若干条拒绝路径与正常路径 | 大部分 |
| `driver_smoke.js` | 驱动名字表每一类至少真跑一次 | **是** |
| `phase_d_pipeline.bat` | 三步真板管线（装载 → 运行 → 读回） | **是** |

## 怎么跑

```powershell
:: 提交前必跑
node test\static_checks.js
powershell -NoProfile -File test\verify_maxpos.ps1
pwsh       -NoProfile -File test\verify_maxpos.ps1
```

**两个 PowerShell 宿主各跑一次**：5.1 与 7 对原生命令 stderr 的处理不同，
只在一个宿主下通过是缺陷。

## 细节去哪看

- 装置清单、逐装置判据、已知局限： [`docs/dev-test-devices.md`](docs/dev-test-devices.md)
- 改完东西该跑哪些、按什么顺序： [`docs/dev-verification.md`](docs/dev-verification.md)
- 加一个新装置： [`docs/dev-adding-a-device.md`](docs/dev-adding-a-device.md)
- 装置目录索引： [`docs/README.md`](docs/README.md)

> **本目录比另一套实现少一套装置**：那边有"镜像 + 桩运行器"的装置，
> 专门覆盖启动器的无人值守分支（带负对照与自检开关）。
> **本栈不需要那条路径**——本栈的启动器不弹框、也没有无人值守开关。
> 这是两套装置清单之间最重要的差异，见
> [`../docs/reference/ref-stack-differences.md`](../docs/reference/ref-stack-differences.md)。
