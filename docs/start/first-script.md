# 跑第一条命令

## 三个入口，选一个

每个原子脚本有一对文件：`.js` 是本体，`.vbs` 是启动器。启动器有两种用法，加上直接调本体，一共三条路：

| 用法 | 命令形态 | 什么时候用 |
|---|---|---|
| **双击启动器** | 双击 `atomic\target\ccs20_0_1_check_connection.vbs` | 手工试一次；每个参数弹一个框问你 |
| **启动器带参数** | `cscript /nologo atomic\target\ccs20_0_1_check_connection.vbs "<ccxml>" "<out>"` | 想不弹框，但仍走启动器的默认值与校验 |
| **直接调本体** | `"%CCS_ROOT%\ccs\scripting\run.bat" atomic\target\ccs20_0_1_check_connection.js` | 写进流水线；**唯一**能传选项的方式 |

位置参数的顺序在三种用法里完全一致：先是目标配置，再是固件，然后是脚本自己的参数。
选项一律 `--名字 值`。

**必须经运行器调用**：运行器会在命令行里插入脚本名，脚本自己从第 3 个位置起读参数。
直接 `node <脚本>` 调用会让参数错位——第一个参数会被吃掉。

## 一条完整的命令长什么样

```bat
:: 在仓库根目录执行。省略路径参数时，脚本从配置文件补齐（这里故意省了，验证配置是否装好）
"%CCS_ROOT%\ccs\scripting\run.bat" atomic\target\ccs20_0_1_target_state.js
```

输出会分几段：配置、目标身份、状态、若干调试设置。

## 怎么看懂输出

**判据是退出码**：

| 退出码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 任何失败：用法错误、文件不存在、会话失败、操作失败 |

**失败原因在输出里**，不在退出码里。所以 `.bat` 里可以这样写：

```bat
call "%RUN%" workflows\ccs20_0_1_load_run.js "<ccxml>" "<out>"
if errorlevel 1 (
    echo FAILED - 原因见上面的输出
    exit /b 1
)
```

> **本栈与另一套实现在这里完全相反**：那边的运行器**不**把脚本的退出状态
> 变成自己的进程退出码，所以只能看 stdout 上的结果标记行。两套不要互相照搬，见
> [`../reference/ref-stack-differences.md`](../reference/ref-stack-differences.md)。

## 在哪个目录执行

**在仓库根目录执行**。脚本经运行器启动后靠"从当前目录逐级向上找共享库"来定位自己需要的库文件，
所以要按仓库根来组织命令（从仓库内的子目录启动也可以）。启动器会把工作目录钉到仓库根，
用启动器时不必关心这件事。

## 参数怎么传

本栈的运行器**原样透传**参数，所以带 `=` 或空格的表达式可以直接写在命令行上：

```bat
"%CCS_ROOT%\ccs\scripting\run.bat" atomic\expression\ccs20_0_1_write_expr.js "<ccxml>" "your_symbol.Var = 1"
```

**如果用 PowerShell 拼 `cmd /c`**，注意 PowerShell 自己会处理引号：把整条命令放进 `cmd /c "..."`
时，内部的引号需要按 PowerShell 的规则转义，否则会被吃掉而报参数形状错误。
遇到这种情况可以直接用 `cmd` 写流水线，或者让表达式从环境变量进来
（脚本也认 `CCS_EVAL_EXPR` 与 `CCS_WRITE_EXPR`，见
[`../reference/ref-decision-tables.md`](../reference/ref-decision-tables.md)）。

> 这一处与另一套实现也不同：那边的运行器**吃参数**，含 `=` 或空格时必须走环境变量通道。
> 所以"那边不能直接写"这条结论，在本栈不成立。

## 下一步

- 想做具体的事：[`../guides/`](../guides/)
- 想查某个脚本的参数：[`../reference/ref-scripts.md`](../reference/ref-scripts.md)
