# 跑第一条命令

## 三个入口，选一个

每个原子脚本有一对文件：`.js` 是本体，`.vbs` 是启动器。启动器有两种用法，加上直接调本体，一共三条路：

| 用法 | 命令形态 | 什么时候用 |
|---|---|---|
| **双击启动器** | 双击 `atomic\target\ccs12_2_0_check_connection.vbs` | 手工试一次；每个参数弹一个框问你 |
| **启动器带参数** | `cscript /nologo atomic\target\ccs12_2_0_check_connection.vbs "<ccxml>" "<out>"` | 想不弹框，但仍走启动器的默认值与校验 |
| **直接调本体** | `"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" atomic\target\ccs12_2_0_check_connection.js` | 写进流水线；**唯一**能传选项的方式 |

位置参数的顺序在三种用法里完全一致：先是目标配置，再是固件，然后是脚本自己的参数。
选项一律 `--名字 值`。

## 一条完整的命令长什么样

```bat
:: 在仓库根目录执行。省略路径参数时，脚本从配置文件补齐（这里故意省了，验证配置是否装好）
"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" atomic\target\ccs12_2_0_target_state.js
```

输出会分几段：连接、目标身份、状态、最后一行判定。

## 怎么看懂输出

**唯一可靠的成功信号是这一行**：

```
CCS12_2_0_RESULT=OK
```

失败时长这样：

```
CCS12_2_0_RESULT=FAIL <原因>
```

**为什么不能看退出码**：`dss.bat` 不把脚本的退出状态变成自己的进程退出码。实测四种情形
（脚本自己以 1 退出、以 7 退出、自然结束、脚本路径根本不存在）拿到的进程退出码都是 0。
即使换一种读法能读到 1/0，它也分不清"失败"与"脚本没找到"，原因更不在里面。
所以**任何东西都不许用退出码判断成败**——判据只有标记行。

完整契约（含 `.vbs` 与 `.bat` 各自怎么消费这一行）见
[`../dev/dev-launcher-contract.md`](../dev/dev-launcher-contract.md)。

## 在哪个目录执行

**在仓库根目录执行**。脚本靠"从当前目录逐级向上找共享库"来定位自己需要的库文件，
所以：

- 从仓库内的任意子目录启动也可以（会一直向上找到仓库根）；
- 但如果当前目录在**仓库之外**，脚本会报
  `CCS12_2_0_RESULT=FAIL session/session.js not found above <目录>` 并以 1 退出——这是明确的失败，
  不是环境问题。

启动器会把工作目录钉到仓库根，所以用启动器时不必关心这件事。

## 无人值守运行

`.vbs` 启动器默认会给每个参数弹一个框，并且默认值只是**示例值**。要让它在没有人看的场合工作：

```bat
set CCS12_2_0_NONINTERACTIVE=1
cscript /nologo atomic\target\ccs12_2_0_target_state.vbs "<ccxml>"
```

此时每个对话框变成一行控制台输出。**但改目标状态的启动器会拒绝用默认值**——默认值照原样跑
会"成功地做错事"，所以这类启动器要求你把参数写在命令行上。只读的那几个不受限。
哪些属于只读、哪些属于改状态，见
[`../reference/ref-scripts.md`](../reference/ref-scripts.md) 与环境无关的总表
（机器可核对的分类表在 `test/drive_checks.ps1` 顶部）。

## 参数里不能有 `=` 或空格

给 `dss.bat` 的参数里如果出现 `=` 或空格，cmd 会在解析阶段中止，**Java 根本没起来**——
表现是 `... was unexpected at this time`、退出码 255、输出里连标记行都没有。

需要传表达式（例如 `x = 1`）时走环境变量通道：

```bat
set CCS_EVAL_EXPR=x = 1
"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" atomic\expression\ccs12_2_0_eval_expr.js "<ccxml>"
```

三个通道名与各自的用途见
[`../reference/ref-decision-tables.md`](../reference/ref-decision-tables.md)。

## 下一步

- 想做具体的事：[`../guides/`](../guides/)
- 想查某个脚本的参数：[`../reference/ref-scripts.md`](../reference/ref-scripts.md)
