// Measurement probe (board-queue 1e
// flash option properties. Same experiment as the other implementation's row 8: set FTPin in one
// session (read it back immediately), then read it in a FRESH session -- default GPIO0
// means session-scoped, GPIO51 means it persisted. Mode "list" dumps printOptions()
// first (the probe-before-hardcode practice, section 12.2; it also evidences queue 6
// item 2, session.options' counterpart on the shared Options class).
//
// Usage: dss.bat test/probe_flash_scope.js <ccxml_path> <mode = list | set | get>
//   run "list" first, then "set" (one invocation), then "get" (a second, fresh invocation).
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
var USAGE = "Usage: dss.bat test/probe_flash_scope.js <ccxml_path> <mode = list | set | get>";
var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 2 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var mode = requiredArg(args.positional, 1, "mode", USAGE);
if (mode !== "list" && mode !== "set" && mode !== "get") {
    finishFail("mode must be list | set | get, got: " + mode);
}

try {
    var session = openTarget(ccxmlPath);
    var opts = session.flash.options;
    if (mode === "list") {
        try { opts.printOptions(); printLog("printOptions() with no argument worked"); }
        catch (e1) {
            try { opts.printOptions(""); printLog("printOptions(\"\") worked"); }
            catch (e2) { finishFail("printOptions failed: " + e1 + " / " + e2); }
        }
    } else if (mode === "set") {
        opts.setString("FTPin", "GPIO51");
        printLog("same-session readback FTPin = " + opts.getString("FTPin"));
    } else {
        printLog("fresh-session readback FTPin = " + opts.getString("FTPin"));
        printLog("fresh-session FlashSectorH = " + opts.getBoolean("FlashSectorH"));
    }
} catch (err) {
    finishFail("flash scope probe failed: " + err);
}
finishOk();