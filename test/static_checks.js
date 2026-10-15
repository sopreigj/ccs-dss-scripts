// 机械复核（无副作用）：语法、.vbs 编译、Qt() 定义、行尾。全部按"实测"输出计数，不靠断言推断。
//  %TEMP% 入库（原 ccs20_0_1_static_checks.js）：repo 改为按本文件位置推导，
// 使装置从仓库内任何位置可复跑——这正是它入库的原因（ 的处置，见 the verification notes ）。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repo = path.join(__dirname, "..");

function walk(dir, ext, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            walk(full, ext, out);
        } else if (entry.name.endsWith(ext)) {
            out.push(full);
        }
    }
    return out;
}

let bad = 0;

const jsFiles = walk(repo, ".js", []);
let jsBad = [];
for (const file of jsFiles) {
    try {
        execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (err) {
        jsBad.push(file + "\n" + String(err.stderr));
    }
}
console.log("node --check: " + (jsFiles.length - jsBad.length) + "/" + jsFiles.length);
jsBad.forEach((m) => { bad++; console.log("SYNTAX FAIL: " + m); });

const vbsFiles = walk(repo, ".vbs", []);
const tmpDir = path.join(process.env.TEMP, "ccs20_0_1_vbs_compile");
fs.mkdirSync(tmpDir, { recursive: true });
let compileOk = 0;
for (const file of vbsFiles) {
    const text = fs.readFileSync(file, "latin1");
    // Qt() 只在运行时才会被解析到：漏定义时编译检查看不出来，所以单独查一次定义是否存在。
    if (/\bQt\(/.test(text) && !/Function\s+Qt\s*\(/.test(text)) {
        bad++;
        console.log("MISSING Qt DEFINITION: " + path.basename(file));
    }
    const patched = text.replace('Set WshShell = CreateObject("WScript.Shell")', "WScript.Quit 0");
    if (patched === text) {
        bad++;
        console.log("NO SHELL LINE TO PATCH: " + path.basename(file));
    }
    const dst = path.join(tmpDir, path.basename(file));
    fs.writeFileSync(dst, patched, "latin1");
    try {
        execFileSync("cscript", ["//nologo", dst], { stdio: "pipe" });
        compileOk++;
    } catch (err) {
        bad++;
        console.log("COMPILE FAIL: " + path.basename(file) + " :: " + String(err.stdout || err.stderr).trim());
    }
}
console.log(".vbs compile: " + compileOk + "/" + vbsFiles.length);

for (const file of walk(repo, ".vbs", []).concat(walk(repo, ".bat", []), walk(repo, ".conf", []))) {
    const raw = fs.readFileSync(file, "latin1");
    const loneLf = raw.split("\n").length - raw.split("\r\n").length;
    if (loneLf > 0) {
        bad++;
        console.log("LF LINE ENDING (" + loneLf + "): " + file);
    }
}
console.log(".vbs/.bat/.conf line endings: checked");

// ES3 纪律（规则见 session/orch_driver.js 头部）：驱动与 orchestration/ 共享源码只写 ES3 子集——
// node --check 接受 let/const/模板串，而本栈运行时不一定有，所以必须单列禁词扫描。
var orchFiles = [];
var orchDir = path.join(repo, "orchestration");
if (fs.existsSync(orchDir)) walk(orchDir, ".js", orchFiles);
orchFiles.push(path.join(repo, "session", "orch_driver.js"));
orchFiles.push(path.join(repo, "test", "driver_smoke.js"));
var es3Rules = [
    [/\blet\s+[A-Za-z_$]/, "let"],
    [/\bconst\s+[A-Za-z_$]/, "const"],
    [/=>/, "arrow"],
    [/`/, "backtick"],
    [/\$\{/, "template-interpolation"],
    [/Object\.keys/, "Object.keys"],
    [/\bJSON\./, "JSON."],
    [/\bclass\s+[A-Za-z_$]/, "class"],
];
var es3Violations = 0;
for (var k = 0; k < orchFiles.length; k++) {
    var src = fs.readFileSync(orchFiles[k], "utf8");
    // 扫描对象是代码不是注释——驱动头注释会合法地列出禁词本身（首轮就是被这一行咬住的）。
    // 假设：被检文件的字符串里不含 "//" 或 "/*"（当前两个文件满足；破坏该假设会漏报，不会误报）。
    var codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (var r = 0; r < es3Rules.length; r++) {
        if (es3Rules[r][0].test(codeOnly)) {
            es3Violations++;
            bad++;
            console.log("ES3 VIOLATION (" + es3Rules[r][1] + "): " + path.relative(repo, orchFiles[k]));
        }
    }
}
console.log("ES3 discipline: " + orchFiles.length + " files, " + es3Violations + " violation(s)");

// 共享层规则（orchestration/_selftest.js 是唯一出处，两侧仓共用同一份）：
// 共享 main 不得携带入口引导块，也不得出现任何"偏袒某一栈"的字样（仓名/版本/启动器/文档路由）。
// 这替代了原来的跨仓 parity 装置——那个需要姊妹仓在位，单仓跑不了。
const sharedSelfTest = path.join(repo, "orchestration", "_selftest.js");
if (fs.existsSync(sharedSelfTest)) {
    try {
        execFileSync(process.execPath, [sharedSelfTest], { stdio: "pipe" });
        console.log("shared layer rules: OK");
    } catch (err) {
        bad++;
        console.log("SHARED LAYER FAIL: " + String(err.stdout || err.stderr).trim());
    }
} else {
    bad++;
    console.log("SHARED LAYER FAIL: orchestration/_selftest.js is missing");
}

console.log(bad === 0 ? "ALL CHECKS PASSED" : bad + " PROBLEM(S)");
process.exit(bad === 0 ? 0 : 1);
