// Orchestration shared main: load a program, write expressions into it, then RUN it on the
// new values, then READ the values back - one session, driven through the orchestration
// driver every implementation provides. The workflows/*_load_write_run_read.js
// entry loads this file and calls ORCH_MAIN(ORCH_DRIVER); stack-blind.
//
// WHY THIS MUST BE ONE SESSION: the write, the run that consumes it, and the read-back are
// three views of ONE target state. A session boundary must be treated as losing the target
// state (measured on one implementation; treat the other as unverified), so a value
// written in one script is gone before another script could observe what the program did
// with it.
//
// --settle IS THE REASON THIS WORKFLOW EXISTS. Measured on an F28335 (verify on your own
// stack before trusting it there): writing right after loadProgram and running
// 2000 ms reads back 0 (the program's startup initialization overwrites the variable);
// letting the program run 500 ms FIRST (--settle 500) and then writing the same value
// keeps it (reads back 1). "The assignment reported no error" says nothing about whether
// the value survived - only --settle plus a run afterwards does. With run_ms = 0 a write
// reads back, but that only proves writability, not durability.
//
// EXPRESSION CHANNEL: assignments contain spaces and '=', which a launcher's command line
// cannot always
// carry - when the option is absent or empty, --set falls back to env CCS_WRITE_EXPR and
// --read to env CCS_EVAL_EXPR (';' separated), the names the atomic write_expr/eval_expr
// tools already use. A driver may additionally rejoin "--set id value" tokens split at
// '=' by its launcher (transport absorbed by the driver). With neither set nor read given
// the run still loads and runs - but it SAYS so, so it cannot masquerade as the check its
// name promises.
//
// Verdict: any failed assignment or read-back is counted and reported as one final failure
// (exit 1), never silently dropped.
var ORCH_MAIN = function (orch) {
    var USAGE = 'Usage: load_write_run_read <ccxml_path> <out_file_path> <run_ms>'
        + ' [--settle <ms>] [--set "<assignment>"]... [--read "<expr>"]...  (or set env'
        + ' CCS_WRITE_EXPR / CCS_EVAL_EXPR)';

    var args = orch.parseArgs({
        usage: USAGE,
        flags: {
            "--settle": { takesValue: true, parse: orch.parseInteger },
            "--set": { takesValue: true, repeat: true },
            "--read": { takesValue: true, repeat: true }
        },
        confFill: ["CCXML","OUT"], maxPositional: 3
    });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var runMs = orch.parseInteger(orch.requiredArg(args.positional, 2, "run_ms", USAGE), "run_ms");

    var settleMs = args.flags["--settle"] || 0;
    var assignments = args.flags["--set"] || [];
    var reads = args.flags["--read"] || [];
    if (assignments.length === 0) assignments = orch.envList("CCS_WRITE_EXPR");
    if (reads.length === 0) reads = orch.envList("CCS_EVAL_EXPR");
    if (assignments.length === 0 && reads.length === 0) {
        orch.printLog("Note: no --set and no --read given, so this run only loads and runs the program.");
    }

    var failures = 0;
    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);

        if (settleMs > 0) {
            orch.printLog("Settling: running " + settleMs
                + " ms so the program's startup initialization finishes...");
            orch.runTarget();
            orch.sleepMs(settleMs);
            orch.haltTarget();
            orch.printLog("Settled at PC " + orch.readPC() + ".");
        }

        var i;
        for (i = 0; i < assignments.length; i++) {
            try {
                // evaluate("x = v") is the write form of this API - there is no assign().
                orch.printLog("Setting: " + assignments[i]);
                orch.evalExpr(assignments[i]);
            } catch (setErr) {
                orch.printLog("Assignment failed (" + assignments[i] + "): " + setErr);
                failures++;
            }
        }

        if (runMs > 0) {
            orch.printLog("Running " + runMs + " ms so the program can act on the new values...");
            orch.runTarget();
            orch.sleepMs(runMs);
            orch.haltTarget();
        }

        if (reads.length > 0) {
            orch.printLog("");
            orch.printLog("==== Read back ====");
            for (i = 0; i < reads.length; i++) {
                try {
                    // evalExpr prints the driver's own form (one implementation: hex with decimal in
                    // parentheses; the other: the raw value). Print whatever it returns.
                    orch.printLog(reads[i] + " = " + orch.evalExpr(reads[i]));
                } catch (readErr) {
                    orch.printLog(reads[i] + " = [evaluation failed: " + readErr + "]");
                    failures++;
                }
            }
            orch.printLog("===================");
        }
        orch.printLog("Final PC: " + orch.readPC());
    } catch (err) {
        orch.finishFail("Load+write+run+read failed: " + err);
    }

    if (failures > 0) orch.finishFail(failures + " operation(s) failed");
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
