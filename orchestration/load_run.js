// Orchestration shared main: load a program, then LEAVE THE TARGET RUNNING - one session,
// driven through the orchestration driver every implementation provides. The workflows/*_load_run.js
// entry loads this file and calls ORCH_MAIN(ORCH_DRIVER); this file stays stack-blind: no
// stack names, no launcher names, only the driver's common name table.
//
// WHY THIS MUST BE ONE SESSION: load and run are two atomic scripts that would open two
// sessions - state across the boundary is not assumed to survive (a fresh connection
// resetting the target is measured on one implementation; treat the other as unverified) - and
// chaining them means "reset
// right after flashing" so the program never runs the way it was loaded. The termination
// rule alone is enough: closing a session disposes every child object and there is no
// reattach.
//
// LEAVING IT RUNNING IS THE POINT: releaseOnExit() suppresses the library's normal-exit
// safety halt BEFORE the first exit path can be reached; a failure still halts the target
// (finishFail ignores the flag). A killed or crashed session still halts. For a
// deterministic stop, halt explicitly or cut the power.
//
// THE HALTED/RUNNING QUESTION HAS THREE OUTCOMES, NOT TWO: after the load, ask isHalted()
// (the strict driver query - errors propagate, report never assumes), print the raw answer
// with the PC, and only issue the run when the CPU is actually stopped. A target that is
// already running after the load (possible on stacks whose loadProgram restarts) is
// reported as such - no second run is issued, because this script's promise is "running",
// not "ran". A query that cannot be answered is a failure: whether the target is running
// would then be NOT established, and neither would this script's promise.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: load_run <ccxml_path> <out_file_path>";

    var args = orch.parseArgs({ usage: USAGE, flags: {}, confFill: ["CCXML","OUT"], maxPositional: 2 });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var outPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");

    try {
        orch.openTarget(ccxmlPath);
        orch.printLog("Loading program: " + outPath);
        orch.loadProgram(outPath);

        var pcAfterLoad = orch.readPC();
        var halted = false;
        try {
            halted = orch.isHalted();
        } catch (queryErr) {
            orch.finishFail("could not ask the target whether it is halted (" + queryErr
                + "); whether the target is running after the load is therefore NOT established,"
                + " and neither is this script's promise - check the connection and re-run"
                + " instead of assuming the load started the program");
        }
        orch.printLog("After load: isHalted() = " + halted + ", PC = " + pcAfterLoad);

        // Suppress the safety halt first: every later exit path is now "leave it running",
        // while finishFail still halts (it ignores this flag).
        orch.releaseOnExit();
        if (halted) {
            orch.printLog("Running target from PC " + pcAfterLoad + "...");
            orch.runTarget();
        } else {
            orch.printLog("Target is already running after the load; not issuing a second run.");
        }
        orch.printLog("Session closes now; the target keeps running.");
    } catch (err) {
        orch.finishFail("Load+run failed: " + err);
    }
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
