// CCS 12.2.0 automation script: read register
// Reference: CCS 12 User's Guide 7.6 Scripting
//
// Usage:
//   dss.bat atomic/register/ccs12_2_0_read_reg.js <ccxml_path> <register_name>
//
// Examples:
//   dss.bat atomic/register/ccs12_2_0_read_reg.js xxx.ccxml PC
//   dss.bat atomic/register/ccs12_2_0_read_reg.js xxx.ccxml ST0
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

var USAGE = "Usage: dss.bat atomic/register/ccs12_2_0_read_reg.js <ccxml_path> <register_name>";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 2 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var regName = requiredArg(args.positional, 1, "register_name", USAGE);

try {
    var session = openTarget(ccxmlPath);

    printLog("Reading register: " + regName);
    var value = session.memory.readRegister(regName);
    printLog(regName + " = " + hex(value) + " (" + value + ")");
} catch (err) {
    finishFail("Read register failed: " + err);
}

finishOk();
