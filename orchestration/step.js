// Orchestration shared main: load a program, optionally run to a --from location, then
// single-step N times and print each PC -- one session, driven through the orchestration
// driver every implementation provides. The workflows/*_step.js
// entry loads this file and calls ORCH_MAIN(ORCH_DRIVER); this file stays stack-blind: no
// stack names, no launcher names, only the driver's common name table.
//
// WHY THIS MUST BE ONE SESSION: single-stepping and breakpoints are session state; there
// is no way to continue from where another script stopped - a new session resets the
// target and starts over. Every call here happens inside one session by construction.
//
// --from IS VERIFIED, NOT MERELY WAITED FOR: it goes through the driver's runToBreakpoint
// composite, so a breakpoint that is never
// hit, a halt that never comes, or a halt SOMEWHERE ELSE each fail with their own reason
// - stepping must start where --from says or not at all. The composite also carries the
// already-there rule: if loadProgram parked the PC exactly at --from (the usual case for
// "main"), nothing runs and that counts as reached. Without that rule a run could time out
// on --from main forever (a run never re-enters the instruction it is parked on).
//
// --from digit rule: a location starting with a digit must carry the 0x prefix (repo
// rule); the 0x form itself starts with a digit and is exempt.
//
// --kind: into (default) | over | out | asm. "asm" is assembly-level stepping; how the
// underlying library does it is per stack and that difference belongs to the driver. This
// shared code only relies on the contract: a driver that cannot offer a measured
// assembly-stepper entry REFUSES asm with a stated reason, rather than shipping a guessed
// call. (one implementation maps it to stepInto(true); the other implementation's assembly steppers live on
// a container whose method name was never measured there, so it refuses.)
//
// Stepping needs a stopped CPU: the target state is checked before the loop and a
// running target fails with a stated reason instead of being stepped anyway.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: step <ccxml_path> <out_file_path> <count>"
        + " [--from <location>] [--kind into|over|out|asm] [--timeout <ms>]";
    var DEFAULT_TIMEOUT_MS = 5000;
    var KINDS = ["into", "over", "out", "asm"];

    var args = orch.parseArgs({
        usage: USAGE,
        flags: {
            "--from": { takesValue: true },
            "--kind": { takesValue: true },
            "--timeout": { takesValue: true, parse: orch.parseInteger }
        },
        confFill: ["CCXML","OUT"], maxPositional: 3
    });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var count = orch.parseInteger(orch.requiredArg(args.positional, 2, "count", USAGE), "count");
    var kind = args.flags["--kind"] || "into";
    var fromLocation = args.flags["--from"] || null;
    var timeoutMs = args.flags["--timeout"] || DEFAULT_TIMEOUT_MS;
    if (KINDS.indexOf(kind) < 0) {
        orch.usageError("--kind must be one of " + KINDS.join("|") + ", got: " + kind, USAGE);
    }
    if (count < 1) orch.usageError("count must be at least 1", USAGE);
    if (fromLocation !== null && /^[0-9]/.test(fromLocation) && !/^0[xX]/.test(fromLocation)) {
        orch.usageError("--from starts with a digit, so it is an address and needs the 0x prefix"
            + " (e.g. 0x301C9C); use a symbol name for anything that is not an address."
            + " Got: " + fromLocation, USAGE);
    }

    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);

        if (fromLocation !== null) {
            orch.printLog("Running to " + fromLocation + " (up to " + timeoutMs + " ms)...");
            var r = orch.runToBreakpoint(fromLocation, timeoutMs);
            if (r.alreadyAt) {
                orch.printLog("Target is already at " + fromLocation + " (" + r.pc + "); nothing to run.");
            } else {
                orch.printLog("Halted = " + r.halted + ", PC = " + r.pc + ", within " + timeoutMs + " ms.");
            }
            if (!r.hit) {
                if (!r.halted) {
                    orch.finishFail("target did not halt within " + timeoutMs + " ms;"
                        + " the --from location was not reached");
                } else if (r.expected === null) {
                    orch.finishFail("symbol \"" + fromLocation + "\" did not evaluate to an address,"
                        + " so the halted PC at " + r.pc + " cannot be compared with --from; nothing was stepped");
                } else {
                    orch.finishFail("target halted at " + r.pc + ", not at --from " + fromLocation
                        + " (" + r.expected + "); stepping from there would not start where --from says"
                        + " (the halt had another cause: reset, manual halt, or a different breakpoint)");
                }
            }
            orch.printLog("Stopped at PC " + r.pc + ".");
        }

        if (!orch.isHalted()) {
            orch.finishFail("target is running; stepping needs a stopped CPU (halt it, or use --from)");
        }
        orch.printLog("Stepping " + count + " x " + kind + " from PC " + orch.readPC() + ":");
        for (var i = 1; i <= count; i++) {
            orch.step(kind);
            orch.printLog("  step " + i + ": PC = " + orch.readPC());
        }
    } catch (err) {
        orch.finishFail("Stepping failed: " + err);
    }
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
