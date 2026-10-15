// Measurement probe (board-queue 1e
// target.restart() behave differently from target.reset() on this F28335?
// Method: load the program (same .out the pipelines use), run 200 ms, halt -> PC;
// restart() -> PC + halted state; run 200 ms again -> PC; reset() -> PC + state.
// The user's guide defines Restart as re-positioning the PC to the entry point and Reset
// as a soft reset, but that is toolbar/GEL wording -- this probe reads the API's own
// behavior and prints raw numbers; interpretation belongs to dss-api.md section 11 row 2.
//
// Usage: dss.bat test/probe_restart_reset.js <ccxml_path> <out_file_path>
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
var USAGE = "Usage: dss.bat test/probe_restart_reset.js <ccxml_path> <out_file_path>";
var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML","OUT"], maxPositional: 2 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var outPath = requireAbsoluteFile(requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");

function pc(session) { return hex(session.expression.evaluate("PC")); }
function ensureHalted(session, label) {
    var wasHalted = session.target.isHalted();
    if (!wasHalted) { session.target.halt(); java.lang.Thread.sleep(50); }
    printLog(label + ": haltedBeforeRead=" + wasHalted + " PC=" + pc(session));
    return wasHalted;
}
try {
    var session = openTarget(ccxmlPath);
    session.memory.loadProgram(outPath);
    printLog("loaded: PC=" + pc(session));

    session.target.runAsynch();
    java.lang.Thread.sleep(200);
    var h1 = ensureHalted(session, "run 200ms");

    session.target.restart();
    java.lang.Thread.sleep(200);
    ensureHalted(session, "after restart()");

    session.target.runAsynch();
    java.lang.Thread.sleep(200);
    ensureHalted(session, "run 200ms again");

    session.target.reset();
    java.lang.Thread.sleep(200);
    ensureHalted(session, "after reset()");
} catch (err) {
    finishFail("restart/reset probe failed: " + err);
}
finishOk();