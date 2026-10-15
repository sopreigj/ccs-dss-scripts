# 新增一个脚本

> 两种脚本分开写：原子脚本（一次调用做一件事）与工作流（一个会话内多步）。
> 先确定你要加的属于哪种——**判据是"这件事单独跑有意义吗"**。

## 0. 先做三件事

1. **查受控词汇表** [`../reference/ref-terms.md`](../reference/ref-terms.md)：
   这个概念已经有名字了吗？如果有，用现成的名字，**不要造同义词**。
   也要搜一遍现有脚本的用法行——大多数"缺一个脚本"的情况其实是"该用哪个工作流"。
2. **确定归属层**：动作的**顺序**放 `orchestration/`；**怎么完成一个动作**放驱动；
   参数与文案放共享层。见 [`dev-architecture.md`](dev-architecture.md)。
3. **确定分类与只读性**（原子脚本）：属于 `target/` / `program/` / `memory/` / `register/` /
   `expression/` 哪一类？它是只读还是改状态？后者决定启动器在无人值守模式下的行为。

## 1. 原子脚本：步骤

1. **写 `.js`**：
   - 文件开头写用法行（位置参数顺序 + 选项）；
   - 加**引导块**——从现有脚本整段复制，**不要手打**（它必须逐字节一致）；
   - 用共享库的参数解析函数，并**声明接受多少个位置参数**；
   - 地址用地址解析、路径用绝对路径校验；
   - 结尾按契约收尾：成功走 `finishOk`，失败走 `finishFail`（带原因）。
2. **写 `.vbs`**：同目录、同名。顺序：
   - 头部说明（这个启动器**改不改目标状态**，以及无人值守模式下的行为）；
   - 声明区放最前；
   - 装载共享配置库并断言哨兵；
   - 只读的启动器要**显式声明只读**，改状态的不要声明（默认就是改状态）；
   - 每个参数用回退链取值，并在对话框里给出说明文字。
3. **把它加进两处文档**：脚本头部的用法行是权威，
   [`../reference/ref-scripts.md`](../reference/ref-scripts.md) 补一节，
   [`../reference/ref-atomic-scripts.md`](../reference/ref-atomic-scripts.md) 的分类表补一行。
4. **把它加进装置表**（若它会被装置覆盖）：`test/README.md` 的装置表 + 启动器分类表。

## 2. 工作流：步骤

见 [`dev-orchestration-layer.md`](dev-orchestration-layer.md) 第 5 节（新增一对共享工作流的
完整步骤），以及 [`dev-workflows-layer.md`](dev-workflows-layer.md) 第 5 节。
要点：工作流入口是**纯接线**，业务逻辑在共享 main 与驱动里。

## 3. 通用检查清单

- [ ] 文件名与分类符合约定（前缀、动作名取自词汇表）；
- [ ] `.js` 与 `.vbs` 同目录同名成对（原子脚本）；
- [ ] 引导块是**整段复制**的，没有手打；
- [ ] 行尾正确（`.js` LF、`.vbs` LF 之外的 Windows 脚本按属性表）；
- [ ] 代码文件 ASCII-only；
- [ ] 没有现代 JS 语法（ES3 禁词）；
- [ ] 位置参数个数已声明；
- [ ] 地址带 `0x` 前缀的校验；
- [ ] 路径用绝对路径校验；
- [ ] 失败路径打印失败标记行并带**原因**；
- [ ] 用法行、参考文档、装置表三处都更新了；
- [ ] 跑过 [`dev-verification.md`](dev-verification.md) 里对应的门禁；
- [ ] 如果改了驱动导出的名字，**同笔**改了名字表与自检。

## 4. 删除一个脚本时

删除比新增更容易留坑：

1. 删掉成对的 `.js` 与 `.vbs`；
2. 全仓搜索它的名字（**含文档、示例、装置、注释**）；
3. 从三处文档里移除：用法行所在文件、[`../reference/ref-scripts.md`](../reference/ref-scripts.md)、
   装置表；
4. 如果它是某个工作流或示例依赖的，先处理依赖。

**遗留的引用比缺文件更糟**：读者会去找一个不存在的东西。

## 5. 相关

- 分层与依赖方向：[`dev-architecture.md`](dev-architecture.md)
- 判定与启动器契约：[`dev-launcher-contract.md`](dev-launcher-contract.md)
- 语言约束：[`dev-language-constraints.md`](dev-language-constraints.md)
- 门禁：[`dev-verification.md`](dev-verification.md)
