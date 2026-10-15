# 会话层：共享库的契约

> `session/` 是**库**：它不被用户直接调用，只被上面两层装载。
> 本层是**唯一**知道本技术栈调用顺序的地方——把调用形状关在这里，上层就不必知道。

## 1. 文件与职责边界

| 文件 | 被谁用 | 职责 |
|---|---|---|
| `session/session.js` | 所有 `.js`（经引导块装载） | 参数解析与校验、会话语义、结果标记、配置读取 |
| `session/config.vbs` | 只有 `.vbs` 启动器 | 配置文件解析、对话框与非交互规则 |
| `session/orch_driver.js` | `orchestration/` 与 `workflows/` 入口 | 驱动门面：把本技术栈的能力暴露成与技术栈无关的名字表 |

**边界**：本层决定"**怎么**做"，不决定"**做什么**"。任何业务判断（该不该写这个地址、
要不要跑这段时间）都属于上层。

**为什么 `.js` 与 `.vbs` 是两套配置读取实现**：本技术栈没有模块系统，
`.js` 侧只能内嵌一个小解析器；而 `.vbs` 侧需要解析同一个文件、还要负责对话框，
所以它有自己的一份。**改配置格式要同时改两处**——这是本层最容易埋雷的地方。

## 2. `session/session.js` 的导出契约

### 常量

| 名 | 值 / 含义 |
|---|---|
| 哨兵 | `ccs12-dss-session-v1`。引导块装载后断言它，确认真的装进来了 |
| 成功标记行 | `CCS12_2_0_RESULT=OK` |
| 失败标记前缀 | `CCS12_2_0_RESULT=FAIL ` |
| 退出码 | `0` 成功 / `1` 任何失败 |
| 收尾等待 | 释放前的一段固定等待时长（毫秒），用于让目标状态稳定下来 |

### 输出与失败

| 函数 | 契约 |
|---|---|
| `printLog(msg)` | 往 stdout 打一行。**所有**人的正常输出都走它 |
| `hex(value)` | 整数转 `0x` 形式的字符串 |
| `resultFail(reason)` | 只打印失败标记行，不退出 |
| `usageError(message, usage)` | 打印错因与用法，**然后退出**（用法错误的统一出口） |

### 参数层

| 函数 | 契约 |
|---|---|
| `parseArgs(argv, spec)` | 解析位置参数与 `--选项`。`spec` 必须声明**接受多少个位置参数**；多余的位置参数是用法错误，不是忽略 |
| `requiredArg(positional, index, name, usage)` | 取第 n 个位置参数，缺失就是用法错误 |
| `requireAbsolutePath(path, label)` | 要求**绝对路径**（输入与输出都一样），否则用法错误 |
| `requireAbsoluteFile(path, label)` | 同上，且要求文件存在 |
| `parseAddress(text, label)` | 必须是 `0x` 形式的十六进制。**裸数字被拒绝**，不猜进制 |
| `parseInteger(text, label)` | 十进制整数 |
| `parseNumber(text, label)` | 允许十进制或 `0x` 形式；只接受非负值 |
| `parseBitSize(text, allowed, label)` | 位宽，必须落在允许集合里 |
| `confGet(key)` | 从仓库根向上找到的第一个配置文件里取值；**没有配置文件不算错**（只有真正需要该键时才报错） |

### 会话层

| 函数 | 契约 |
|---|---|
| `openTarget(ccxmlPath)` | 建立配置、打开会话、连接目标，**连接后显式停机一次**（不假设连接对目标做了什么）。重复调用时复用已有会话 |
| `loadSymbols(session, outPath)` | 只加载符号表，不重新烧录 |
| `haltQuietly()` | 尽力停机，不抛异常 |
| `closeQuietly(halt)` | 尽力释放会话；`halt` 为真时先停机 |
| `installSafetyHook()` | 注册收尾钩子：脚本被强行终止时尽量把目标停住 |
| `releaseOnExit()` | 声明"正常离开时**不要**停机"（只对成功路径有效；失败路径仍然停机） |
| `finishOk()` | **先**收尾（停机 + 释放），**再**打印成功标记行，然后以 0 退出 |
| `finishFail(reason)` | **先**打印失败标记行，再强制停机、释放，最后以 1 退出 |
| `sleepMs(ms)` | 等待 |

**顺序是契约的一部分**：`finishOk` 先收尾再打标记，所以看到标记意味着"活已经干完"，
而不是"刚开始"。

## 3. `session/config.vbs` 的导出契约

只被 `.vbs` 启动器使用。

| 过程 / 函数 | 契约 |
|---|---|
| `LoadProjectConfig(fso, repoRoot)` | 读仓库根的配置文件，返回一个字典 |
| `ReadTextFileUtf8(path)` | 按 UTF-8 读文本（配置文件可能含中文注释） |
| `ResolveDefault(config, key, envName, fallback)` | 按键取值：环境变量 > 配置文件 > 兜底值。**兜底值一律传空**，本项目没有内置默认 |
| `DeclareLauncherReadOnly()` | 声明本启动器**只读**：无人值守模式下允许采用默认值 |
| `IsNonInteractive()` | 是否处于无人值守模式 |
| `DialogLabel(message)` | 从参数说明里取出适合当输入框标题的部分，并整理成单行 |
| `DialogExtraLines(message, indent)` | 取出参数说明里的补充行，用于在对话框里显示说明 |
| `DefaultRefusal(message)` | 生成"拒绝采用默认值"的提示文案 |

**只读 / 改状态这条分类是机械规则**：没调用 `DeclareLauncherReadOnly` 的启动器默认属于改状态，
在无人值守模式下拒绝用默认值。所以**忘记声明**的后果是"变得更严格"，不是"放松"——方向是安全的。

## 4. `session/orch_driver.js` 的名字表

这一层暴露给编排层的名字集合是**冻结契约**（38 个键，含哨兵），
逐键语义与"新增一对共享工作流"的完整步骤见
[`dev-orchestration-layer.md`](dev-orchestration-layer.md)。

## 5. 改这一层之前

1. 读 [`dev-launcher-contract.md`](dev-launcher-contract.md) 与
   [`dev-language-constraints.md`](dev-language-constraints.md)；
2. 记住本层是**唯一**碰技术栈调用形状的地方——新能力都加在这里，
   不要让上层直接调引擎；
3. 改完跑 [`dev-verification.md`](dev-verification.md) 里的门禁：
   静态门禁会检查引导块是否全仓一致，装置会检查启动器是否与自己的声明自洽；
4. 如果改了标记行或退出码契约，**所有文档里提到判定的地方都要同步**——
   权威定义在 [`dev-launcher-contract.md`](dev-launcher-contract.md)。
