// CCS 12.2.0 automation script: verify the program in the target against a .out file.
//
// Usage: dss.bat atomic/program/ccs12_2_0_verify_program.js <ccxml_path> <out_file_path>
//
// What it answers: "did the flash actually take?". ccs12_2_0_load_program.js reports success as
// soon as the load call returns -- that is the intention, not the evidence. This script
// makes the debugger read the target back and compare it with the file, and reports that.
//
// PRECONDITION: the SAME .out must already be programmed into the target. Verifying against
// a file that is not in the target fails, and that failure is the correct answer rather than
// a broken script.
//
// Nothing is written: Memory.verifyProgram() only reads. The javadoc says it issues a
// Target.halt() before verifying; it does not restart afterwards.
//
// Measured elsewhere on the same chip (260 KB firmware), NOT re-measured on
// this stack -- treat these as expectations, not as this stack's numbers: the verifier prints
// "Program verification successful" itself, takes roughly 0.8 s, and throws when the
// contents differ (that throw is what becomes CCS12_2_0_RESULT=FAIL here).
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

var USAGE = "Usage: dss.bat atomic/program/ccs12_2_0_verify_program.js <ccxml_path> <out_file_path>";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML","OUT"], maxPositional: 2 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var outPath = requireAbsoluteFile(requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");

try {
    var session = openTarget(ccxmlPath);

    printLog("Verifying target contents against: " + outPath);
    session.memory.verifyProgram(outPath);
    printLog("Verify: OK. Target contents match the file.");
} catch (err) {
    finishFail("Verify FAILED: " + err);
}

finishOk();
