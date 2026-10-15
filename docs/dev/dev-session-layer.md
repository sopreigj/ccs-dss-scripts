# 会话层：共享库的契约

> `session/` 是**库**：它不被用户直接调用，只被上面两层使用。
> 本层是**唯一**知道本技术栈调用顺序的地方——把调用形状关在这里，上层就不必知道。

## 1. 文件与职责边界

| 文件 | 被谁用 | 职责 |
|---|---|---|
| `session/session.js` | 所有脚本 | 会话生命周期、状态查询、收尾、超时与轮询常量 |
| `session/cli.js` | 所有脚本 | 参数解析与校验、退出码常量、位宽白名单 |
| `session/conf.js` | `cli.js`（配置补齐） | 配置文件解析：键取值、配置文件路径、示例文件名 |
| `session/orch_driver.js` | `workflows/` 入口与 `orchestration/` | 驱动门面：把本技术栈的能力暴露成与技术栈无关的名字表 |

**边界**：本层决定"**怎么**做"，不决定"**做什么**"。任何业务判断（该不该写这个地址、
要不要跑这段时间）都属于上层。

> **与另一套实现的结构差异**：那边的配置解析内嵌在会话库里
> （因为它的脚本语言没有模块系统），所以那边是 3 个文件、配置读取分散在两处；
> 本栈是 4 个文件，配置读取集中在一个模块里。见
> [`../reference/ref-stack-differences.md`](../reference/ref-stack-differences.md)。

## 2. `session/session.js` 的导出契约

### 常量

| 名 | 含义 |
|---|---|
| 脚本超时（毫秒） | 单次脚本执行的统一超时。设为足够长的值，是为了容纳大固件的烧录 |
| 轮询间隔（毫秒） | 等待目标停机时的轮询步长 |

### 会话生命周期

| 函数 | 契约 |
|---|---|
| `openTarget(ccxmlPath)` | 配置目标、打开会话、连接目标，**连接后显式停机一次**（不假设连接对目标做了什么）。重复调用复用已有会话 |
| `loadSymbols(session, outPath)` | 只加载符号表，不重新烧录 |
| `readPC(session)` | 读当前程序计数器 |
| `isHalted(session)` | **严格查询**：查询失败就失败，绝不把"问不出来"吞成"没停机" |
| `waitUntilHalted(session, timeoutMs)` | 轮询等待停机；超时返回否定结果而不是抛异常 |
| `sleep(ms)` | 等待 |

### 收尾

| 函数 | 契约 |
|---|---|
| `haltQuietly()` | 尽力停机，不抛异常 |
| `shutdownQuietly()` | 尽力释放会话，不抛异常 |
| `releaseOnExit()` | 声明"正常离开时**不要**停机"（只对成功路径有效；失败路径仍然停机） |
| `finishQuietly()` | 正常收尾：按上面的声明决定是否停机，然后释放会话 |

**顺序是契约的一部分**：正常收尾先停机（或按声明跳过），再释放会话。

## 3. `session/cli.js` 的导出契约

| 名 | 契约 |
|---|---|
| `EXIT_OK` / `EXIT_FAIL` | 退出码常量（0 / 1）。**本技术栈的成败判据就是它** |
| `ALLOWED_BIT_SIZES` | 允许的位宽集合（8 到 64，按 8 递增） |
| `usageError(message, usage)` | 打印错因与用法，**然后以失败退出**（用法错误的统一出口） |
| `parseArgs(argv, spec)` | 解析位置参数与 `--选项`。`spec` 必须声明**接受多少个位置参数**；多余的位置参数是用法错误，不是忽略 |
| `requiredArg(positional, index, name, usage)` | 取第 n 个位置参数，缺失就是用法错误 |
| `requireAbsolutePath(path, label)` | 要求**绝对路径**（输入与输出都一样） |
| `requireAbsoluteFile(path, label)` | 同上，且要求文件存在 |
| `parseAddress(text, label)` | 必须是 `0x` 形式的十六进制。**裸数字被拒绝**，不猜进制 |
| `parseInteger(text, label)` | 十进制整数 |
| `parseNumber(text, label)` | 允许十进制或 `0x` 形式；只接受非负值 |
| `parseBitSize(text, label)` | 位宽，必须落在允许集合里 |

**参数从哪来**：脚本经运行器启动，运行器把脚本名插在命令行里，所以脚本自己从第 3 个位置起读。
这是"不能直接裸调脚本"的原因。

## 4. `session/conf.js` 的导出契约

| 名 | 契约 |
|---|---|
| 配置文件路径 | 仓库根的配置文件位置（由模块自身位置推导，不依赖当前目录） |
| 示例文件名 | 报错文案里要提示用户复制的那个文件名 |
| `get(key)` | 按键取值；**没有配置文件不算错**（返回空，只有真正需要该键时才报错）。键名大小写不敏感 |

读取规则：`键=值`、`#` 开头的整行是注释、值取到行尾整段。完整说明见
[`../reference/ref-configuration.md`](../reference/ref-configuration.md)。

## 5. `session/orch_driver.js` 的名字表

这一层暴露给编排层的名字集合是**冻结契约**：**37 个键**（含哨兵）。

> 这 37 个键与另一套实现的驱动名字表**完全相同**——契约是跨技术栈冻结的，
> 所以 `orchestration/` 里的共享代码可以两边通用。逐键语义与用法见
> [`dev-orchestration-layer.md`](dev-orchestration-layer.md)。

## 6. 改这一层之前

1. 读 [`dev-launcher-contract.md`](dev-launcher-contract.md) 与
   [`dev-language-constraints.md`](dev-language-constraints.md)；
2. 记住本层是**唯一**碰技术栈调用形状的地方——新能力都加在这里，
   不要让上层直接调引擎；
3. 改完跑 [`dev-verification.md`](dev-verification.md) 里的门禁；
4. 如果改了驱动导出的名字，**同笔**更新名字表与编排层自检（否则两边就不一致了）；
5. 如果改了退出码语义，所有提到判定的文档都要同步——权威定义在
   [`dev-launcher-contract.md`](dev-launcher-contract.md)。
