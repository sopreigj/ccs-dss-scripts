// Orchestration shared main: load a program, plant a HARDWARE DATA WATCHPOINT on an
// address, run, and report the instruction that performed the access -- all inside ONE
// session, driven through the orchestration driver every implementation provides.
// The workflows/*_watch_write.js entry loads this file and calls
// ORCH_MAIN(ORCH_DRIVER); this file stays stack-blind.
//
// It answers: "who is writing this variable?" -- a data watchpoint stops the CPU on the
// instruction that performed the access, so the halted PC IS the writer. Measured on
// F28335: watching the WATCH_ADDR address for writes halted in ~60 ms (two runs: 62 / 64 ms) at
// PC = 0x300a81; trigger latency depends on target and watchpoint, it is not a constant.
// The script prints the PC; mapping PC back to a source line is the CCS GUI's job (this
// API has no address-to-symbol lookup).
//
// WHY THIS MUST BE ONE SESSION: the watchpoint is a hardware breakpoint object owned by
// the session (createProperties + add), and its property tree only makes sense after the
// Type switch to "Watchpoint" inside that session. Splitting set and run across two
// scripts would open a second session and leave nothing behind. Whether that also resets
// the target is measured on one implementation; treat the other as unverified.
//
// Two measured pitfalls, absorbed by the driver's watchWrite composite (shared code never
// touches raw property ids): watchpoints are HARDWARE resources (AET budget, adding more
// than the budget fails), and switching "Hardware Configuration.Type" to "Watchpoint"
// REBUILDS the property set, so ids discovered before the switch are dead afterwards.
//
// A code breakpoint carrying a GEL action is a different tool: per the driver contract this
// shared main is the data watchpoint, and that capability lives on as a separate,
// stack-specific workflow rather than here.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: watch_write <ccxml_path> <out_file_path> <address>"
        + " [--read] [--skip <n>] [--timeout <ms>]";
    var DEFAULT_TIMEOUT_MS = 5000;

    var args = orch.parseArgs({
        usage: USAGE,
        flags: {
            "--read": { takesValue: false },
            "--skip": { takesValue: true, parse: orch.parseInteger },
            "--timeout": { takesValue: true, parse: orch.parseInteger }
        },
        confFill: ["CCXML","OUT"], maxPositional: 3
    });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
    var address = orch.parseAddress(orch.requiredArg(args.positional, 2, "address", USAGE), "address");
    var access = args.flags["--read"] ? "Read" : "Write";
    var skipCount = args.flags["--skip"] || 0;
    var timeoutMs = args.flags["--timeout"] || DEFAULT_TIMEOUT_MS;

    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);

        var w = orch.watchWrite(address, access, skipCount);
        orch.printLog("Watchpoint on " + access.toLowerCase() + " of " + orch.hex(address)
            + " (id " + w.id + ", halt-on-trigger = " + w.haltOnTrigger + "). Running...");

        var started = new Date().getTime();
        orch.runTarget();
        var halted = orch.waitUntilHalted(timeoutMs);
        var elapsed = new Date().getTime() - started;
        var pc = orch.readPC();
        orch.printLog("Halted: " + halted + ", PC = " + pc + ", elapsed " + elapsed + " ms");
        orch.removeAllBreakpoints();

        if (halted) {
            var observed = orch.readMem(address, 16, 1)[0];
            orch.printLog("Triggered by the instruction at PC " + pc
                + " performing a " + access.toLowerCase() + " of " + orch.hex(address)
                + " (value now " + orch.hex(observed) + ").");
            orch.printLog("Look up PC " + pc + " in CCS to see the source line.");
        } else {
            orch.finishFail("no " + access.toLowerCase() + " access to " + orch.hex(address)
                + " observed within " + timeoutMs + " ms");
        }
    } catch (err) {
        orch.finishFail("Watchpoint workflow failed: " + err);
    }
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
