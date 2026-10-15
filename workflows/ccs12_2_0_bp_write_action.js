// RENAMED: this file was workflows/ccs12_2_0_watch_write.js.
// The name watch_write now hosts the SHARED data-watchpoint main on both implementations
// (orchestration/watch_write.js + entry); the GEL-action capability kept living here under a
// name that says what it is - capabilities never vanish silently. Everything below is unchanged.
//
// CCS 12.2.0 workflow: attach a write action to a breakpoint, run, and report what happened
// (one session).
//
// Usage: dss.bat workflows/ccs12_2_0_bp_write_action.js <ccxml_path> <out_file_path> <location>
//          [--write "<gel_expression>"] [--timeout <ms>]
//
//   <location>  symbol name (e.g. main) or 0x-prefixed address for the breakpoint
//   --write     the GEL expression the breakpoint runs when it is reached; when omitted it
//               is taken from the environment variable CCS_WRITE_EXPR
//   --timeout   how long to wait for the halt, default 5000 ms
//
// WHY THIS MUST BE ONE SESSION: the breakpoint and the response attached to it are children
// of the session -- terminate() disposes them and no API can reattach. "Set a breakpoint with an action" and "run to it" therefore cannot be split
// across two scripts: the second would open a fresh connection (whether connect resets the
// target is untested here.
//
// WHAT THIS SCRIPT ANSWERS: "did the action at this location fire, and where was the target
// when it did". The other interface's watch_write workflow answers the same question with a
// HARDWARE data watchpoint -- a different mechanism with different property names, limited
// by AET resources. this stack documents the response-action route, so only the documented property
// names are used and nothing is invented:
//   Miscellaneous.Name                   -- mandatory to select the breakpoint
//   Hardware Configuration.Type.Location -- WHERE the breakpoint is; without it the properties
//                                           object carries no location at all and the
//                                           breakpoint can never be hit.
//                                           MEASURED : the CCS 12 User's Guide name
//                                           "Hardware Configuration.Location" does NOT exist on
//                                           this install (probe: "Could not find property
//                                           Location"); a fresh printProperties() shows the
//                                           AET default tree's location id is
//                                           "Hardware Configuration.Type.Location"
//                                           (second falsified TI-doc name after "Type.Trigger 0").
//   Debugger Response.Action             -- "Execute Expression (GEL)" (space before the
//                                           parenthesis is in the fresh tree's ALLOWED VALUES)
//   Debugger Response.Action.Expression  -- the GEL text to run
//
// WHICH createProperties() OVERLOAD, AND WHY THE LOCATION IS AN ADDRESS: TI's example for
// this very feature -- and its hardware-watchpoint example
// (ccs_base\scripting\examples\DebugServerExamples\msp430f169_watchpoints.js, which comments
// createProperties(1) "Create a hardware break point") -- both use the overload with a type
// id, not the no-argument default. That id is now LOOKED
// UP via getTypes() instead of hardcoded -- measured on this stack, getTypes() returns
// ["Software", "AET"] indexed by type id, so id 1 is AET (the advanced-event-triggers
// machinery hardware triggers live in; TI's comment calls it "a hardware break point").
// The lookup selects by name and fails loudly if the array changes.
// CAVEAT measured : that example's
// PROPERTY NAMES ("Hardware Configuration.Type.Trigger 0", ".Access") do NOT exist on
// CCS 12.2.0 -- the working hardware-watchpoint names are the "Trigger Type.*" family,
// discovered via a fresh object's printProperties (see session/orch_driver.js orchWatchWrite).
// The manual calls Miscellaneous.Name "mandatory to
// select the breakpoint" and passes an ADDRESS to Hardware Configuration.Location
// ("Hardware Configuration.Location", 0x500). MEASURED (probe in %TEMP%,
// probe_bp_location.js): that manual name is ABSENT on CCS 12.2.0; the working id is
// Hardware Configuration.Type.Location (set with decimal text -> setString accepted,
// add() returned a valid id, remove() clean). The manual also lists
// "Hardware Configuration.Location.symbolic"
// as READ-ONLY, so this script never writes a symbol into the location property:
// a symbol is resolved to its address first and the address is written.
// Whether the location property would also accept a symbol name is NOT documented and NOT
// measured -- do not assume it. The setString() call passes the address as a number's
// decimal text, exactly as the manual does.
//
// printProperties(): ON A FRESH OBJECT it dumps the TYPE'S DEFAULT PROPERTY TREE -- measured
// : a fresh createProperties() printed every property of that type with its default
// value and ALLOWED VALUES, which is how the hardware-watchpoint property names were found
// (see session/orch_driver.js orchWatchWrite; the earlier claim in this header that it "can never
// reveal a name the script never set" was wrong). On an object where names HAVE been set it
// prints that object's tree; below it is called as a check that the names above were accepted.
//
// MEASURED on this hardware (three runs + probes 2-4 in %TEMP%; replaces the
// blanket "UNVERIFIED" this paragraph used to carry):
//   - Location decimal text PARSES: setString("Hardware Configuration.Type.Location",
//     "" + 0x300a81) then the
//     target halted at exactly 0x300a81 -> the address round-trips.
//   - HALT BEHAVIOR depends on the expression, both branches observed:
//       expression FAILS   -> SEVERE from the Breakpoint Manager + CPU HALTS at the bp
//                             (85-121 ms after run; probes 4 and the first tool runs);
//       expression SUCCEEDS -> silent, NO halt within 3-5 s (tool run 4 + probe 2),
//                             consistent with the manual's section title "non-intrusive
//                             breakpoint - perform an action on breakpoint hit".
//     Note: the tree row "Action Type.Halt CPU" reads true in both cases - that row does
//     NOT predict the outcome; the action result does.
//   - ERROR-path EXECUTION is proven: the Breakpoint Manager evaluated the expression
//     (its SEVERE quotes the expression text; a dot expression too, probe 4 - the dot
//     does not break firing).
//   - SUCCESS-path target WRITE IS EXECUTED (decided , board item 1b). The old
//     "read 0" had two causes at once: (1) OVERWRITE - &<firmware symbol> = <its address>, and a
//     watch on that address fired in 72 ms at PC 0x300a81 ("the instruction at PC 0x300a81
//     performing a write of <that address> (value now 0x0)"), so THIS very breakpoint location
//     rewrites the variable to 0 one instruction after the action fires; (2) the earlier
//     read was CROSS-SESSION (a new session resets and re-runs startup init). Deciding
//     run: marker cell 0x8FF0 (watch_write: no firmware write in 5052 ms) + expression
//     form proved by direct evaluate (0xBEEF), then bp+GEL at 0x300a81 -> in-session
//     read = 0xBEEF -> the action executes. GEL_TextOutput as a firmware-independent
//     marker is unavailable in DSS ("'GEL_TextOutput()' not found").
// The report-never-hang rule stands: a target that never stops is a failure, and a halt
// that is NOT at the breakpoint address is also a failure, because then nothing about the
// action is established.
//
// dss.bat limit (measured on this machine): a --write value containing a space or '=' kills
// cmd-level parsing of dss.bat (exit 255, Java never starts), or is silently split at the
// '='. GEL text normally contains both, so use CCS_WRITE_EXPR in that case -- the same
// variable atomic/expression/ccs12_2_0_write_expr.js uses for "an expression to write that the command line
// cannot carry".
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

