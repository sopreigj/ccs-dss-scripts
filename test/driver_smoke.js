// 真板冒烟：驱动契约（session/orch_driver.js 导出的名字表）的每一类名字至少真实执行一次。
// Usage: run.bat test\driver_smoke.js <ccxml_path> <out_file_path> [watch_addr]
// 运行前需要环境变量 CCS_SMOKE_LIST="a; b;; c"（验证 envList 的分隔/trim/丢空项语义）。
// 每步打印 "OK <名字>"；任何一步抛错走 finishFail（按本栈退出契约 exit 1）。
// 0xD000 是数据区外空闲 RAM；watch_addr 第 3 参可省，省略时读 ccs20_0_1.conf 的 WATCH_ADDR
// （配置收敛 ：.js 与 .bat/.vbs 同源读 conf，机器相关值不再内嵌在代码里）。
var orch = require("../session/orch_driver.js");
var conf = require("../session/conf.js");

var USAGE = "Usage: run.bat test\\driver_smoke.js <ccxml_path> <out_file_path> [watch_addr]";

function ok(name, note) {
    orch.printLog("OK " + name + (note ? "  " + note : ""));
}

var args = orch.parseArgs({ usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: 3 });
var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml");
var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out");
var watchAddr;
if (args.positional.length > 2) {
    watchAddr = orch.parseAddress(args.positional[2], "watch_addr");
} else {
    var confAddr = conf.get("WATCH_ADDR");
    if (confAddr === null) {
        orch.usageError("no watch_addr argument and ccs20_0_1.conf has no WATCH_ADDR -- copy ccs20_0_1.conf.example to ccs20_0_1.conf and fill in your machine's values", USAGE);
    }
    watchAddr = orch.parseAddress(confAddr, "WATCH_ADDR (ccs20_0_1.conf)");
}

try {
    // --- 参数层（离线助手） ---
    var addr = orch.parseAddress("0xD000", "smoke address");
    var runMs = orch.parseInteger("100", "smoke run_ms");
    var bitSize = orch.parseBitSize("16", "smoke bit_size");
    var samePath = orch.requireAbsolutePath(ccxmlPath, "ccxml path again");
    var list = orch.envList("CCS_SMOKE_LIST");
    if (list.length !== 3 || list[1] !== "b") {
        throw new Error("envList(CCS_SMOKE_LIST) expected [a, b, c], got length " + list.length
            + (list.length > 1 ? " item1=" + list[1] : ""));
    }
    if (orch.hex(48879) !== "0xbeef") throw new Error("hex(48879) expected 0xbeef (两栈既定小写口径), got " + orch.hex(48879));
    ok("parseArgs/requiredArg/requireAbsoluteFile/requireAbsolutePath/parseAddress/parseInteger/parseBitSize/envList/hex",
        "list=[a,b,c] hex=" + orch.hex(48879));

    // --- 会话层 ---
    orch.openTarget(ccxmlPath);
    ok("openTarget", "pc=" + orch.readPC());
    orch.printLog("Loading program: " + outPath);
    orch.loadProgram(outPath);
    ok("loadProgram/readPC", "pc=" + orch.readPC());
    var mainShown = orch.evalExpr("main");
    if (mainShown.indexOf("0x") !== 0) throw new Error("evalExpr(main) expected to start with 0x, got " + mainShown);
    ok("evalExpr", "main = " + mainShown);

    // --- 重量级复合 1：runToBreakpoint。loadProgram 停在 main ⇒ 必须走 "alreadyAt" 命中路径。
    var r = orch.runToBreakpoint("main", 5000);
    if (!r.hit || !r.alreadyAt) {
        throw new Error("runToBreakpoint(main) expected hit+alreadyAt, got hit=" + r.hit
            + " alreadyAt=" + r.alreadyAt + " halted=" + r.halted + " pc=" + r.pc);
    }
    ok("runToBreakpoint", "alreadyAt pc=" + r.pc);

    // --- step：从 main 单步一条，PC 必须变化 ---
    var pcBefore = orch.readPC();
    orch.step("into");
    var pcAfter = orch.readPC();
    if (pcBefore === pcAfter) throw new Error("step(into) did not move PC (stayed " + pcBefore + ")");
    ok("step", pcBefore + " -> " + pcAfter);

    // --- runForMs + isHalted ---
    var pcRun = orch.runForMs(runMs);
    if (!orch.isHalted()) throw new Error("isHalted() false after runForMs");
    ok("runTarget/runForMs/haltTarget/isHalted/waitUntilHalted(sleepMs via runForMs)", "pc=" + pcRun);

    // --- 断点增删（数据区地址，只验证机制，不真跑） ---
    var bpId = orch.addBreakpoint("0xD000");
    orch.removeBreakpoint(bpId);
    ok("addBreakpoint/removeBreakpoint", "id=" + bpId);

    // --- 重量级复合 2：watchWrite。观察点必须下在"固件持续写的地址"（watchAddr：第 3 参，
    // 省略时读 conf WATCH_ADDR——本机固件持续写的那个地址），不能用 addr——那是 0xD000 空闲
    // RAM，固件永远不会写它（它能跨会话保持正是因为没人写），下在那里必然超时（首轮就是这样失败的）。
    var w = orch.watchWrite(watchAddr, "Write", 0);
    orch.printLog("watchWrite id=" + w.id + " haltOnTrigger=" + w.haltOnTrigger + "; running...");
    orch.runTarget();
    var triggerHalted = orch.waitUntilHalted(2000);
    if (!triggerHalted) {
        orch.removeAllBreakpoints();
        throw new Error("watchWrite(" + orch.hex(watchAddr) + ") did not halt within 2000 ms");
    }
    var observed = orch.readMem(addr, 16, 1);
    orch.removeAllBreakpoints();
    ok("watchWrite/runTarget/waitUntilHalted/removeAllBreakpoints",
        "pc=" + orch.readPC() + " value=0x" + observed[0].toString(16));

    // --- 内存读写（0xD000 空闲 RAM，写读回验） ---
    orch.writeMem(addr, 0xBEEF, bitSize);
    var back = orch.readMem(addr, bitSize, 2);
    if ((back[0] & 0xFFFF) !== 0xBEEF) throw new Error("writeMem/readMem mismatch: expected 0xbeef, got 0x" + back[0].toString(16));
    ok("readMem/writeMem", "0xD000 = 0x" + back[0].toString(16));

    orch.printLog("DRIVER SMOKE PASSED");
    orch.finishOk();
} catch (err) {
    orch.finishFail("driver smoke failed: " + err.message);
}
