// CCS 12.2.0 automation script: list, or perform, the operations of the F28335 Flash Settings.
//
// Usage: dss.bat atomic/program/ccs12_2_0_flash_op.js <ccxml_path> --list
//        dss.bat atomic/program/ccs12_2_0_flash_op.js <ccxml_path> --op "<operation>" [--op "<operation>" ...]
//                                             [--set <id>=<value> ...]
//
// THE OPERATIONS TAKE NO ARGUMENTS -- THE PROPERTIES DECIDE EVERYTHING.
// The eight operation names are exactly the eight buttons of the CCS "F28335 Flash Settings"
// dialog: in the device property file
//   <CCS_ROOT>\ccs\ccs_base\DebugServer\propertyDB\TMS320F28335_FlashProperties.xml
// every button's <action> is literally flash.performOperation("<name>"), and
//   void performOperation(String opCode)
// (javadoc, Flash.html) has no second parameter. Which sectors get erased, which password
// gets written, which pin the frequency test drives -- all of it comes from the flash
// properties of the current session, never from the operation name. So the defaults are the
// whole story, and their consequences are:
//   Erase             -> FlashSectorA..FlashSectorH default to **1** (all eight selected) in
//                        the property file: a bare "--op Erase" erases the ENTIRE flash,
//                        0x300000-0x33FFFF = 262144 words = 512 KB of bytes.
//   ProgramPassword   -> FlashKey0..FlashKey7 default to FFFF, i.e. the BLANK password.
//   FrequencyTest     -> FTPin defaults to GPIO0, i.e. the test drives a real pin.
//   CalculateChecksum -> read only; it computes, and the result is afterwards readable from
//                        the readOnly properties FlashChecksum / OTPChecksum.
// Because of that, this script prints the properties in effect -- as the debugger itself
// reports them -- before anything is performed, so the consequence is visible before the
// trigger rather than after it.
//
// THE ENCRYPTION LINE IS SEALED (a deliberate, permanent policy; the shared contract
// requires the same rule from every implementation):
//   * ProgramPassword is REFUSED by this script: it exits 1 before any session is opened,
//     so the refusal never touches hardware and can be re-run offline. Rationale: a non-blank
//     password nobody remembers cannot be cleared by erasing (erase needs the Code Security
//     Module unlocked first), so the part is effectively lost. It is a production-time
//     operation for protecting IP; if it is ever truly needed, do it by hand in the CCS GUI.
//   * --set FlashKey0..7 is refused the same way: writing the password keys is the loading
//     step of the ProgramPassword path, and sealing the trigger while leaving the magazine
//     in is not sealing anything.
//   * Lock's reversibility is UNPROVEN (the evidence so far says it acts on a read/write,
//     reset-to-0 bit, CSMSCR FORCESEC, not on a flash cell -- but "it should come back" is
//     not "it has been shown to come back"). So Lock is DEMOTED from "refused" to "WARNING,
//     then proceed": the decision to lock belongs to the operator, and hiding the capability
//     would only make the risk invisible.
//   * Unlock (decrypt) STAYS: it is the recovery path after a mistaken lock.
// Bypass sealed as well: CSMSCR's word address is 0x0AEF -- mem_write/mem_fill refuse any
// write whose range covers it with a width that can reach bit15 (a plain memory write would
// lock the CSM while bypassing this WARNING), and write_reg refuses the register name CSMSCR
// (the C28x register name space has no such name today; that guard is defense in depth).
//
// this stack DIFFERENCES FROM the other implementation (copying its code silently breaks here):
//   * listSupportedOperations() returns VOID on this stack -- it prints the op codes itself. The
//     the other implementation's version returns a '|'-separated string and its code compares against it.
//     Never write `var supported = ...listSupportedOperations()`: that yields undefined;
//   * consequently the --op names CANNOT be checked against the runtime list before a session
//     exists, and the check below uses a static list of the eight dialog names. That list is
//     device-specific (it comes from the property file above); the runtime list is printed as
//     well, because it is the authority and the static list is not;
//   * the SCOPE of a flash property is UNKNOWN on this stack (javadoc, user guide and property file
//     all stay silent; the other implementation measured "session only", which must not be
//     inherited). Therefore a property is always set in the SAME session as the operation,
//     and "--set together with --list" is refused instead of relying on a persistence that
//     nobody has measured;
//   * THE LAUNCHER DROPS '=' FROM AN ARGUMENT, so "<id>=<value>" never arrives as one token.
//     Measured through the real dss.bat, with a probe that prints its own argv:
//         --set FTPin=GPIO51   ->  argv: "--set" "FTPin" "GPIO51"
//         --set FTPin GPIO51   ->  argv: "--set" "FTPin" "GPIO51"    (identical)
//         --set FTPin:GPIO51   ->  argv: "--set" "FTPin:GPIO51"      (a colon survives)
//     The other interface never meets this: its runner hands the arguments to its script host
//     unchanged. Here
//     the pair arrives as two adjacent tokens and rejoinAssignments() below puts it back
//     together, so both "--set <id>=<value>" and "--set <id> <value>" work. Without that
//     step "--set FlashSectorA=false" answers "too many arguments: false", which explains
//     nothing about what went wrong.
//
// Outcome: dss.bat returns 0 whatever happens, so success/failure is reported as the
// stdout marker  CCS12_2_0_RESULT=OK  /  CCS12_2_0_RESULT=FAIL <reason>  (see session/session.js).
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

