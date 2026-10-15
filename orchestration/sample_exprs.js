// Orchestration shared main: load a program, run it, sample a list of expressions N times
// at a fixed interval, and write one CSV row per sample with a MEASURED timestamp - one
// session, driven through the orchestration driver every implementation provides.
// The workflows/*_sample_exprs.js entry loads this file and calls
// ORCH_MAIN(ORCH_DRIVER); this file stays stack-blind.
//
// WHY THIS MUST BE ONE SESSION: the symbol table and the live values belong to the session
// (closing it disposes every child object and nothing can reattach), and a
// sampler that shelled out per row would lose the table between rows and sample a different
// run each time. The design does not depend on a session boundary also resetting the target.
//
// SAMPLING SEMANTICS: sampling does NOT stop the target; each value is one instantaneous
// read, so a multi-word variable can be caught half-updated (torn). Use these numbers to
// see trends; for a bit-exact assertion halt first and read (load_write_run_read).
//
// THE TIME COLUMN IS MEASURED, NOT NOMINAL: wall-clock ms from the start of sampling,
// taken AFTER the interval elapsed. Taking the timestamp before the wait shifts every row
// after the first one whole interval into the past - an earlier version of this workflow
// shipped exactly that bug and it was caught by measurement (0, 5, 207, 409 vs the real
// 0, 205, 407), so the order inside the loop below (wait, then timestamp, then read) is
// deliberate. The value column is evalRaw's raw cell format: CSV cells stay byte-compatible
// with what this workflow has always written.
//
// CSV/CLI conventions: the CSV path must be ABSOLUTE (a relative output path would be
// resolved against the debugger's install directory); expression tokens are a variadic
// tail; when no expression was given, fall back to env CCS_EVAL_EXPR (';' separated) -
// the escape hatch for expression tokens a launcher's command line cannot carry
// (spaces and '=').
//
// Verdict: any expression that fails to evaluate is written as "error:..." in its cell,
// counted, and reported as one final failure - never silently dropped.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: sample_exprs <ccxml_path> <out_file_path> <interval_ms> <count>"
        + " <csv_file> <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR)";

    // Variadic tail: the usage line cannot say how many expressions come after <csv_file>,
    // so maxPositional is unbounded and expr1 is required via the count check below.
    var args = orch.parseArgs({ usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: null });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var intervalMs = orch.parseInteger(orch.requiredArg(args.positional, 2, "interval_ms", USAGE), "interval_ms");
    var count = orch.parseInteger(orch.requiredArg(args.positional, 3, "count", USAGE), "count");
    // The CSV is created by this run, so it must not exist yet - only be absolute.
    var csvPath = orch.requireAbsolutePath(orch.requiredArg(args.positional, 4, "csv_file", USAGE), "csv_file");
    var exprs = args.positional.slice(5);
    if (exprs.length === 0) exprs = orch.envList("CCS_EVAL_EXPR");
    if (exprs.length === 0) orch.usageError("missing required argument: expr1", USAGE);
    if (count < 1) orch.usageError("count must be at least 1, got: " + count, USAGE);

    // A CSV field must be quoted when it holds a comma, a quote or a line break; inner
    // quotes are doubled. Expression text and error messages can contain all three.
    function csvField(value) {
        var text = "" + value;
        if (!/[",\r\n]/.test(text)) return text;
        return '"' + text.replace(/"/g, '""') + '"';
    }

    var failedSamples = 0;
    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);
        orch.printLog("Running. Sampling " + count + " x every " + intervalMs + " ms -> " + csvPath);
        orch.runTarget();

        var header = "elapsed_ms";
        var h;
        for (h = 0; h < exprs.length; h++) header += "," + csvField(exprs[h]);
        var lines = [header];

        var startedAt = new Date().getTime();
        var i;
        for (i = 0; i < count; i++) {
            // Order is the whole point: interval first, then the timestamp, then the read.
            if (i > 0) orch.sleepMs(intervalMs);
            var elapsed = new Date().getTime() - startedAt;

            var row = "" + elapsed;
            var k;
            for (k = 0; k < exprs.length; k++) {
                var cell;
                try { cell = orch.evalRaw(exprs[k]); }
                catch (evalErr) { cell = "error:" + evalErr; failedSamples++; }
                row += "," + csvField(cell);
            }
            lines.push(row);
            orch.printLog("  sample " + (i + 1) + "/" + count + " @ " + elapsed + " ms: " + row);
        }

        orch.haltTarget();
        orch.printLog("Target halted at PC " + orch.readPC() + ".");
        orch.writeTextFile(csvPath, lines.join("\r\n") + "\r\n");
        orch.printLog("Wrote " + count + " sample(s) to " + csvPath);
    } catch (err) {
        orch.finishFail("Sampling failed: " + err);
    }

    if (failedSamples > 0) {
        orch.finishFail(failedSamples + " sample(s) failed to evaluate (written as error:...)");
    }
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
