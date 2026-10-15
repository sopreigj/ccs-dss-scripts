// 机器本地配置读取：ccs20_0_1.conf 的最小解析器（KEY=VALUE、# 整行注释、键大小写不敏感）。
//
// 存在的理由（配置收敛 ）：机器/项目相关的值只维护在 conf 一处，
// .js 与 .bat/.vbs 走同一个来源——本模块被 session/cli.js 的 parseArgs confFill 消费。
// 缺文件本身不报错（未命中 confFill 就永远不读它）；命中 confFill 而键缺失时才给用法错误，
// 报错文案指向同目录的 ccs20_0_1.conf.example（复制-改名-填值）。
const fs = require("fs");
const path = require("path");

const CONF_PATH = path.join(__dirname, "..", "ccs20_0_1.conf");
const EXAMPLE_NAME = "ccs20_0_1.conf.example";

let table = null;

function load() {
    if (table) return table;
    table = {};
    if (!fs.existsSync(CONF_PATH)) return table;
    const lines = fs.readFileSync(CONF_PATH, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.charAt(0) === "#") continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        table[line.slice(0, eq).trim().toUpperCase()] = line.slice(eq + 1).trim();
    }
    return table;
}

// 取键：存在返回值（非空串），缺失返回 null。键名大小写不敏感。
function get(key) {
    const value = load()[String(key).toUpperCase()];
    return value === undefined || value === null || value === "" ? null : value;
}

module.exports = {
    CONF_PATH: CONF_PATH,
    EXAMPLE_NAME: EXAMPLE_NAME,
    get: get,
};