var USAGE = "Usage: dss.bat atomic/program/ccs12_2_0_flash_op.js <ccxml_path> --list\n"
    + "       dss.bat atomic/program/ccs12_2_0_flash_op.js <ccxml_path> --op \"<operation>\" "
    + "[--op \"<operation>\" ...] [--set <id>=<value> ...]\n"
    + "       (\"--set <id> <value>\" as two arguments is equally accepted: the CCS launcher"
    + " strips '=' from an argument, so both forms arrive the same way)";

// The eight dialog buttons of the F28335 Flash Settings dialog, i.e. the op codes (see the
// header: each button's <action> in the device property file is performOperation("<name>")).
var DIALOG_OPERATIONS = [
    "CalculateChecksum", "Erase", "Unlock", "DepletionRecovery",
    "FrequencyTest", "EndFrequencyTest", "ProgramPassword", "Lock"
];

// The settable flash properties of this device, spelled exactly as the property file spells
// them (note that the clock divider is FlashCLKINDV -- no second "I").
var SETTABLE_PROPERTIES = [
    "FlashOperations",
    "FlashOSCCLK", "FlashCLKINDV", "FlashPLLCR",
    "FlashSectorA", "FlashSectorB", "FlashSectorC", "FlashSectorD",
    "FlashSectorE", "FlashSectorF", "FlashSectorG", "FlashSectorH",
    "FlashKey0", "FlashKey1", "FlashKey2", "FlashKey3",
    "FlashKey4", "FlashKey5", "FlashKey6", "FlashKey7",
    "FTPin"
];

// Present in the same property file but marked readOnly: only a checksum operation can
// change them, so a --set on them can only fail. Refused up front, with the reason.
var READ_ONLY_PROPERTIES = ["FlashChecksum", "OTPChecksum"];

// The operation whose reversibility is UNPROVEN (see the header): warned about, then the
// operator's decision. ProgramPassword used to sit in this list too; it is now REFUSED
// outright before any session opens (the encryption line is sealed, header above).
var UNTESTED_DANGEROUS_OPERATIONS = ["Lock"];

// Put a "<id> <value>" pair back into "<id>=<value>" (see the header: the CCS launcher drops
// the '=' -- this is a measured property of the transport, not a convenience). Only the token
// after --set is touched, and a follower that is itself an option is left alone so that a
// missing value is reported as a missing value rather than as an invented assignment.
function rejoinAssignments(argv) {
    var out = [];
    for (var i = 0; i < argv.length; i++) {
        var token = "" + argv[i];
        out.push(token);
        if (token !== "--set") continue;
        if (i + 1 >= argv.length) continue;                              // no value at all
        var id = "" + argv[i + 1];
        if (id.indexOf("=") >= 0) { out.push(id); i++; continue; }       // '=' did survive
        if (i + 2 >= argv.length) { out.push(id); i++; continue; }
        var raw = "" + argv[i + 2];
        if (raw.length > 1 && raw.substring(0, 2) === "--") { out.push(id); i++; continue; }
        out.push(id + "=" + raw);
        i += 2;
    }
    return out;
}

var args = parseArgs(rejoinAssignments(arguments), {
    usage: USAGE,
    flags: {
        "--list": { takesValue: false },
        // --op is repeatable on purpose: FrequencyTest and EndFrequencyTest are a start/end
        // pair and must run inside the SAME session. A second invocation would be a second
        // session, with default properties and no frequency-test state.
        "--op": { takesValue: true, repeat: true },
        "--set": { takesValue: true, repeat: true }
    },
    confFill: ["CCXML"], maxPositional: 1
});
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var operations = args.flags["--op"] || [];
var listRequested = args.flags["--list"] === true;
var assignments = args.flags["--set"] || [];
var i;

