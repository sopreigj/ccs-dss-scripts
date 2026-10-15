// Real-board smoke: every family of the driver contract
// executed at least once through session/orch_driver.js.
//
// Usage: dss.bat test\driver_smoke.js <ccxml_path> <out_file_path> [watch_addr]
// Needs env CCS_SMOKE_LIST="a; b;; c" (exercises envList split/trim/empty-drop semantics).
// Prints "OK <name>" per step. dss.bat's own process exit code is always 0 (measured),
// so the verdict is the stdout marker: CCS12_2_0_RESULT=OK (finishOk) vs CCS12_2_0_RESULT=FAIL
// (finishFail). 0xD000 is idle RAM outside the program data area. watch_addr is optional:
// when omitted the value comes from ccs12_2_0.conf WATCH_ADDR.
//
// ASCII only (repo rule D9).
importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.io);
importPackage(Packages.java.lang);

// --- shared library bootstrap ---------------------------------------------
// Rhino has no require(): load() must be given an absolute path, it resolves relative
// paths against the CWD rather than the script's own directory, and it reports a missing
// file by printing one line and returning normally. So: find session/session.js by
// walking up from the CWD, check it, load it, and assert the sentinel afterwards.
var __dir = new java.io.File(System.getProperty("user.dir"));
var __lib = null;
while (__dir != null && __lib == null) {
    var __cand = new java.io.File(__dir, "session/session.js");
    if (__cand.exists()) { __lib = __cand; } else { __dir = __dir.getParentFile(); }
}
if (__lib == null) {
    java.lang.System.out.println("CCS12_2_0_RESULT=FAIL session/session.js not found above "
        + System.getProperty("user.dir") + " -- run from inside the repository, or use the .vbs launcher.");
    java.lang.System.exit(1);
}
load(__lib.getAbsolutePath());
if (typeof LIB_SENTINEL === "undefined" || LIB_SENTINEL !== "ccs12-dss-session-v1") {
    java.lang.System.out.println("CCS12_2_0_RESULT=FAIL session/session.js did not load: " + __lib.getAbsolutePath());
    java.lang.System.exit(1);
}
// --------------------------------------------------------------------------

// --- orch driver load ----------------------------------------------------
// Same shape as the session.js load above: absolute path, load(), sentinel assert.
// load() prints one line and returns on a missing file, so the sentinel is the check.
var __driver = new java.io.File(__lib.getParentFile(), "orch_driver.js");
load(__driver.getAbsolutePath());
if (typeof ORCH_DRIVER === "undefined" || ORCH_DRIVER.sentinel !== "ccs-orch-driver-v1") {
    java.lang.System.out.println("CCS12_2_0_RESULT=FAIL session/orch_driver.js did not load: " + __driver.getAbsolutePath());
    java.lang.System.exit(1);
}
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------

var orch = ORCH_DRIVER;
var USAGE = "Usage: dss.bat test\\driver_smoke.js <ccxml_path> <out_file_path> [watch_addr]";

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
    var confAddr = confGet("watch_addr");
    if (confAddr === null) {
        orch.usageError("no watch_addr argument and ccs12_2_0.conf has no watch_addr -- copy " +
            "ccs12_2_0.conf.example to ccs12_2_0.conf and fill in your machine's values", USAGE);
    }
    watchAddr = orch.parseAddress(confAddr, "watch_addr (ccs12_2_0.conf)");
}

