# `atomic/register/` — CPU 寄存器

管的是**寄存器名空间**里的量（外设寄存器是内存映射的，见 `../memory/`）。

| 脚本 | 一句话 |
|---|---|
| `ccs12_2_0_read_reg.js` | 读一个或多个 CPU 寄存器 |
| `ccs12_2_0_write_reg.js` | 写一个 CPU 寄存器 |

每个脚本都配同名 `.vbs`。逐参数说明见
[`../../docs/reference/ref-scripts.md`](../../docs/reference/ref-scripts.md) 的 `atomic/register/` 一节。

**写完回读不一定相等**：有些寄存器有被硬件强制的位或只读位。所以写寄存器**不把
"写进去与读回来不同"当作失败**——否则正常的写入会变成假失败。需要严格校验时请自己比对读回值。

**外设寄存器不在这里**：它们是内存映射的，用 `../memory/` 的脚本或表达式赋值来写。
