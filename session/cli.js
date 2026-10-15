// 命令行层：所有脚本共用的参数解析、输入校验与退出码约定。
//
// 存在的理由：原来各脚本的参数约定互相冲突且没有一个是完整的——
//   * `.out` 有四种互不兼容的传法（位置参数 / 可选位置 / --symbols / 成对位置）；
//   * 地址进制不一致：mem_write 把裸 `8000` 当十六进制，mem_read 当十进制；
//   * `--symbols` 只在"第一个可选参数位"被识别，写在后面会被当成待求值表达式；
//   * 非法地址在 try 之外抛出，用户看到的是堆栈而不是"地址格式不对"。
// 这里把约定固定成一套，并由所有脚本共享。
//
// 约定：
//   * 位置参数固定为：<ccxml_path> [<out_file_path>] ...（先 ccxml，再 out）；
//   * 选项一律 `--名字 值`，可出现在任意位置，顺序无关；
//   * 地址必须显式写 `0x` 前缀（如 `0xC000`）——裸数字被拒绝，避免"到底是几进制"的歧义；
//   * 退出码：0 = 成功；1 = 任何失败（用法、文件、会话、操作）。

const fs = require("fs");
const path = require("path");
const conf = require("./conf.js");

const EXIT_OK = 0;
const EXIT_FAIL = 1;

// 用法/参数错误：把错因和用法一起打出来，然后按统一退出码退出。
function usageError(message, usage) {
    console.error("Error: " + message);
    if (usage) console.error(usage);
    process.exit(EXIT_FAIL);
}

// 解析 argv（不含 node 与脚本名）。spec.flags 形如：
//   { "--symbols": { takesValue: true }, "--settle": { takesValue: true, parse: parseInteger } }
// 返回值：{ positional: [...], flags: { "--symbols": value } }；repeat: true 时收集为数组。
function parseArgs(argv, spec) {
    const flagsSpec = spec.flags || {};
    let positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (Object.prototype.hasOwnProperty.call(flagsSpec, token)) {
            const def = flagsSpec[token];
            if (!def.takesValue) {
                flags[token] = true;
                continue;
            }
            if (i + 1 >= argv.length) usageError("option " + token + " requires a value", spec.usage);
            const raw = argv[++i];
            const value = def.parse ? def.parse(raw, token) : raw;
            if (def.repeat) {
                if (!flags[token]) flags[token] = [];
                flags[token].push(value);
            } else {
                flags[token] = value;
            }
        } else if (token.length > 1 && token.slice(0, 2) === "--") {
            usageError("unknown option: " + token, spec.usage);
        } else {
            positional.push(token);
        }
    }
    // confFill（spec 字段，配置收敛 ）：脚本声明其**前导路径位置参数**
    // 可由 ccs20_0_1.conf 补齐。规则刻意做成确定性二分：
    //   * positional[0] 是 Windows 绝对路径样（X:\…）⇒ 整体不干预，显式参数永远优先；
    //   * 否则（首参缺位，或首个位置参数是地址/表达式/数字等非路径）⇒ 把 confFill 声明的键
    //     值**整体前置**补齐。这正是"省略 ccxml/out 直接跑"的形态，也不与"给了 ccxml 少给 out"
    //     这类半省略混淆——半省略仍是用法错误（要么全给、要么全不给）。
    // 命中的键在 conf 里缺失/为空 ⇒ 用法错误，文案指向 example；conf 文件本身缺失也是同一出口
    // （缺文件不单独报错，未命中 confFill 的路径根本不读它）。
    if (spec.confFill && spec.confFill.length > 0) {
        const first = positional.length > 0 ? positional[0] : null;
        const firstIsPath = first !== null && /^[A-Za-z]:[\\/]/.test(first);
        if (!firstIsPath) {
            const filled = [];
            for (let k = 0; k < spec.confFill.length; k++) {
                const name = spec.confFill[k];
                const value = conf.get(name);
                if (value === null) {
                    usageError(
                        "confFill " + name + ": no value for it and no explicit argument was given -- copy "
                            + path.join(path.dirname(conf.CONF_PATH), conf.EXAMPLE_NAME)
                            + " to " + path.basename(conf.CONF_PATH) + " and fill in your machine's values",
                        spec.usage);
                }
                filled.push(value);
            }
            positional = filled.concat(positional);
        }
    }
    // maxPositional 必须显式声明：数字 = 该脚本合法接受的最多位置参数；null = 尾参数是变长列表
    // （表达式列表、寄存器列表等，已在 spec 里写明"无上限"）。不声明就抛错，而不是默认不检查——
    // 静默忽略多余位置参数属于硬规则第 4 条禁止的"失败仍返回成功"的同类缺陷
    // （`load_program <ccxml> <out> junk` 曾经照样 exit 0，参数写错却看不出来）。
    // 这里抛的是编程错误而不是用法错误：它是脚本作者漏写，不是用户用错。
    if (spec.maxPositional === undefined) {
        throw new Error("parseArgs: spec.maxPositional is required (a number, or null for a variadic tail)");
    }
    if (spec.maxPositional !== null && positional.length > spec.maxPositional) {
        usageError("too many arguments: " + positional.slice(spec.maxPositional).join(" "), spec.usage);
    }
    return { positional: positional, flags: flags };
}

