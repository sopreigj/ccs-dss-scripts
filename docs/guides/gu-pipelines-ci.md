# 目标：写进流水线 / CI

> **先决定"怎么组合"，再决定"怎么写"。** 组合方式（该用 `atomic/` 还是 `workflows/`、
> 能不能拆成多条命令、你自己的脚本放哪）见 [`gu-compose-your-own.md`](gu-compose-your-own.md)；
> **本篇只讲一旦决定了之后，怎么写成不会静默失败的 `.bat` / CI。**

## 四个必须知道的行为

### 1. `.bat` 里链式调用必须写 `call`

```bat
call "%RUN%" scripts\a.js          :: 对
"%RUN%" scripts\b.js              :: 错：从这一刻起后续全是死代码
```

漏了 `call` 的后果很隐蔽：**第一步之后静默结束，而整条流水线的退出码仍然是 0**。
看起来"跑完了"，实际上后面的步骤一步都没执行。

### 2. 步骤之间的延时要与判定方式一致地写

不要用 `timeout /t`：当标准输入被重定向（CI 里很常见）时它直接报错并**跳过延时**。
稳妥的写法是：

```bat
ping -n 3 127.0.0.1 >nul
```

（`-n 3` 约等于 2 秒。）

### 3. 判定：看退出码，原因看输出

本技术栈的运行器会把脚本的退出状态透传出来，所以可以这样写：

```bat
call "%RUN%" workflows\ccs20_0_1_load_run_read.js "<ccxml>" "<out>" 2000 "your_symbol.Var" > "%LOG%" 2>&1
if errorlevel 1 (
    echo FAILED & type "%LOG%"
    exit /b 1
)
```

要点：

- **退出码可靠**（0 成功 / 1 失败），可以直接用于流水线判断；
- **失败原因在输出里**，所以把输出收进日志，失败时打出来；
- 不要试图去解析某一行"成功标记"——本栈没有那种东西。

> **与另一套实现完全相反**：那边的运行器不透传退出码，只能看 stdout 上的
> 结果标记行。两套的流水线骨架因此不能直接互换，见
> [`../reference/ref-stack-differences.md`](../reference/ref-stack-differences.md)。

### 4. 参数可以直接写在命令行上

本栈的运行器原样透传参数，含 `=` 与空格的表达式可以直接写：

```bat
call "%RUN%" workflows\ccs20_0_1_load_write_run_read.js "<ccxml>" "<out>" 2000 --settle 500 --set "your_symbol.Var = 1" --read "your_symbol.Var"
```

**唯一的坑在 PowerShell**：用 `cmd /c "..."` 拼命令时引号会被 PowerShell 先处理一遍。
在 CI 里优先用 `cmd` 执行 `.bat`，或者让表达式从环境变量进来
（`CCS_WRITE_EXPR` / `CCS_EVAL_EXPR`）。

## 用 `run_one_step.bat` 把命令翻译成统一判定

`examples/run_one_step.bat` 是一个**判定翻译器**（不是透传器）：

```bat
call examples\run_one_step.bat workflows\ccs20_0_1_load_run.js "<ccxml>" "<out>"
```

它包住任意一条命令，跑完在 stdout 上打印一行 `STEP_VERDICT=OK` 或 `STEP_VERDICT=FAIL`，
并且**自己以 0/1 退出**，供流水线直接判断。

它的价值在于**跨实现统一**：另一套实现有一个**同名同契约**的判定原语，
所以同一份流水线骨架可以套在两个栈上，各自由自己的实现去翻译成败。

## 用 `pipeline_template.bat` 起一条流水线

`examples/pipeline_template.bat` 是骨架：**fail-fast**（一步失败就停）、步骤之间固定延时、
最后一行给出整条流水线的判定。它默认是零步骨架，你把步骤列表填进去即可。

已有的一个填好的例子是 `test/phase_d_pipeline.bat`（三步真板管线），
见 [`../../test/docs/dev-test-devices.md`](../../test/docs/dev-test-devices.md)。

判定原语与模板的完整契约（含"它是翻译器不是透传器"这条的后果）见
[`../dev/dev-examples-layer.md`](../dev/dev-examples-layer.md)。

## 一个 CI 片段

Windows runner 上，不需要真板的部分可以直接跑：

```yaml
- name: 参数层与静态检查
  shell: pwsh
  run: |
    node test\static_checks.js
    pwsh       -NoProfile -File test\verify_maxpos.ps1
    powershell -NoProfile -File test\verify_maxpos.ps1
```

需要真板的步骤（烧录、运行、读回）不适合放在公共 CI 上，除非你有自托管的带板 runner。
**本仓库的装置比另一边少**：没有"镜像 + 桩运行器"那套启动器装置（本技术栈的启动器不弹框，
不需要覆盖那条路径），这一点差异见
[`../reference/ref-stack-differences.md`](../reference/ref-stack-differences.md)。

## 下一步

- 失败了怎么查：[`gu-troubleshooting.md`](gu-troubleshooting.md)
- 要改这套装置本身：[`../../test/docs/dev-verification.md`](../../test/docs/dev-verification.md)
