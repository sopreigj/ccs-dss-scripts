# `atomic/` — 原子脚本

**一层：一次调用做一件事，各开一个会话。**

- 需要"同一个会话里连续做几步"的流程 → 用 `../workflows/`（这里的脚本做不到）。
- 逐脚本的参数、退出码、"不做"清单 → [`../docs/reference/ref-scripts.md`](../docs/reference/ref-scripts.md)
- 为什么这么分类、只读与改状态的区分 → [`../docs/reference/ref-atomic-scripts.md`](../docs/reference/ref-atomic-scripts.md)

## 分类

| 目录 | 管什么 | 脚本 |
|---|---|---|
| [`target/`](target/) | 连接与运行控制 | 连接、报告状态、运行、停机、复位、运行 N 毫秒 |
| [`program/`](program/) | 程序与 flash | 装载、校验、flash 操作 |
| [`memory/`](memory/) | 内存 | 读、写、填充、导出、导入 |
| [`register/`](register/) | CPU 寄存器 | 读、写 |
| [`expression/`](expression/) | 表达式 | 求值、赋值 |

## 每个脚本的两个文件

```
ccs12_2_0_<动作>.js     本体
ccs12_2_0_<动作>.vbs    启动器（双击可用）
```

**两个文件必须同目录、同名成对**：启动器靠自身位置找同名 `.js`。
代码文件一律 ASCII，中文只进 `.md`。