if (!listRequested && operations.length === 0) {
    usageError("either --list or --op \"<operation>\" is required", USAGE);
}
if (listRequested && operations.length > 0) {
    // Silently preferring one of two contradictory requests would let the operator believe
    // the other one also happened.
    usageError("--list and --op are mutually exclusive", USAGE);
}
if (listRequested && assignments.length > 0) {
    usageError("--list performs nothing, and the scope of a flash property across sessions is"
        + " unmeasured on this stack, so --set together with --list would rely on a persistence nobody has shown", USAGE);
}

// Validation before a session is opened: a typo must be refused without touching hardware,
// and while the operation is still far away from the flash.
for (i = 0; i < operations.length; i++) {
    if (DIALOG_OPERATIONS.indexOf(operations[i]) < 0) {
        usageError("unknown flash operation: " + operations[i] + " (the F28335 dialog operations are: "
            + DIALOG_OPERATIONS.join(", ") + "; use --list to see what this target reports)", USAGE);
    }
}
for (i = 0; i < assignments.length; i++) {
    var assignment = assignments[i];
    var separator = assignment.indexOf("=");
    if (separator <= 0) usageError("--set expects <id>=<value> (or <id> <value>), got: " + assignment, USAGE);
    var id = assignment.substring(0, separator);
    var raw = assignment.substring(separator + 1);
    if (raw === "") usageError("--set " + id + " has an empty value", USAGE);
    if (SETTABLE_PROPERTIES.indexOf(id) < 0) {
        if (READ_ONLY_PROPERTIES.indexOf(id) >= 0) {
            usageError(id + " is readOnly in the device property file; run CalculateChecksum instead of setting it", USAGE);
        }
        usageError("unknown flash property: " + id + " (this device exposes: " + SETTABLE_PROPERTIES.join(", ") + ")", USAGE);
    }
}

// Encryption line sealed (header above): refused BEFORE any session is opened, so the
// refusal path never touches hardware and is verifiable offline. The marker line follows
// the same CCS12_2_0_RESULT=FAIL convention finishFail uses, but exits directly -- finishFail
// would run the shutdown path, and there is nothing to shut down before openTarget().
for (i = 0; i < operations.length; i++) {
    if (operations[i] === "ProgramPassword") {
        printLog("CCS12_2_0_RESULT=FAIL REFUSED: ProgramPassword writes the CSM password into flash"
            + " (0x33FFF8-0x33FFFF); an unrecorded non-blank password makes the device unrecoverable"
            + " (erase needs CSM unlock). Refused by policy; if production IP protection"
            + " genuinely requires it, do it by hand in the CCS GUI.");
        java.lang.System.exit(1);
    }
}
for (i = 0; i < assignments.length; i++) {
    var refusedId = assignments[i].substring(0, assignments[i].indexOf("="));
    if (/^FlashKey[0-7]$/i.test(refusedId)) {
        printLog("CCS12_2_0_RESULT=FAIL REFUSED: --set " + refusedId + " writes the CSM password keys,"
            + " the loading step of the ProgramPassword path this script refuses"
            + ".");
        java.lang.System.exit(1);
    }
}

// Property read for the "in effect" line, typed by the session itself (the three getters are
// typed, and asking the wrong one throws). A property that cannot be read is reported as
// "?" rather than throwing: this line is a display, and turning a display problem into a
// failure would also block read-only operations. The debugger decides what the operation
// does; the line only makes that decision visible.
function readOption(session, id) {
    try {
        var valueType = "" + session.flash.options.getValueType(id);
        if (valueType === "boolean") return "" + session.flash.options.getBoolean(id);
        if (valueType === "numeric") return "" + session.flash.options.getNumeric(id);
        if (valueType === "string") return "" + session.flash.options.getString(id);
        return "?";
    } catch (err) {
        return "?";
    }
}

function describeProperties(session) {
    var selected = "";
    var unreadable = "";
    var i;
    for (i = 0; i < 8; i++) {
        var letter = "ABCDEFGH".charAt(i);
        var value = readOption(session, "FlashSector" + letter);
        if (value === "true") selected = selected + letter;
        else if (value !== "false") unreadable = unreadable + letter;
    }
    var keys = [];
    var keysAreBlank = true;
    for (i = 0; i < 8; i++) {
        var key = readOption(session, "FlashKey" + i);
        keys.push(key);
        if (/^f{4}$/i.test(key) === false) keysAreBlank = false;
    }
    printLog("Properties in effect: sectors=[" + (selected.length > 0 ? selected : "none") + "]"
        + "  FTPin=" + readOption(session, "FTPin")
        + "  keys=" + (keysAreBlank ? "FFFF x8 (blank password)" : keys.join(","))
        + "  flashOperations=" + readOption(session, "FlashOperations")
        + "  OSCCLK=" + readOption(session, "FlashOSCCLK")
        + " CLKINDV=" + readOption(session, "FlashCLKINDV")
        + " PLLCR=" + readOption(session, "FlashPLLCR"));
    if (unreadable.length > 0) {
        printLog("WARNING: could not read the selection of FlashSector" + unreadable
            + "; the debugger still decides which sectors the operation touches.");
    }
}

