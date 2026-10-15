# CCS 20.0.1 F28335 自动化调试脚本

把 TI CCS 的调试动作变成**能从命令行调用、能写进流水线**的脚本：烧录、运行控制、读写内存与寄存器、
断点与单步、采样导出、flash 操作维护。

- **一个脚本只做一件事**；需要"同一个会话里连续做几步"的流程放进 `workflows/`。
- 每个原子脚本 = 一对同名文件：`atomic/<分类>/ccs20_0_1_<动作>.js`（本体）+
  `ccs20_0_1_<动作>.vbs`（双击启动器）。
- **成败由退出码与输出共同表达**；本技术栈的运行器会把退出码透传出来（见下）。
- 全部脚本在 **CCS 20.0.1**（Node 脚本接口）上实测通过；文件名的 `ccs20_0_1` 前缀就是版本标识。

## 30 秒跑通

```bat
:: 1) 一次性配置：把示例改成自己的配置文件，再填 7 个键
copy ccs20_0_1.conf.example ccs20_0_1.conf

:: 2) 跑一条最小的：连上目标并报告状态（省略路径参数时从配置文件补齐）
"%CCS_ROOT%\ccs\scripting\run.bat" atomic\target\ccs20_0_1_check_connection.js

:: 3) 看结果：退出码 0 且输出里出现连接结论
```

也可以直接双击 `atomic\target\ccs20_0_1_check_connection.vbs`，它会逐个弹窗问你要参数。

## 四条硬规则

1. **成败看退出码（0 成功 / 1 任何失败），失败原因在输出里**。本技术栈的运行器会把脚本的
   退出状态透传出来，所以流水线可以直接用退出码判断；原因则要从输出里读。
   > 注意：这与另一套实现**相反**——那边的运行器不透传退出码，
    > 只能看 stdout 上的标记行。两套不要互相照搬，见
    > [`docs/reference/ref-stack-differences.md`](docs/reference/ref-stack-differences.md)。
2. **地址必须带 `0x` 前缀**（`0xC000`）。裸数字会被拒绝，而不是替你猜进制。
3. **命令在仓库根目录执行，运行器与脚本路径用仓库相对的写法**（`atomic\...`、`workflows\...`）。
   仓库内不存在任何依赖机器的绝对路径；**只有你自己的目标配置与固件文件需要给绝对路径**
   （它们不在仓库里，而且相对路径会被解析到与调用者无关的位置）。
4. **脚本必须经运行器启动**：运行器会在命令行里插入脚本名，脚本自己从第 3 个位置起读参数。
   直接 `node <脚本>` 调用会让参数错位。

## 目录

```
atomic/         18 个原子脚本（每个配同名 .vbs），按 target/program/memory/register/expression 五类分目录
workflows/      8 个单会话多步脚本（只有 .js，没有 .vbs）
orchestration/  编排层共享实现（与具体技术栈无关，由 workflows/ 的入口驱动）
session/        共享库（参数校验、会话语义、配置读取、驱动门面）
examples/       5 个 .bat：三个场景示例 + 判定原语 run_one_step + 模板 pipeline_template
test/           验证装置（静态检查、参数层、真板回归），见 test/README.md
docs/           文档，入口见 docs/README.md
skills/         给 AI 助手的索引说明
```

## 验证：哪些能离线跑，哪些必须接板

clone 下来**不需要 CCS、也不需要目标板**就能跑的两条（外部贡献者请用这两条自检）：

```powershell
node test\static_checks.js                          :: 语法、启动器编译、行尾、编码、共享层规则
powershell -NoProfile -File test\verify_maxpos.ps1  :: 参数层：声明 / 期望 / 行为三者一致
```

**必须在装有 CCS 且接上目标板的机器上才能跑的**（本仓库的其余装置，例如驱动契约冒烟、
三步真板管线）不参与离线门禁，也无法在公共 CI 上验证。所以：**离线门禁全绿只代表代码自洽，
不代表目标行为正确**——后者只能由真板回归覆盖。完整清单与逐条判据见
[`test/README.md`](test/README.md)。

**换芯片时**：仓库自带的都是**本机实测环境**（一块 C2000 板 + XDS100 系列仿真器）上的结论，
并用到了该芯片的具体寄存器地址与 flash 属性（例如安全模块寄存器、GPIO 端口寄存器、
flash 扇区属性）。**换到其它 C2000 器件时这些必须自己核对与替换**，最少要动：

- 配置文件里的目标配置与固件（见 [`docs/start/setup.md`](docs/start/setup.md)）；
- 与器件相关的常量：安全模块寄存器地址、`pin_drive` 用的 GPIO 端口寄存器与位掩码；
- flash 操作名与扇区属性（名字由目标自己决定，脚本是运行时问出来的，但内置的**危险操作清单**
  与警告是按本机器件写的）。

`docs/start/setup.md` 的第 6 节列了逐项清单。

## 文档去哪看

| 你想做什么 | 去哪里 |
|---|---|
| 第一次用：装好、跑通、看懂输出 | [`docs/start/`](docs/start/) |
| 完成某个目标（烧录、看状态、改状态、调试） | [`docs/guides/`](docs/guides/) |
| 查参数、查配置键、查接口能力 | [`docs/reference/`](docs/reference/) |
| 改这个仓库的代码 | [`docs/dev/`](docs/dev/) |
| 全部文档的地图 | [`docs/README.md`](docs/README.md) |

## 许可与贡献

[MIT](LICENSE)。改这个仓库前请看 [`CONTRIBUTING.md`](CONTRIBUTING.md)。
