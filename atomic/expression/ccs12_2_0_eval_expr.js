// CCS 12.2.0 automation script: evaluate and print one or more C expressions
// Usage: dss.bat atomic/expression/ccs12_2_0_eval_expr.js <ccxml_path> [--symbols <out_file>] <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR)
//
// Examples:
//   dss.bat atomic/expression/ccs12_2_0_eval_expr.js xxx.ccxml PC
//   dss.bat atomic/expression/ccs12_2_0_eval_expr.js xxx.ccxml --symbols app.out "<symbol_name>"
//
// Note: symbol names need the symbol table: pass --symbols <out> or set env CCS_SYMBOLS.
// Note: an expression the command line cannot carry (spaces, parens, '*', '=') goes in
//       CCS_EVAL_EXPR, one expression per ';' -- the CCS launcher does not deliver such an
//       argument intact (see the comment on the fallback below).
// Verdict: any expression that fails to evaluate makes the whole run CCS12_2_0_RESULT=FAIL.
//       Same rule as the other interface's script (exit 1) and as load_run_read's failure count
//       (fresh-context drill R2: a marker-only judge cannot see "OK with no
//       value", so silent OK was the worst failure shape this stack could produce).
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

var USAGE = "Usage: dss.bat atomic/expression/ccs12_2_0_eval_expr.js <ccxml_path> [--symbols <out_file>] <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR)";

// The expression list is variadic, so maxPositional must be null here: the count is not
// known from the usage line. Everything after the ccxml path is an expression.
var args = parseArgs(arguments, {
    usage: USAGE,
    flags: { "--symbols": { takesValue: true } },
    confFill: ["CCXML"], maxPositional: null
});

var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");

var symbolFile = java.lang.System.getenv("CCS_SYMBOLS");
symbolFile = symbolFile ? ("" + symbolFile) : "";
var symbolArg = args.flags["--symbols"];
if (symbolArg !== undefined) {
    // An empty value would otherwise mean "no symbol table" while looking like a request
    // for one -- e.g. --symbols "%SYM%" with %SYM% unset. Refuse the ambiguous input.
    if (symbolArg === "") usageError("--symbols needs a non-empty path", USAGE);
    symbolFile = requireAbsolutePath(symbolArg, "--symbols");
}

var exprs = args.positional.slice(1);

// Fallback: dss.bat mangles arguments containing spaces/parens/'*', so a
// complex expression can also be passed via the CCS_EVAL_EXPR environment
// variable (use ';' to separate multiple expressions).
if (exprs.length === 0) {
    var envExpr = java.lang.System.getenv("CCS_EVAL_EXPR");
    if (envExpr) {
        var parts = ("" + envExpr).split(";");
        for (var j = 0; j < parts.length; j++) {
            var trimmed = parts[j].replace(/^\s+|\s+$/g, "");
            if (trimmed) exprs.push(trimmed);
        }
    }
}

if (exprs.length === 0) usageError("missing required argument: expr1", USAGE);

var failures = 0;
try {
    var session = openTarget(ccxmlPath);

    if (symbolFile) {
        printLog("Loading symbols: " + symbolFile);
        loadSymbols(session, symbolFile);
    }

    printLog("\n==== Expression Evaluation ====");
    for (var i = 0; i < exprs.length; i++) {
        try {
            var val = session.expression.evaluate(exprs[i]);
            printLog(exprs[i] + " = " + val);
        } catch (e) {
            // One unreadable expression must not abort the rest of the list.
            printLog(exprs[i] + " = [evaluation failed: " + e.message + "]");
            failures++;
        }
    }
    printLog("====================\n");
} catch (err) {
    finishFail("Evaluation failed: " + err);
}

if (failures > 0) {
    var reason = failures + " of " + exprs.length + " expression(s) failed to evaluate";
    // A marker-only judge reads this reason and nothing else, so the most likely cause gets
    // named here: without a symbol table every symbol-name expression fails. Pure address
    // expressions (PC, *(unsigned long*)0xC000) still work with no symbol table -- do not
    // blame its absence when one was loaded.
    if (!symbolFile) {
        reason += " (no symbol table loaded -- symbol names need one: pass --symbols <out_file> "
            + "or set env CCS_SYMBOLS; address-only expressions do not need it)";
    }
    finishFail(reason);
}

finishOk();
