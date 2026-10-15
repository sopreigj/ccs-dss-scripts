// CCS 12.2.0 automation script: report the state and identity of the debug target.
//
// Usage: dss.bat atomic/target/ccs12_2_0_target_state.js <ccxml_path>
//
// There is no "get target state" call in this API: the report is assembled from
// Target.isConnected() / Target.isHalted(), the program counter read as the expression "PC"
// (there is no getPC(); reading the PC as an expression is what TI's own example scripts
// do), and the identity strings the session itself carries.
//
// WHAT THESE VALUES MEAN: openTarget() halts the CPU immediately after connecting, so every
// line describes the state AFTER the connection, not the state a moment earlier. Whatever
// the target was doing before is not what you are reading.
//
// VERIFIED / NOT VERIFIED on this stack:
//   * the calls below are the ones documented in this installation's DSS javadoc
//     (ccs_base/scripting/docs/DS_API/com/ti/debug/engine/scripting/{DebugSession,Target,Expression}.html);
//   * the LITERAL VALUE getBoardName() returns WAS verified on hardware:
//     it echoes the ccxml connection identity -- the v1 config prints
//     "Texas Instruments XDS100v1 USB Debug Probe", the v2 config prints the v2 name.
//     It is the configuration identity, not a silicon self-report (the same FTDI probe
//     accepts both configs). See.md.
//   * that connecting RESETS the target is NOT verified on this stack. That was measured on the
//     other stack; here the javadoc says nothing about connect() resetting anything,
//     and the User's Guide lists "reset the target on a connect" as an option (with "halt the
//     target on a connect" as the default). Read the report as "state after the connection",
//     and do NOT read it as "the target was reset" --.1.
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

var USAGE = "Usage: dss.bat atomic/target/ccs12_2_0_target_state.js <ccxml_path>";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 1 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");

function padRight(text, width) {
    var padded = "" + text;
    while (padded.length < width) padded = padded + " ";
    return padded;
}

// A getter that fails is not a report failure: a target that does not expose one of these
// strings should still produce the rest of the report. The line then says that the value
// could not be read, instead of showing an empty string as if it were the answer.
function report(label, readFn) {
    var text;
    try {
        var value = readFn();
        text = (value === null || value === undefined) ? "<null>" : ("" + value);
    } catch (err) {
        text = "<not available: " + err + ">";
    }
    printLog(padRight(label, 9) + ": " + text);
}

try {
    var session = openTarget(ccxmlPath);

    report("connected", function () { return session.target.isConnected(); });
    report("halted", function () { return session.target.isHalted(); });

    // PC is an expression, not a register accessor: Expression has only evaluate() and
    // evaluateToString(), and TI's example scripts read the PC this way.
    var pc = session.expression.evaluate("PC");
    printLog(padRight("PC", 9) + ": " + hex(pc) + " (" + pc + ")");

    report("board", function () { return session.getBoardName(); });
    report("cpu", function () { return session.getCPUName(); });
    report("partnum", function () { return session.getPartnum(); });
    report("config", function () { return session.getConfig(); });
} catch (err) {
    finishFail("Target state query failed: " + err);
}

finishOk();
