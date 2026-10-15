# 目标：写进流水线 / 无人值守

> **先决定"怎么组合"，再决定"怎么写"。** 组合方式（该用 `atomic/` 还是 `workflows/`、
> 能不能拆成多条命令、你自己的脚本放哪）见 [`gu-compose-your-own.md`](gu-compose-your-own.md)；
> **本篇只讲一旦决定了之后，怎么写成不会静默失败的 `.bat` / 无人值守运行。**

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

### 3. 成败判定要按**标记行**，不是退出码

本技术栈的脚本把成败打在 stdout 的一次性一行上：

```bat
call "%RUN%" workflows\ccs12_2_0_load_run_read.js "<ccxml>" "<out>" 2000 "your_symbol.Var" > "%LOG%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG%" >nul
if errorlevel 1 (
    echo FAILED & type "%LOG%"
    exit /b 1
)
```

要点：

- **`/b`（行首匹配）**：避免把日志里偶然出现的字符串当成标记；
- **把输出收进日志再判**：这样失败时还能把原因打出来（原因只写在标记行里）；
- 不要用 `%errorlevel%` 判断成败：它拿不到原因，也分不清"跑完了"与"脚本没找到"。

### 4. 参数里不能有 `=` 或空格

带 `=` 的表达式走环境变量通道：

```bat
set CCS_WRITE_EXPR=your_symbol.Var = 1
set CCS_EVAL_EXPR=your_symbol.Var
call "%RUN%" workflows\ccs12_2_0_load_write_run_read.js "<ccxml>" "<out>" 2000 --settle 500
```

否则 cmd 会在解析阶段中止，Java 根本没起来，输出里连标记行都没有（表现为退出码 255）。

## 用 `run_one_step.bat` 把命令翻译成判定

`examples/run_one_step.bat` 是一个**判定翻译器**（不是透传器）：

```bat
call examples\run_one_step.bat workflows\ccs12_2_0_load_run.js "<ccxml>" "<out>"
```

它包住任意一条命令，跑完在 stdout 上打印一行 `STEP_VERDICT=OK` 或 `STEP_VERDICT=FAIL`，
并且**自己以 0/1 退出**，供流水线直接判断。

它的契约由本技术栈的标记行实现；另一套实现的判定原语是**同名同契约**的，
所以同一份流水线骨架可以套在两个栈上。差异见
[`../reference/ref-stack-differences.md`](../reference/ref-stack-differences.md)。

## 用 `pipeline_template.bat` 起一条流水线

`examples/pipeline_template.bat` 是骨架：**fail-fast**（一步失败就停）、步骤之间固定延时、
最后一行给出整条流水线的判定。它默认是零步骨架，你把步骤列表填进去即可。

已有的一个填好的例子是 `test/phase_d_pipeline.bat`（三步真板管线），
见 [`../../test/docs/dev-test-devices.md`](../../test/docs/dev-test-devices.md)。

判定原语与模板的完整契约（含"它是翻译器不是透传器"这条的后果）见
[`../dev/dev-examples-layer.md`](../dev/dev-examples-layer.md)。

## 无人值守运行时不要弹窗

`.vbs` 启动器默认会弹框。CI 里必须：

```bat
set CCS12_2_0_NONINTERACTIVE=1
```

设了它，每个对话框变成一行控制台输出。**但改目标状态的启动器会拒绝用默认值**，
所以参数必须给全（只读的几个不受限）。分类见
[`../reference/ref-scripts.md`](../reference/ref-scripts.md) 与 `test/drive_checks.ps1` 顶部的表。

## 一个 CI 片段

Windows runner 上，不需要真板的部分（静态门禁 + 启动器契约）可以直接跑：

```yaml
- name: 静态门禁（两个宿主各跑一次）
  shell: pwsh
  run: |
    pwsh       -NoProfile -File test\verify_static.ps1
    powershell -NoProfile -File test\verify_static.ps1

- name: 启动器非交互路径（不需要真板）
  shell: pwsh
  run: |
    pwsh       -NoProfile -File test\drive_checks.ps1
    powershell -NoProfile -File test\drive_checks.ps1
```

需要真板的步骤（烧录、运行、读回）不适合放在公共 CI 上，除非你有自托管的带板 runner。

## 下一步

- 失败了怎么查：[`gu-troubleshooting.md`](gu-troubleshooting.md)
- 要改这套装置本身：[`../../test/docs/dev-verification.md`](../../test/docs/dev-verification.md)
