# 目标：改目标的状态

这一类操作**会改变目标**。用到的脚本：

| 想做什么 | 用哪个脚本 |
|---|---|
| 往一个地址写一个值 | `atomic/memory/ccs12_2_0_mem_write.js` |
| 把一段内存填成同一个值 | `atomic/memory/ccs12_2_0_mem_fill.js` |
| 写一个 CPU 寄存器 | `atomic/register/ccs12_2_0_write_reg.js` |
| 执行一个赋值表达式（变量、外设寄存器域） | `atomic/expression/ccs12_2_0_write_expr.js` |
| 写入之后还要运行，再看写进去的值有没有留住 | `workflows/ccs12_2_0_load_write_run_read.js` |

## 三个必须知道的语义

### 1. 写入本身不保证"看得见"

写完立刻读回，可能看到的还是**旧值**——如果程序正在启动阶段，它的初始化会把你写的值覆盖掉。
这不是写失败。

正确的验证姿势是**写、跑一段、再回读**，而且要在同一个会话里：

```bat
set CCS_WRITE_EXPR=your_symbol.Var = 1
set CCS_EVAL_EXPR=your_symbol.Var
"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" workflows\ccs12_2_0_load_write_run_read.js "<ccxml>" "<out>" 2000 --settle 500
```

`--settle 500` 的意思是"先让程序跑 500 毫秒把启动初始化跑过去，再写"。
没有它，写进去的值会在随后的启动初始化里被冲掉。

**赋值报告没有报错，不等于值留住了。** 只有"写完 + 跑 + 回读"这三步才算验证。

### 2. 写寄存器之后回读不相等，是正常的

有些寄存器有**被硬件强制**的位或**只读**位，写进去一个值、读回来是另一个值，这对它们是正常行为。
所以这类脚本**不会**把"写进去与读回来不一致"当成失败——否则正常的写入会变成假失败。
如果你需要严格校验，请自己比对读回值。

### 3. 有些写入被主动拒绝

涉及芯片安全模块（CSM）的写入被**主动拒绝**，因为一旦生效就不可恢复：写 CSM 密码、
以及在覆盖安全寄存器地址的区间上写入会置位锁定位的值。这些拒绝发生在**打开会话之前**，
所以可离线复测，也不会碰硬件。

被拒绝的操作清单与原因见
[`../reference/ref-scripts.md`](../reference/ref-scripts.md) 的 `flash_op` 与内存脚本两节。

## 例：往一段空闲内存写值并验证

```bat
:: 挑一个固件不会碰的地址（比如数据区外的空闲 RAM）证明"写路径是通的"
"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" atomic\memory\ccs12_2_0_mem_write.js 0xD000 0xBEEF 16
"%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat" atomic\memory\ccs12_2_0_mem_read.js 0xD000 16 1
```

这里两次调用是分开的会话，能读回同一个值，是因为**固件不会去写这块空闲内存**。
反过来说：如果你挑的是固件自己的变量区，分开两次调用很可能读回别的值——那是会话边界的后果，
不是写失败。要证明那种地址上的写入生效，请用上面 `--settle` 的工作流。

## 表达式怎么传（重要）

`--set "x = 1"` 这种参数里有 `=` 与空格，**直接写在命令行上会被 cmd 拆掉**，
表现是 `... was unexpected at this time`、退出码 255、输出里连标记行都没有。所以：

| 环境变量 | 用途 |
|---|---|
| `CCS_WRITE_EXPR` | 默认的赋值表达式 |
| `CCS_EVAL_EXPR` | 默认的求值表达式（多个用 `;` 分隔） |

也可以把赋值表达式写成**不含空格**的形式（如果语言允许），但走环境变量是更稳的做法。

## 安全提醒

脚本退出时释放目标，**目标随后继续自由运行固件**（对外设而言就是那些输出可能仍在活动状态）。
脚本被强行终止时会先把目标停住再退出，但没有任何脚本能保证"离开后目标保持停机"。
确定停机的手段是断电或固件自身的停止逻辑。本仓库不是安全控制系统。

## 下一步

- 在运行中抓现场：[`gu-debug-target.md`](gu-debug-target.md)
- 完整参数表：[`../reference/ref-scripts.md`](../reference/ref-scripts.md)
