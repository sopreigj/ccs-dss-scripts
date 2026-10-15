// Measurement probe (board-queue 1e
//   control -> baseline: run 600 ms with no breakpoint, show where the CPU naturally sits.
//   add     -> session A: load symbols, breakpoint.add("main"), print the id and the
//              getTypes() description array (evidence for queue 6 item 3), then end.
//   check   -> session B (fresh): does the breakpoint from "add" still fire? Early halt at
//              main = it survived terminate(); the full 600 ms window = it did not.
//   gel     -> session A variant: add the DSS breakpoint, then evaluate
//              GEL_BreakPtDel(<main>) and see whether the DSS breakpoint is still there.
//              Still firing = the two mechanisms are NOT interchangeable (row 6);
//              gone = GEL_BreakPtDel reaches DSS breakpoints.
// connect() resets the target, so in every session the boot passes main ~early in the
// window: a hit shows up as an early halt with PC at main, never by chance later on.
//
// Usage: dss.bat test/probe_breakpoint_session.js <ccxml_path> <mode = control | add | check | gel | save | restore> [out_file_path]
//   out_file_path is required for every mode except control (symbol table for "main").
//   save/restore exercise the queue 6 item 4 transport (saveConfig -> loadConfig) through
//   the temp file %TEMP%\ccs12_2_0_probe_bp_config.xml.
// Outcome: CCS12_2_0_RESULT=OK/FAIL marker.
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
var USAGE = "Usage: dss.bat test/probe_breakpoint_session.js <ccxml_path> <mode = control | add | check | gel | save | restore> [out_file_path] (out required except control)";
var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 3 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var mode = requiredArg(args.positional, 1, "mode", USAGE);
var outPath = null;
if (args.positional.length > 2) {
    outPath = requireAbsoluteFile(args.positional[2], "out_file_path");
}
// ES3: Rhino 1.6R5 has no Array.prototype.indexOf -- a lookup object, not a search.
var MODES = { control: true, add: true, check: true, gel: true, save: true, restore: true };
if (!MODES[mode]) {
    finishFail("mode must be one of control | add | check | gel | save | restore, got: " + mode);
}
if (mode !== "control" && outPath === null) {
    finishFail("mode " + mode + " needs <out_file_path> for the symbol table");
}
var CFG_FILE = java.lang.System.getProperty("java.io.tmpdir") + "ccs12_2_0_probe_bp_config.xml";

// Run the target and watch for an early halt (that is what a firing breakpoint looks
// like); if none arrives inside the window, halt manually and report the natural PC.
function runAndObserve(session, windowMs) {
    var t0 = new Date().getTime();
    session.target.runAsynch();
    var waited = 0;
    while (session.target.isHalted() && waited < 500) {
        java.lang.Thread.sleep(20);
        waited += 20;
    }
    while (new Date().getTime() - t0 < windowMs) {
        java.lang.Thread.sleep(20);
        if (session.target.isHalted()) {
            return { early: true, elapsed: new Date().getTime() - t0,
                     pc: hex(session.expression.evaluate("PC")) };
        }
    }
    session.target.halt();
    java.lang.Thread.sleep(50);
    return { early: false, elapsed: new Date().getTime() - t0,
             pc: hex(session.expression.evaluate("PC")) };
}

try {
    var session = openTarget(ccxmlPath);
    if (mode === "control" || mode === "check" || mode === "restore") {
        if (mode !== "control") { loadSymbols(session, outPath); }
        if (mode === "restore") {
            session.breakpoint.loadConfig(CFG_FILE);
            printLog("loadConfig <- " + CFG_FILE);
        }
        var obs = runAndObserve(session, 600);
        printLog("observe: earlyHalt=" + obs.early + " elapsed=" + obs.elapsed + "ms PC=" + obs.pc);
        if (mode === "control") {
            printLog("baseline: earlyHalt should be false here (no breakpoint anywhere)");
        } else {
            var mainV = hex(session.expression.evaluate("main"));
            printLog("main = " + mainV);
            if (obs.early && obs.pc === mainV) {
                if (mode === "restore") {
                    printLog("VERDICT: TRANSPORTED -- the breakpoint loaded from XML fired in this fresh session");
                } else {
                    printLog("VERDICT: SURVIVED -- the breakpoint from session A fired in this fresh session");
                }
            } else {
                printLog("VERDICT: DID NOT FIRE -- full window elapsed, final PC=" + obs.pc);
            }
        }
    } else {
        loadSymbols(session, outPath);
        var id = session.breakpoint.add("main");
        printLog("breakpoint.add(main) -> id=" + id);
        if (id < 0) { finishFail("breakpoint.add returned " + id); }
        if (mode === "gel") {
            var mainAddr = session.expression.evaluate("main");
            var gelResult = session.expression.evaluate("GEL_BreakPtDel(" + hex(mainAddr) + ")");
            printLog("GEL_BreakPtDel(" + hex(mainAddr) + ") returned: " + gelResult);
        }
        if (mode === "add") {
            var tt = session.breakpoint.getTypes();
            printLog("getTypes: length=" + tt.length);
            var j;
            for (j = 0; j < tt.length; j++) {
                var desc = "";
                try { desc = "" + tt[j]; } catch (e1) { desc = "<toString failed: " + e1 + ">"; }
                printLog("  type[" + j + "]=" + desc);
            }
        }
        if (mode === "save") {
            session.breakpoint.saveConfig(CFG_FILE);
            printLog("saveConfig -> " + CFG_FILE);
        }
        var obs2 = runAndObserve(session, 600);
        printLog("observe: earlyHalt=" + obs2.early + " elapsed=" + obs2.elapsed + "ms PC=" + obs2.pc);
    }
} catch (err) {
    finishFail("breakpoint session probe failed: " + err);
}
finishOk();