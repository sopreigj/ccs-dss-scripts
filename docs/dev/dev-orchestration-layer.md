# 编排层：共享 main 与驱动契约

> `orchestration/` 里放的是**与技术栈无关**的会话内动作序列。它由 `workflows/` 的入口装载并驱动，
> 自己不认识任何本技术栈的调用名。
>
> **改这一层之前必须读完本文。** 契约的机器可核对版本在 `orchestration/_selftest.js`。

## 1. 三条规则（这一层为什么能"与技术栈无关"）

| # | 规则 |
|---|---|
| 1 | `orchestration/` 里的代码**只能用驱动名字表里的名字**，不直接碰引擎 |
| 2 | 这一层**不含引导块**。它被入口装载，自己不去找共享库——带了引导块就是分层违规 |
| 3 | 这一层**不出现**任何技术栈名、运行器名、仓库名、文档路径。共享代码一旦描述某一侧，对另一侧就是错的 |

规则 2 与 3 由 `orchestration/_selftest.js` 机械检查（静态门禁会跑它）。

## 2. 驱动的名字表（冻结契约）

`session/orch_driver.js` 导出的名字集合是**契约本身**：编排层能用哪些名字，由这张表定义。
一共 38 个键（含哨兵字符串）。按用途分组：

### 参数层

`parseArgs`、`requiredArg`、`requireAbsoluteFile`、`requireAbsolutePath`、`parseAddress`、
`parseInteger`、`parseNumber`、`parseBitSize`、`usageError`、`envList`

> `envList` 把一个分号分隔的环境变量解析成列表（忽略空项、去掉两侧空白）。
> 这是"表达式列表不好写在命令行上"的逃生通道。

### 会话层

`openTarget`、`loadProgram`、`loadSymbols`、`readPC`、`runTarget`、`runForMs`、`haltTarget`、
`isHalted`、`waitUntilHalted`、`step`、`evalExpr`、`evalRaw`、`writeTextFile`、`sleepMs`

- `isHalted` 是**严格查询**：查询失败就失败，绝不把"问不出来"吞成"没停机"；
- `evalExpr` 返回**给人看的**形式（整数带十进制括号）；
- `evalRaw` 返回**给机器用**的形式（整数只有 `0x`），CSV 单元格用它，保证列格式稳定。

### 输出

`printLog`、`hex`

### 重量级复合操作

`readMem`、`writeMem`、`addBreakpoint`、`removeBreakpoint`、`removeAllBreakpoints`、
`runToBreakpoint`、`watchWrite`

这几个是**复合**操作：把多步调用合成一次，并把只有本技术栈才知道的细节（属性标识会失效、
观察点是硬件资源、断点命中要按 PC 比对）吸收在驱动里。

### 收尾

`releaseOnExit`、`finishOk`、`finishFail`

### 哨兵

`sentinel`：入口装载驱动后断言它，确认装载的是"驱动"而不是别的什么。

> **契约的核对方式**：把这张表的键集与实现导出的键集做**机械 diff**，
> 而不是读文档对照。文档只解释语义，键集本身以代码为准。

## 3. 各文件的角色

| 文件 | 角色 |
|---|---|
| `orchestration/load_run.js` | 装载后让目标一直跑（刻意不停机） |
| `orchestration/load_run_read.js` | 装载 → 跑 N 毫秒 → 停机 → 求值表达式（表达式可整体省略） |
| `orchestration/load_write_run_read.js` | 装载 → 等一段 → 写 → 跑 → 回读 |
| `orchestration/run_to_bp.js` | 设断点并运行到它（含"已经在那里"这条正常路径） |
| `orchestration/step.js` | 单步 N 次（含"目标必须已停机"的检查） |
| `orchestration/watch_write.js` | 硬件数据观察点 |
| `orchestration/sample_exprs.js` | 定间隔采样到 CSV（时间列实测） |
| `orchestration/pin_drive.js` | 驱动空闲引脚（先拒后写的顺序） |
| `orchestration/_selftest.js` | 上面三条规则的机械自检，**不是**一个动作 |

## 4. 入口接线（`workflows/` 侧）

每个工作流入口是**纯接线**，不含业务逻辑。以 ccs12 为例，入口做四件事：

1. 装载共享库并断言哨兵；
2. 装载驱动并断言驱动的哨兵；
3. 装载对应的 `orchestration/` 共享 main；
4. 用驱动调用它。

三段装载各有自己的失败出口，都打印失败标记行并以 1 退出——
所以"哪一段没装载成功"在输出里一眼能看出来。

## 5. 新增一对共享工作流：完整步骤

1. **确认归属**：新的"**动作顺序**"放这里；"**怎么完成一个动作**"放驱动；
   文案与判定放共享层。先查受控词汇表（[`../reference/ref-terms.md`](../reference/ref-terms.md)），
   确认不是在造同义词。
2. **写共享 main**：只用名字表里的名字；不写引导块；不出现技术栈名/运行器名/仓库名/文档路径。
3. **跑自检**：确认 `_selftest.js` 的三条规则都过。
4. **写入口接线**：在 `workflows/` 加一个入口，按第 4 节的四件事写。
5. **过静态门禁**：确认引导块逐字一致、行尾与编码正确（见
   [`dev-verification.md`](dev-verification.md)）。
6. **更新契约**：如果你新增/改动了驱动导出的名字，**必须同笔更新名字表与自检**。
   只改文档不算改契约。
7. **更新文档**：本文件 + [`dev-workflows-layer.md`](dev-workflows-layer.md) +
   [`../reference/ref-scripts.md`](../reference/ref-scripts.md)。
8. **真板回归**（有条件时）：跑一遍相关脚本，把它记进
   [`../reference/ref-scripts.md`](../reference/ref-scripts.md) 的对应小节。

## 6. 禁区（每条都有代价）

| 不要 | 代价 |
|---|---|
| 在共享 main 里直接调引擎成员 | 另一侧跑不了；而且绕过了驱动吸收掉的技术栈差异 |
| 在共享 main 里加引导块 | 分层违规；自检会红 |
| 在共享 main 里写技术栈名、运行器名、仓库名、文档路径 | 自检会红；这也是"共享代码只描述一侧"的典型错误 |
| 用现代 JS 语法（`let`/`const`/箭头/模板串/`Object.keys`/`JSON.`） | 本技术栈的脚本语言只到 ES3；门禁会拦 |
| 把"查询失败"吞成某个默认值 | 把"不知道"说成了"知道了"——这是最危险的一类 bug |
| 只在文档里改契约 | 文档不是契约；键集以代码为准 |

## 7. 相关

- 名字表里"怎么完成"的实现：[`dev-session-layer.md`](dev-session-layer.md)
- 工作流入口的写法：[`dev-workflows-layer.md`](dev-workflows-layer.md)
- 语言约束：[`dev-language-constraints.md`](dev-language-constraints.md)
