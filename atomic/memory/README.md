# `atomic/memory/` — 内存

管的是**地址空间**（CPU 寄存器不在这里，见 `../register/`）。

| 脚本 | 一句话 |
|---|---|
| `ccs20_0_1_mem_read.js` | 读一段内存 |
| `ccs20_0_1_mem_write.js` | 往地址写一个值 |
| `ccs20_0_1_mem_fill.js` | 把一段内存填成同一个值 |
| `ccs20_0_1_mem_export.js` | 导出到文件 |
| `ccs20_0_1_mem_import.js` | 从文件导入 |

每个脚本都配同名 `.vbs`。逐参数说明与文件格式见
[`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) 与
[`../../docs/reference/ref-file-formats.md`](../../docs/reference/ref-file-formats.md)。

**读到的值不是"上次停机那一刻的快照"**：每条命令自成一个会话，读到的是本会话开始之后的活值。
如果那个地址是固件在持续改写的变量，两次读到不同值才是对的——见
[`../../docs/guides/gu-inspect-state.md`](../../docs/guides/gu-inspect-state.md)。

**写入会静默截断**（值放不进目标字长时不报错），所以脚本在参数层就拦下这种输入。
覆盖安全寄存器地址且位宽够得着的写入被拒绝，原因见 `../program/README.md`。
