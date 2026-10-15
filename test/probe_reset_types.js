// Measurement probe (board-queue 1e
// ResetType the F28335 exposes through DSS, with isAllowed() so "listed but not usable
// right now" is distinguishable. The names are runtime data -- the official docs contain
// no ResetType constants (section 11 row 4), so this listing IS the evidence.
//
// Usage: dss.bat test/probe_reset_types.js <ccxml_path>
// Outcome: CCS12_2_0_RESULT=OK/FAIL marker (dss.bat exit code is always 0, section 12.3).
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
var USAGE = "Usage: dss.bat test/probe_reset_types.js <ccxml_path>";
var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 1 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");

try {
    var session = openTarget(ccxmlPath);
    var n = session.target.getNumResetTypes();
    printLog("getNumResetTypes = " + n);
    var i;
    for (i = 0; i < n; i++) {
        var rt = session.target.getResetType(i);
        var nm, al;
        try { nm = "" + rt.getName(); } catch (e1) { nm = "<getName failed: " + e1 + ">"; }
        try { al = "" + rt.isAllowed(); } catch (e2) { al = "<isAllowed failed: " + e2 + ">"; }
        printLog("[" + i + "] name=" + nm + " isAllowed=" + al);
    }
} catch (err) {
    finishFail("ResetType probe failed: " + err);
}
finishOk();