var USAGE = "Usage: dss.bat workflows/ccs12_2_0_bp_write_action.js <ccxml_path> <out_file_path> <location> "
    + "[--write \"<gel_expression>\"] [--timeout <ms>]  (or set env CCS_WRITE_EXPR)";

var DEFAULT_TIMEOUT_MS = 5000;

// Local copies, because session/session.js carries no target-state helper.
function readPC(session) { return hex(session.expression.evaluate("PC")); }

function isHalted(session) {
    try { return session.target.isHalted(); } catch (e) { return false; }
}

function waitUntilHalted(session, timeoutMs) {
    var deadline = new Date().getTime() + timeoutMs;
    while (new Date().getTime() < deadline) {
        if (isHalted(session)) return true;
        sleepMs(50);
    }
    return isHalted(session);
}

// A Java method that returns a primitive long arrives here as a JavaScript number (measured
// under this engine, Rhino 1.6R5, for parseAddress and longValue), but evaluate() is a
// separate code path with no hardware-free measurement, so comparison values are normalised
// to one primitive type rather than assumed.
function asNumber(value) {
    if (typeof value === "number") return value;
    return parseInt("" + value, 10);
}

var args = parseArgs(arguments, {
    usage: USAGE,
    flags: {
        "--write": { takesValue: true },
        "--timeout": { takesValue: true, parse: parseInteger }
    },
    maxPositional: 3
});

var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var outPath = requireAbsoluteFile(requiredArg(args.positional, 1, "out_file_path", USAGE), "out_file_path");
var location = requiredArg(args.positional, 2, "location", USAGE);
var timeoutMs = args.flags["--timeout"] || DEFAULT_TIMEOUT_MS;

var writeExpr = args.flags["--write"];
if (writeExpr === undefined) {
    var envWrite = java.lang.System.getenv("CCS_WRITE_EXPR");
    if (envWrite) writeExpr = "" + envWrite;
}
if (!writeExpr) usageError("missing required argument: --write <gel_expression> (or set env CCS_WRITE_EXPR)", USAGE);

// A location that starts with a digit is an address and must be written with 0x; the 0x form
// itself starts with a digit, so it is exempted rather than refused (see the header).
if (/^[0-9]/.test(location) && !/^0[xX]/.test(location)) {
    usageError("location starts with a digit, so it is an address and needs the 0x prefix "
        + "(e.g. 0x301C9C); use a symbol name for anything that is not an address. Got: " + location, USAGE);
}
// parseAddress() already returns a primitive number in this engine (measured under Rhino
// 1.6R5: typeof parseAddress("0x1F") === "number" and it is === 31), so the comparisons
// below are between numbers with no conversion needed here.
var literalAddress = /^0[xX]/.test(location) ? parseAddress(location, "location") : null;

