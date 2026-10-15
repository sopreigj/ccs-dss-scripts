// CCS 12.2.0 automation script: write a CPU register.
//
// Usage: dss.bat atomic/register/ccs12_2_0_write_reg.js <ccxml_path> <register_name> <value>
//   value: decimal or 0x-prefixed hexadecimal (no sign is accepted: to write all ones,
//          write 0xFFFF -- the library converts numbers, not negative decimals)
//
// In this API the registers live on Memory -- memory.writeRegister / memory.readRegister --
// and there is no session.registers object. DebugServer DOES declare
//   public void listRegisters(java.lang.String sFileName) throws ScriptingException
// (javadoc, DebugServer.html, this install), but its entry carries no description at all: what
// it writes into that file, and in what format, is undocumented, so this script does not rely
// on it -- it uses the name the caller gives. Register names are target-dependent (on the C28x
// family "PC" and "AL" are known to work).
//
// After the write the register is read back and printed, because a register write returns
// nothing: without the read-back the log would only claim that a call was made.
//
// A read-back that DIFFERS is reported as a WARNING and the script still ends with
// CCS12_2_0_RESULT=OK. That is deliberate: some C28x registers have masked or reserved bits
// (forced by hardware) or read-only fields, so writing a value and reading back a different
// one is normal for those registers. Making every mismatch a failure would turn a legitimate
// write into a FALSE FAILURE -- the mirror image of "failed but still reported success", and
// the harder of the two to diagnose. (The other interface reached the same decision for the
// same reason. The masked-bit behaviour was
// measured on the other implementation, on the same C28x family -- not re-measured here.)
//
// Register contents do not survive the script -- the session is closed at the end -- so a
// register write is normally one step inside a single-session workflow, not a standalone
// way to change how the target behaves.
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

var USAGE = "Usage: dss.bat atomic/register/ccs12_2_0_write_reg.js <ccxml_path> <register_name> <value>";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 3 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var registerName = requiredArg(args.positional, 1, "register_name", USAGE);
var value = parseNumber(requiredArg(args.positional, 2, "value", USAGE), "value");

// Encryption line sealed: CSMSCR's
// bit15 FORCESEC locks the CSM. The C28x register name space has no CSMSCR (it is
// memory-mapped; the reachable path is mem_write 0x0AEF, guarded there), so this name check
// hits nothing today -- it is defense in depth for the day TI hangs peripheral registers
// into the register name space. Marker + direct exit, same pattern as flash_op's refusal.
if (/^csmscr$/i.test(registerName)) {
    printLog("CCS12_2_0_RESULT=FAIL REFUSED: " + registerName + " is the CSM security register;"
        + " setting FORCESEC locks the CSM. Refused by policy.", USAGE);
    java.lang.System.exit(1);
}

try {
    var session = openTarget(ccxmlPath);

    printLog("Writing " + hex(value) + " to " + registerName + "...");
    session.memory.writeRegister(registerName, value);

    var readBack = session.memory.readRegister(registerName);
    printLog(registerName + " = " + hex(readBack) + " (read back)");
    // Compared as hex strings: what comes back from Java is a wrapped value whose type does
    // not equal a JS number under ===, so the comparison goes through one shared formatter
    // instead of through JS equality.
    if (java.lang.Long.toHexString(readBack) !== java.lang.Long.toHexString(value)) {
        printLog("  WARNING: read-back differs from the value written (" + hex(value)
            + "); the register may have masked/reserved bits or read-only fields.");
    }
} catch (err) {
    finishFail("Register write failed: " + err);
}

finishOk();
