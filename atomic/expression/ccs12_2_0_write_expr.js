// CCS 12.2.0 automation script: assign C expression
// Usage: dss.bat atomic/expression/ccs12_2_0_write_expr.js <ccxml_path> [--symbols <out_file>] <assignment_expr>  (or set env CCS_WRITE_EXPR)
//
// Examples:
//   dss.bat atomic/expression/ccs12_2_0_write_expr.js xxx.ccxml --symbols app.out "<symbol_name> = 1"
//   dss.bat atomic/expression/ccs12_2_0_write_expr.js xxx.ccxml "*(unsigned short*)0x8000 = 0x1234"
//
// Note: symbol names need the symbol table: pass --symbols <out> or set env CCS_SYMBOLS.
// Note: an assignment contains '=', which the CCS launcher does not deliver intact (see the
//       comment on the CCS_WRITE_EXPR fallback below), so CCS_WRITE_EXPR is the channel that
//       actually works through dss.bat for a real assignment.
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

var USAGE = "Usage: dss.bat atomic/expression/ccs12_2_0_write_expr.js <ccxml_path> [--symbols <out_file>] <assignment_expr>  (or set env CCS_WRITE_EXPR)";

var args = parseArgs(arguments, {
    usage: USAGE,
    flags: { "--symbols": { takesValue: true } },
    // Two positionals, and only two are read below (ccxml_path and assignment_expr). Declaring
    // three silently dropped a third argument, which the library's own contract classes as the
    // same defect as "fails but reports success".
    confFill: ["CCXML"], maxPositional: 2
});

var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var assignmentExpr = args.positional[1];

var symbolFile = java.lang.System.getenv("CCS_SYMBOLS");
symbolFile = symbolFile ? ("" + symbolFile) : "";
var symbolArg = args.flags["--symbols"];
if (symbolArg !== undefined) {
    // An empty value would otherwise mean "no symbol table" while looking like a request
    // for one -- e.g. --symbols "%SYM%" with %SYM% unset. Refuse the ambiguous input.
    if (symbolArg === "") usageError("--symbols needs a non-empty path", USAGE);
    symbolFile = requireAbsolutePath(symbolArg, "--symbols");
}

// Fallback: the CCS launcher does not deliver an argument containing '=' intact -- measured
// through the real dss.bat with a probe that prints its own argv, "--set FTPin=GPIO51" arrives
// as the two arguments "--set" "FTPin" "GPIO51". Every C assignment contains '=', so the
// reliable channel for one is the CCS_WRITE_EXPR environment variable.
if (!assignmentExpr) {
    var envExpr = java.lang.System.getenv("CCS_WRITE_EXPR");
    if (envExpr) assignmentExpr = "" + envExpr;
}

if (!assignmentExpr) usageError("missing required argument: assignment_expr", USAGE);

try {
    var session = openTarget(ccxmlPath);

    if (symbolFile) {
        printLog("Loading symbols: " + symbolFile);
        loadSymbols(session, symbolFile);
    }

    printLog("Executing assignment: " + assignmentExpr);
    var val = session.expression.evaluate(assignmentExpr);
    printLog("Assignment result: " + val);
} catch (err) {
    finishFail("Assignment failed: " + err);
}

finishOk();
