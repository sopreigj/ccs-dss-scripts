// Entry point only: wiring for the shared orchestration main. Contract:
// the name table exported by session/orch_driver.js; behavior: orchestration/load_run_read.js header).
// Usage: dss.bat workflows/ccs12_2_0_load_run_read.js <ccxml_path> <out_file_path> <run_ms>
//   <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR -- dss.bat cannot deliver arguments
//   containing spaces or '='; the escape hatch is documented in atomic/expression/ccs12_2_0_eval_expr.js).
// Launcher verdicts (stdout marker; dss.bat's own exit code is always 0):
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
// Same load()+assert shape as above, but one level higher: orchestration/ sits at the
// repo root, while __lib lives in <root>/lib. load() prints one line and returns on a
// missing file, so the typeof check is the real gate (measured: the wrong level here
// produced "Couldn't open file ... session\orchestration\..." plus this very FAIL line).
var __orchMain = new java.io.File(__lib.getParentFile().getParentFile(), "orchestration/load_run_read.js");
load(__orchMain.getAbsolutePath());
if (typeof ORCH_MAIN !== "function") {
    java.lang.System.out.println("CCS12_2_0_RESULT=FAIL orchestration/load_run_read.js did not load: " + __orchMain.getAbsolutePath());
    java.lang.System.exit(1);
}
// --------------------------------------------------------------------------

ORCH_MAIN(ORCH_DRIVER);