// 取第 n 个位置参数；缺失时报用法错误。
function requiredArg(positional, index, name, usage) {
    if (index >= positional.length || positional[index] === "") {
        usageError("missing required argument: " + name, usage);
    }
    return positional[index];
}

// 路径必须绝对。**输出**路径也要绝对，理由不是洁癖而是实测：相对路径交给调试器一侧解析后
// 落在 <CCS_ROOT>\ccs\ccs_base\DebugServer\bin 下（两个不同当前目录各跑一次，落点相同 ⇒
// 与调用者 CWD 无关），既不在仓库也不在 %TEMP%，而脚本日志只回显那个相对名 ⇒
// "文件写到哪里去了"不可知。与 mem_import 的输入路径同一口径（原来只有输入要求绝对，
// 输出的不对称没有任何理由）。
function requireAbsolutePath(filePath, label) {
    if (!path.isAbsolute(filePath)) {
        usageError(label + " must be an absolute path: " + filePath, null);
    }
    return filePath;
}

// 输入路径：绝对 + 真实存在。CCS 的 configure/loadProgram 都要求绝对路径，
// 相对路径在脚本里会以难以定位的方式失败。
function requireAbsoluteFile(filePath, label) {
    requireAbsolutePath(filePath, label);
    if (!fs.existsSync(filePath)) {
        usageError(label + " not found: " + filePath, null);
    }
    return filePath;
}

// 地址：强制 `0x` 前缀的十六进制。裸数字一律拒绝——原来 mem_read/mem_write 对裸数字的
// 进制解释相反，同一个 `8000` 读写的是两个不同地址，这种歧义必须在入口消掉。
function parseAddress(text, label) {
    const name = label || "address";
    if (!/^0[xX][0-9a-fA-F]+$/.test(text)) {
        usageError(name + " must be hexadecimal with a 0x prefix (e.g. 0xC000), got: " + text, null);
    }
    const value = parseInt(text, 16);
    if (!Number.isSafeInteger(value) || value < 0) {
        usageError(name + " out of range: " + text, null);
    }
    return value;
}

// 十进制整数（毫秒数、次数、位宽等）。
function parseInteger(text, label) {
    const name = label || "value";
    if (!/^\d+$/.test(text)) {
        usageError(name + " must be a non-negative decimal integer, got: " + text, null);
    }
    const value = parseInt(text, 10);
    if (!Number.isSafeInteger(value)) {
        usageError(name + " out of range: " + text, null);
    }
    return value;
}

// 数值：接受 `0x` 十六进制或十进制。
function parseNumber(text, label) {
    const name = label || "value";
    if (/^0[xX][0-9a-fA-F]+$/.test(text)) return parseInt(text, 16);
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    usageError(name + " must be decimal or 0x-prefixed hexadecimal, got: " + text, null);
    return 0;
}

const ALLOWED_BIT_SIZES = [8, 16, 24, 32, 40, 48, 64];

function parseBitSize(text, label) {
    const value = parseInteger(text, label || "bit size");
    if (ALLOWED_BIT_SIZES.indexOf(value) < 0) {
        usageError("bit size must be one of " + ALLOWED_BIT_SIZES.join("/") + ", got: " + text, null);
    }
    return value;
}

module.exports = {
    EXIT_OK: EXIT_OK,
    EXIT_FAIL: EXIT_FAIL,
    ALLOWED_BIT_SIZES: ALLOWED_BIT_SIZES,
    usageError: usageError,
    parseArgs: parseArgs,
    requiredArg: requiredArg,
    requireAbsolutePath: requireAbsolutePath,
    requireAbsoluteFile: requireAbsoluteFile,
    parseAddress: parseAddress,
    parseInteger: parseInteger,
    parseNumber: parseNumber,
    parseBitSize: parseBitSize,
};
