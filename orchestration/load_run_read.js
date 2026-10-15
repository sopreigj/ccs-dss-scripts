// Orchestration shared main: load the program, run it for N ms, halt, then evaluate a list
// of expressions -- everything inside ONE session, driven through the orchestration driver
// every implementation provides. The workflows/*_load_run_read.js entry
// loads this file and calls ORCH_MAIN(ORCH_DRIVER); this file itself must stay stack-blind:
// no stack names, no launcher names, only the common name table.
//
// WHY THIS MUST BE ONE SESSION: the symbol table and the values it makes readable are
// children of the session -- closing the session disposes both and nothing can reattach.
// A separate "load" script followed by a separate "eval" script would open a second
// session - state across the boundary is not assumed to survive (a connect reset is
// measured on one implementation; treat the other as unverified), so the expressions would be read
// from a target that no
// longer runs the program that was loaded.
//
// There is deliberately no --symbols option: loadProgram() loads the program together with
// its symbols, and this script never wants only symbols.
//
// How long the target runs is a fixed wait (run_ms) and nothing else -- there is no
// condition to stop on here. To stop on a condition use run_to_breakpoint.
//
// An expression list that cannot survive the launcher's command line goes in the
// environment variable CCS_EVAL_EXPR (';' separated). One unreadable expression is
// reported and counted; it never hides the rest of the list.
//
// The expression list may be EMPTY (no positionals and no CCS_EVAL_EXPR): the act is
// then a plain load -> run -> halt that reports the halt PC. WHY it became optional:
// users hit the "load, run N ms, halt, read nothing" shape and had to invent a throwaway
// expression -- while load_write_run_read already accepted empty --set/--read lists, so
// requiring expressions here was an asymmetry, not a design.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: load_run_read <ccxml_path> <out_file_path> <run_ms> [expr1] [expr2 ...]"
        + "  (or set env CCS_EVAL_EXPR)";

    var args = orch.parseArgs({ usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: null });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var runMs = orch.parseInteger(orch.requiredArg(args.positional, 2, "run_ms", USAGE), "run_ms");
    var exprs = args.positional.slice(3);
    if (exprs.length === 0) exprs = orch.envList("CCS_EVAL_EXPR");

    var failures = 0;
    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);

        orch.printLog("Running " + runMs + " ms from PC " + orch.readPC() + "...");
        orch.runTarget();
        orch.sleepMs(runMs);

        orch.printLog("Halting target...");
        orch.haltTarget();
        orch.printLog("Target halted. PC after: " + orch.readPC());

        if (exprs.length === 0) {
            orch.printLog("No expressions to evaluate; the halt PC above is the result.");
        } else {
            orch.printLog("");
            orch.printLog("==== Expression Evaluation ====");
            for (var i = 0; i < exprs.length; i++) {
                try {
                    orch.printLog(exprs[i] + " = " + orch.evalExpr(exprs[i]));
                } catch (err) {
                    orch.printLog(exprs[i] + " = [evaluation failed: " + err + "]");
                    failures++;
                }
            }
            orch.printLog("====================");
        }
    } catch (err) {
        orch.finishFail("Load+run+read failed: " + err);
    }

    if (failures > 0) orch.finishFail(failures + " expression(s) failed to evaluate");
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
