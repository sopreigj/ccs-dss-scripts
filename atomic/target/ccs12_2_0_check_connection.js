// CCS 12.2.0 automation script: check target connection
// Reference: CCS 12 User's Guide 7.6 Scripting
//
// Usage:
//   dss.bat atomic/target/ccs12_2_0_check_connection.js <ccxml_path>
//
// Outcome: dss.bat returns 0 whatever happens, so success/failure is reported as the
// stdout marker  CCS12_2_0_RESULT=OK  /  CCS12_2_0_RESULT=FAIL <reason>  (see session/session.js).
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

var USAGE = "Usage: dss.bat atomic/target/ccs12_2_0_check_connection.js <ccxml_path>";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 1 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");

try {
    var session = openTarget(ccxmlPath);
    // connect() succeeded, so this re-reads the state rather than assuming it: a probe that
    // is present but unreachable can leave the session up with no target attached.
    if (session.target.isConnected()) {
        printLog("Connection: OK. Target connected.");
    } else {
        printLog("Connection: FAILED. Target not connected.");
        finishFail("Connection failed: target not connected");
    }
} catch (err) {
    finishFail("Connection failed: " + err);
}

finishOk();
