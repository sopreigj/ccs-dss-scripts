// Orchestration shared main: load a program (or only its symbols), set a breakpoint, run
// until it is reached, report where the target stopped -- all inside ONE session, driven
// through the orchestration driver every implementation provides. The
// workflows/*_run_to_bp.js entry loads this file and calls ORCH_MAIN(ORCH_DRIVER); this
// file stays stack-blind: no stack names, no launcher names, only the common name table.
//
// WHY THIS MUST BE ONE SESSION: a breakpoint is a child object of the session -- closing
// the session disposes it and nothing can reattach it. "Set a breakpoint" and "run to it"
// therefore cannot be split across two scripts: the second script would open a new
// session, which has no breakpoint left. Whether connect also resets the target is measured
// on one implementation; treat the other as unverified.
//
// "Was it the breakpoint that stopped the target?" has no direct API: there is no
// halt-reason call. This main compares the halted PC with the breakpoint address (what
// the TI examples do); a halt from another cause (reset, manual halt, a different
// breakpoint) is reported as "halted, but not at the breakpoint" instead of counted as a
// hit. A location whose address is known counts as a hit when the CPU is ALREADY there --
// loadProgram parks the PC at main, so a breakpoint on main would never be re-entered by
// a run; that makes "already there" the main path, not an edge case.
//
// An address must carry an explicit 0x prefix (repository rule): a location that starts
// with a digit but not 0x is refused as a usage error rather than guessed at.
//
// --symbols-only loads only the symbol table (no program load, flash image untouched).
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: run_to_bp <ccxml_path> <out_file_path> <location>"
        + " [--symbols-only] [--timeout <ms>]";
    var DEFAULT_TIMEOUT_MS = 5000;

    var args = orch.parseArgs({
        usage: USAGE,
        flags: {
            "--symbols-only": { takesValue: false },
            "--timeout": { takesValue: true, parse: orch.parseInteger }
        },
        confFill: ["CCXML","OUT"], maxPositional: 3
    });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var location = orch.requiredArg(args.positional, 2, "location", USAGE);
    var timeoutMs = args.flags["--timeout"] || DEFAULT_TIMEOUT_MS;

    // The 0x form itself starts with a digit, so it is exempted rather than refused.
    if (/^[0-9]/.test(location) && !/^0[xX]/.test(location)) {
        orch.usageError("location starts with a digit, so it is an address and needs the 0x prefix"
            + " (e.g. 0x301C9C); use a symbol name for anything that is not an address."
            + " Got: " + location, USAGE);
    }

    try {
        orch.openTarget(ccxmlPath);
        if (args.flags["--symbols-only"]) {
            orch.printLog("Loading symbols only (no program load): " + outPath);
            orch.loadSymbols(outPath);
        } else {
            orch.printLog("Loading program: " + outPath);
            orch.loadProgram(outPath);
        }

        orch.printLog("Running to " + location + " (up to " + timeoutMs + " ms)...");
        var r = orch.runToBreakpoint(location, timeoutMs);
        if (r.alreadyAt) {
            orch.printLog("Target is already at " + location + " (" + r.pc + "); nothing to run.");
        } else {
            orch.printLog("Halted = " + r.halted + ", PC = " + r.pc + ", within " + timeoutMs + " ms.");
        }

        if (r.hit) {
            orch.printLog("Breakpoint HIT at " + location + ".");
        } else if (!r.halted) {
            orch.finishFail("target did not halt within " + timeoutMs + " ms; the breakpoint was not reached");
        } else if (r.expected === null) {
            orch.finishFail("target halted at " + r.pc + " but the location's address is unknown"
                + " (symbol did not evaluate), so the halt cannot be attributed to the breakpoint");
        } else {
            orch.finishFail("target halted at " + r.pc + ", not at the breakpoint " + r.expected
                + "; the halt had another cause (reset, manual halt, or a different breakpoint)");
        }
    } catch (err) {
        orch.finishFail("Run-to-breakpoint failed: " + err);
    }
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
