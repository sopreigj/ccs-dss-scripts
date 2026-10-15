# 贡献指南

感谢你愿意改这个仓库。本文只讲**怎么改才不会被门禁拦住**；具体怎么跑、怎么查，见
[`docs/README.md`](docs/README.md)。

## 1. 先跑起来

```bat
copy ccs20_0_1.conf.example ccs20_0_1.conf
:: 编辑 ccs20_0_1.conf，把 7 个键改成你自己机器与项目的值
:: 然后在仓库根目录执行：
"%CCS_ROOT%\ccs\scripting\run.bat" atomic\target\ccs20_0_1_check_connection.js
```

配置文件的 7 个键、三个入口各自的覆盖链、缺键时的行为，见
[`docs/reference/ref-configuration.md`](docs/reference/ref-configuration.md)。
`ccs20_0_1.conf` 是**机器本地文件**，永远不要提交它。

## 2. 提交前必须过的门禁

不需要真板：

```powershell
powershell -NoProfile -File test\verify_maxpos.ps1
pwsh       -NoProfile -File test\verify_maxpos.ps1
node test\static_checks.js
```

判据与"改了哪一层该跑哪些"见 [`test/docs/dev-verification.md`](test/docs/dev-verification.md)。
两个 PowerShell 宿主（5.1 与 7）都要跑：只在一个宿主下通过**是缺陷**，
因为两者对原生命令 stderr 的处理不同。

> **本仓库与另一套实现结构镜像，装置却不一样**：那边有基于镜像与桩的
> 启动器装置，这边没有（本技术栈的启动器不弹框，不需要那条路径）。
> 差异清单见 [`docs/reference/ref-stack-differences.md`](docs/reference/ref-stack-differences.md)。

## 3. 改代码前请先读

| 你要改的东西 | 先读 |
|---|---|
| 任何脚本 | [`docs/dev/dev-launcher-contract.md`](docs/dev/dev-launcher-contract.md) |
| `session/` | [`docs/dev/dev-session-layer.md`](docs/dev/dev-session-layer.md) |
| `orchestration/` 或加工作流 | [`docs/dev/dev-orchestration-layer.md`](docs/dev/dev-orchestration-layer.md) |
| 新增一个脚本 | [`docs/dev/dev-adding-a-script.md`](docs/dev/dev-adding-a-script.md) |
| 加一个验证装置 | [`test/docs/dev-adding-a-device.md`](test/docs/dev-adding-a-device.md) |

三种宿主语言的硬约束见 [`docs/dev/dev-language-constraints.md`](docs/dev/dev-language-constraints.md)。

## 4. 硬性约束（会被装置机械检查）

- **行尾**：`.bat` / `.vbs` / `.conf` 必须 CRLF；`.js` / `.md` / `.ps1` 必须 LF。
- **编码**：`.js` / `.vbs` / `.bat` 一律 ASCII。中文只进 `.md`。
- **`.js` + `.vbs` 成对**，同目录同名，用 `.vbs` 定位同名 `.js`。
- **编排层与共享源码只写 ES3 子集**：不用 `let` / `const` / 箭头函数 / 模板串 / `Object.keys` / `JSON.`。
  （其余脚本可以用现代语法——这是本栈与另一边不同的地方。）
- **地址必须带 `0x`**；位置参数顺序固定，且每个脚本必须声明它接受多少个位置参数。
- **脚本必须经运行器调用**：运行器把脚本名插在命令行里，脚本自己从第 3 个位置起读参数。

## 5. 提交纪律

- 一次提交只做一件事；信息用 `feat:` / `fix:` / `docs:` / `test:` 前缀，正文写清**改了什么都为什么**。
- **改了行为必须同笔更新文档**：文档与代码同笔提交，链接由静态门禁检查，死链就是门禁红。
- **改了脚本的参数或输出，必须同笔更新**：脚本头部的用法行、
  [`docs/reference/ref-scripts.md`](docs/reference/ref-scripts.md)、
  [`test/README.md`](test/README.md) 的装置表（若该脚本出现在装置里）。
- **破坏性变更**（改参数形状、改配置键、改判定方式）必须在提交信息里显式说明，
  并写进 [`docs/reference/ref-configuration.md`](docs/reference/ref-configuration.md) 的迁移清单。

## 6. 写作与本仓库文档的约定

- **全部中文**；代码标识符、命令、文件名、配置键保持英文原样，术语见
  [`docs/reference/ref-terms.md`](docs/reference/ref-terms.md)。
- **路径一律相对写法**（相对仓库根，或相对当前文件）。仓库内的文档、脚本、注释
  **都不写机器相关的绝对路径**——需要指代"你的工程目录"时用配置键的说法。
- **一个事实只有一个权威出处**：其他位置引用它，不要复述。判定机制只写在
  [`docs/dev/dev-launcher-contract.md`](docs/dev/dev-launcher-contract.md)。
- **不写内部开发过程**（编号体系、工作日志、会话记录、个人或项目可识别信息）。
  只写"现象 → 原因 → 判据 → 怎么避免"，见 [`docs/dev/dev-gotchas.md`](docs/dev/dev-gotchas.md)。
- 每层目录下的 `README.md` 是**指针**（不超过一屏），解释一律写在 `docs/`。
