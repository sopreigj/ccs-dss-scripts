// Entry point only: wiring for the shared orchestration main. Contract:
// the name table exported by session/orch_driver.js; behavior: orchestration/sample_exprs.js header
// - especially the measured-timestamp rule and sampling semantics).
// Usage: dss.bat workflows/ccs12_2_0_sample_exprs.js <ccxml_path> <out_file_path> <interval_ms>
//   <count> <csv_file> <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR)
// Note: on this stack the csv_file argument must contain neither a space nor an "="
// (measured dss.bat transport limit - the header explains it).
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

// --- shared main load ----------------------------------------------------
var __orchMain = new java.io.File(__lib.getParentFile().getParentFile(), "orchestration/sample_exprs.js");
load(__orchMain.getAbsolutePath());
if (typeof ORCH_MAIN !== "function") {
    java.lang.System.out.println("CCS12_2_0_RESULT=FAIL orchestration/sample_exprs.js did not load: " + __orchMain.getAbsolutePath());
    java.lang.System.exit(1);
}
// --------------------------------------------------------------------------

ORCH_MAIN(ORCH_DRIVER);