try {
    // --- parameter layer (offline helpers) ---
    var addr = orch.parseAddress("0xD000", "smoke address");
    var runMs = orch.parseInteger("100", "smoke run_ms");
    var bitSize = orch.parseBitSize("16", "smoke bit_size");
    orch.requireAbsolutePath(ccxmlPath, "ccxml path again");
    var list = orch.envList("CCS_SMOKE_LIST");
    if (list.length !== 3 || list[1] !== "b") {
        orch.finishFail("envList(CCS_SMOKE_LIST) expected [a, b, c], got length " + list.length
            + (list.length > 1 ? " item1=" + list[1] : ""));
    }
    if (orch.hex(48879) !== "0xbeef") {
        orch.finishFail("hex(48879) expected 0xbeef (lowercase, both implementations), got " + orch.hex(48879));
    }
    ok("parseArgs/requiredArg/requireAbsoluteFile/requireAbsolutePath/parseAddress/parseInteger/parseBitSize/envList/hex",
        "list=[a,b,c] hex=0xbeef");

    // --- session layer ---
    orch.openTarget(ccxmlPath);
    ok("openTarget", "pc=" + orch.readPC());
    orch.printLog("Loading program: " + outPath);
    orch.loadProgram(outPath);
    ok("loadProgram/readPC", "pc=" + orch.readPC());
    var mainShown = orch.evalExpr("main");
    if (!mainShown || mainShown.length === 0) throw new Error("evalExpr(main) returned nothing");
    ok("evalExpr", "main = " + mainShown);

    // --- composite 1: runToBreakpoint. loadProgram parks the CPU at main, so this must
    // take the alreadyAt hit path (the main-path trap, not an edge case).
    var r = orch.runToBreakpoint("main", 5000);
    if (!r.hit || !r.alreadyAt) {
        orch.printLog("runToBreakpoint detail: hit=" + r.hit + " alreadyAt=" + r.alreadyAt
            + " halted=" + r.halted + " pc=" + r.pc + " expected=" + r.expected);
        throw new Error("runToBreakpoint(main) expected hit+alreadyAt");
    }
    ok("runToBreakpoint", "alreadyAt pc=" + r.pc);

    // --- step: one source step from main must move the PC ---
    var pcBefore = orch.readPC();
    orch.step("into");
    var pcAfter = orch.readPC();
    if (pcBefore === pcAfter) throw new Error("step(into) did not move PC (stayed " + pcBefore + ")");
    ok("step", pcBefore + " -> " + pcAfter);

    // --- runForMs + isHalted ---
    var pcRun = orch.runForMs(runMs);
    if (!orch.isHalted()) throw new Error("isHalted() false after runForMs");
    ok("runTarget/runForMs/haltTarget/isHalted/waitUntilHalted", "pc=" + pcRun);

    // --- breakpoint add/remove (idle-RAM address; mechanism only, nothing runs there) ---
    var bpId = orch.addBreakpoint("0xD000");
    orch.removeBreakpoint(bpId);
    ok("addBreakpoint/removeBreakpoint", "id=" + bpId);

    // --- composite 2: watchWrite (hardware data watchpoint, TI-example flow on this stack).
    // The watchpoint must sit on the address the firmware writes constantly (watchAddr:
    // third argument, or ccs12_2_0.conf watch_addr when omitted) - an idle-RAM address would
    // never trigger and the step would time out. This is the board measurement of the
    // property names this driver sets (haltOnTrigger cannot be read back on this stack; the halt
    // itself is the evidence).
    var w = orch.watchWrite(watchAddr, "Write", 0);
    orch.printLog("watchWrite id=" + w.id + " haltOnTrigger=" + w.haltOnTrigger + "; running...");
    orch.runTarget();
    var triggerHalted = orch.waitUntilHalted(2000);
    if (!triggerHalted) {
        orch.removeAllBreakpoints();
        throw new Error("watchWrite(" + orch.hex(watchAddr) + ") did not halt within 2000 ms");
    }
    var observed = orch.readMem(watchAddr, 16, 1);
    orch.removeAllBreakpoints();
    ok("watchWrite/runTarget/waitUntilHalted/removeAllBreakpoints",
        "pc=" + orch.readPC() + " value=" + observed[0]);

    // --- memory read/write (idle RAM 0xD000, write then verify) ---
    orch.writeMem(addr, 0xBEEF, bitSize);
    var back = orch.readMem(addr, bitSize, 2);
    if (back[0] !== 0xBEEF) {
        throw new Error("writeMem/readMem mismatch: expected 48879, got " + back[0]);
    }
    ok("readMem/writeMem", "0xD000 = 0x" + orch.hex(back[0]).substring(2));

    orch.printLog("DRIVER SMOKE PASSED");
    orch.finishOk();
} catch (err) {
    orch.finishFail("driver smoke failed: " + err);
}
