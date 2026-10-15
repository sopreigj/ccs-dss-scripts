// CCS 12.2.0 automation script: reset target
// Reference: CCS 12 User's Guide 7.6 Scripting
//
// Usage:
//   dss.bat atomic/target/ccs12_2_0_target_reset.js <ccxml_path> [--list]
//   --list  print the ResetType table (name + isAllowed) and exit WITHOUT resetting.
//           The names are runtime data no official doc
//           contains, and isAllowed() separates
//           "listed but not possible right now" (measured: Reset Emulator = false).
//
// Outcome: dss.bat's own process exit code is 0 whatever the script does (measured:
// System.exit(1), System.exit(7), a natural end, and a nonexistent script path). The cmd
// %errorlevel% does carry the JVM's code when it is read after the call -- on a following
// line, or with delayed expansion (cmd /v:on !errorlevel!) -- but read without delayed
// expansion inside the same `&`-compound line it is expanded before the call runs and is
// always 0 (a measurement artifact, measured for System.exit(7) as well). A natural end and a
// nonexistent script path both read 0 too, so a 0 proves neither that the script ran nor that
// it succeeded -- which is why success/failure is reported as the stdout marker
//   CCS12_2_0_RESULT=OK  /  CCS12_2_0_RESULT=FAIL <reason>  (see session/session.js).
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

var USAGE = "Usage: dss.bat atomic/target/ccs12_2_0_target_reset.js <ccxml_path> [--list]";

var args = parseArgs(arguments, { usage: USAGE, flags: { "--list": { takesValue: false } }, confFill: ["CCXML"], maxPositional: 1 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");

try {
    var session = openTarget(ccxmlPath);

    // One finishOk() at the very end: finishOk() only PRINTS the marker, it does not exit,
    // so calling it inside this branch would let control fall through into the reset path
    // (measured while adding --list: the fall-through actually ran reset() and
    // emitted a second marker). finishFail() is different -- it does stop the script.
    if (args.flags["--list"] === true) {
        var n = session.target.getNumResetTypes();
        printLog("Reset types (getNumResetTypes = " + n + "):");
        var i;
        for (i = 0; i < n; i++) {
            var rt = session.target.getResetType(i);
            printLog("  [" + i + "] " + rt.getName() + "  isAllowed=" + rt.isAllowed());
        }
    } else {
        // MEASURED (probe
        // test/probe_restart_reset.js): on this F28335 the two methods DIVERGE --
        //   restart() -> PC repositioned to the program entry (0x301bfc), target stays halted;
        //   reset()   -> soft reset, PC at the boot ROM (0x3ff9ce), the same landing a connect
        //                leaves behind.
        // the other implementation measured both landing in the same place, but that implementation has no
        // restart() at all -- the divergence is a fact of this stack and the other result does not carry over.
        // This script calls reset(), which is exactly what its name says since board item 1d
        // retired the old "restart" name; the header no longer has to warn readers off it.
        printLog("Resetting target...");
        session.target.reset();
        printLog("Target reset.");
    }
} catch (err) {
    finishFail("Reset target failed: " + err);
}

finishOk();