// Apply one <id>=<value> to this session. The value type is asked from the session, because
// the setters are typed (setBoolean / setNumeric / setString) and the property file is not
// the authority here -- the live session is.
function applyAssignment(session, assignment) {
    var separator = assignment.indexOf("=");
    var id = assignment.substring(0, separator);
    var raw = assignment.substring(separator + 1);

    // optionExist() is the authority on "does this session have this property"; the static
    // list above only had to be right enough to reject typos before the session opened. If
    // the two disagree, the static list is the suspect -- so say so instead of guessing.
    if (session.flash.options.optionExist(id) !== true) {
        finishFail("property " + id + " passed the F28335 list but optionExist() reports that this"
            + " session does not have it; the static list is device-specific -- see the printed options above");
    }

    var valueType = "" + session.flash.options.getValueType(id);
    var expected;
    if (valueType === "boolean") {
        if (raw !== "true" && raw !== "false") {
            usageError(id + " is a boolean property; write true or false, got: " + raw, USAGE);
        }
        session.flash.options.setBoolean(id, raw === "true");
        expected = raw;
    } else if (valueType === "numeric") {
        if (!/^[0-9]+$/.test(raw)) usageError(id + " is a numeric property; got: " + raw, USAGE);
        var number = parseInt(raw, 10);
        session.flash.options.setNumeric(id, number);
        expected = "" + number;
    } else if (valueType === "string") {
        session.flash.options.setString(id, raw);
        expected = raw;
    } else {
        finishFail("property " + id + " has an unexpected value type: " + valueType);
    }

    // Read back: a property that did not take effect is exactly the trap this script exists
    // to avoid -- the operation would then use a value the operator never chose. Unlike a
    // register read-back, a difference here has no legitimate masking explanation, so this
    // one fails instead of warning.
    var readBack;
    if (valueType === "boolean") readBack = "" + session.flash.options.getBoolean(id);
    else if (valueType === "numeric") readBack = "" + session.flash.options.getNumeric(id);
    else readBack = "" + session.flash.options.getString(id);
    printLog("  --set " + id + " = " + readBack + " (asked for " + expected + ")");
    if (readBack !== expected) {
        throw "setting " + id + " read back as " + readBack + ", expected " + expected;
    }
}

try {
    var session = openTarget(ccxmlPath);

    if (session.flash.isFlashSupported() !== true) {
        finishFail("flash is not supported by this target configuration");
    }

    // On this stack the method returns void and prints the op codes itself, so this call is the only
    // way to see them -- and it is the authority that the static --op list cannot replace.
    printLog("Flash operations reported by this target (this stack: listSupportedOperations() prints; it returns void):");
    session.flash.listSupportedOperations();

    if (listRequested === false) {
        if (assignments.length > 0) {
            printLog("Applying flash properties (this session only -- their scope across sessions is unmeasured on this stack):");
            for (i = 0; i < assignments.length; i++) applyAssignment(session, assignments[i]);
        }

        // Before anything runs: what the operations will actually use. The regex covers
        // "Flash|FTPin" because FTPin carries no "Flash" in its id and the frequency test
        // drives that very pin.
        printLog("Options as reported by the debugger (the operations take no arguments -- these decide the outcome):");
        session.flash.options.printOptions("Flash|FTPin");
        describeProperties(session);

        for (i = 0; i < operations.length; i++) {
            var operation = operations[i];
            if (UNTESTED_DANGEROUS_OPERATIONS.indexOf(operation) >= 0) {
                printLog("WARNING: " + operation + " sets CSMSCR.FORCESEC; its reversibility is"
                    + " UNPROVEN (this has never been measured)"
                    + " Continuing, because the decision to lock belongs to the"
                    + " operator -- this warning exists so it is made knowingly.");
            }
            printLog("Performing flash operation: " + operation + "...");
            session.flash.performOperation(operation);
            printLog("Flash operation finished: " + operation);
        }
    }
} catch (err) {
    finishFail("Flash operation failed: " + err);
}

finishOk();