var failed = null;
try {
    var session = openTarget(ccxmlPath);
    printLog("Loading program: " + outPath);
    session.memory.loadProgram(outPath);

    var bpAddress = literalAddress;
    if (bpAddress === null) {
        try { bpAddress = asNumber(session.expression.evaluate(location)); } catch (e) { bpAddress = null; }
    }
    // Without a location the properties object describes a breakpoint that is nowhere, so a
    // symbol that will not evaluate is a hard failure here rather than a run that proves
    // nothing. (The old code did not set a location at all and still logged "on reaching
    // <location>" as a fact -- that line and this check are the fix for it.)
    if (bpAddress === null) {
        finishFail("cannot set the breakpoint location: symbol \"" + location
            + "\" did not evaluate to an address, and Hardware Configuration.Type.Location is written as an address"
            + " (docs: the symbolic sub-property is read-only)");
    }

    // This stack's properties object takes the property values directly (setString), whereas the
    // other interface sets them on the collection by property-set id. Do not port
    // one call shape onto the other. The type id comes from getTypes()
    // -- measured ["Software", "AET"], id 1 = AET, which is what TI's example comment means
    // by "hardware break point"; see the header for the whole story.
    var typeNames = session.breakpoint.getTypes();
    var hwTypeId = -1;
    var t;
    for (t = 0; t < typeNames.length; t++) {
        if (("" + typeNames[t]).indexOf("AET") >= 0) { hwTypeId = t; break; }
    }
    if (hwTypeId < 0) {
        finishFail("no AET breakpoint type in getTypes() (length " + typeNames.length
            + ") -- refusing to guess a type id");
    }
    printLog("Breakpoint type id " + hwTypeId + " (" + typeNames[hwTypeId] + ") selected from getTypes().");
    var props = session.breakpoint.createProperties(hwTypeId);
    props.setString("Miscellaneous.Name", "ccs12_2_0_bp_write_action");
    // The location, as the address of <location>: the manual's id "Hardware.Configuration.Location"
    // was measured ABSENT on CCS 12.2.0; the fresh-tree id is Hardware.Configuration.Type.Location
    // OK, remove() OK).
    props.setString("Hardware Configuration.Type.Location", "" + bpAddress);
    // Space before (GEL) is required: it is what the fresh tree's ALLOWED VALUES column shows.
    props.setString("Debugger Response.Action", "Execute Expression (GEL)");
    props.setString("Debugger Response.Action.Expression", writeExpr);

    printLog("Action attached: on reaching " + location + " (" + hex(bpAddress)
        + "), execute GEL: " + writeExpr);
    printLog("Properties stored in this BreakpointProperties object, as the debugger reports them"
        + " (printProperties() shows this object's tree only -- it cannot reveal a name the script never set):");
    try { props.printProperties(); }
    catch (e2) { printLog("  (printProperties() unavailable here: " + e2 + ")"); }

    var bpId = session.breakpoint.add(props);
    var bpIdNum = asNumber(bpId);
    printLog("Breakpoint id " + bpId + ".");
    if (bpIdNum < 0) {
        failed = "breakpoint with an action could not be set at " + location
            + " (add() returned " + bpId + "); the property names above are the documented ones, "
            + "so compare them with the tree printed above before changing anything";
    } else {
        printLog("Running, waiting up to " + timeoutMs + " ms for the halt...");
        session.target.runAsynch();
        var halted = waitUntilHalted(session, timeoutMs);
        var pcAfter = asNumber(session.expression.evaluate("PC"));
        printLog("Halted = " + halted + ", PC = " + hex(pcAfter) + ".");
        if (!halted) {
            failed = "target did not halt within " + timeoutMs + " ms. Either the location was never "
                + "reached, or this breakpoint's action does not halt the CPU (a breakpoint property "
                + "that is unverified on this stack); the GEL action may still have executed -- confirm the "
                + "written value with atomic/expression/ccs12_2_0_eval_expr.js in the same session shape";
        } else if (pcAfter === bpAddress) {
            printLog("Breakpoint HIT at " + location + "; the GEL action was issued.");
        } else {
            // Answering "did the action fire?" is this script's whole purpose, so "not
            // established" cannot end as success. Same rule as workflows/ccs12_2_0_run_to_bp.js.
            failed = "target halted at " + hex(pcAfter) + ", not at the action breakpoint "
                + hex(bpAddress) + ". OBSERVED: the target halted, at that PC, after the run was "
                + "issued. NOT OBSERVED: any halt at the action breakpoint, and therefore whether "
                + "the GEL action ran at all -- confirm the written value with "
                + "atomic/expression/ccs12_2_0_eval_expr.js in the same session shape";
        }

        try { session.breakpoint.remove(bpId); }
        catch (e3) { printLog("Warning: could not remove breakpoint " + bpId + ": " + e3); }
    }
} catch (err) {
    finishFail("Watch-write failed: " + err);
}

if (failed !== null) finishFail(failed);
finishOk();
