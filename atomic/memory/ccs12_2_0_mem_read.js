// CCS 12.2.0 automation script: read memory at address
// Reference: CCS 12 User's Guide 7.6 Scripting
//
// Usage:
//   dss.bat atomic/memory/ccs12_2_0_mem_read.js <ccxml_path> <address> <type> <count>
//
// Parameters:
//   address  hex address, e.g. 0xC000
//   type     data width: 8 / 16 / 32
//   count    number of units to read
//
// Examples:
//   dss.bat atomic/memory/ccs12_2_0_mem_read.js xxx.ccxml 0xC000 32 1
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

// The data-width detail line belongs to the usage text, not to the happy path: the original
// script printed it only when the arguments were wrong, and printing it on every run would be
// output nobody asked for.
var USAGE = "Usage: dss.bat atomic/memory/ccs12_2_0_mem_read.js <ccxml_path> <address> <type> <count>\n"
    + "  type: 8 / 16 / 32";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 4 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var address = parseAddress(requiredArg(args.positional, 1, "address", USAGE), "address");
var type = parseBitSize(requiredArg(args.positional, 2, "type", USAGE), [8, 16, 32], "type");
var count = parseInteger(requiredArg(args.positional, 3, "count", USAGE), "count");

// DATA page for every read (measured ): a peripheral register such as
// 0x6F98 is invisible in program space - page PROGRAM throws Error 0x20000, page DATA
// returns the value - while RAM and flash read identically in either page.
var PAGE_DATA = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;

try {
    var session = openTarget(ccxmlPath);

    printLog("Reading memory: " + hex(address) + ", type " + type + " bit, count " + count);
    var values = session.memory.readData(PAGE_DATA, address, type, count);

    // Only the element index is printed, never a derived address. A derived address would
    // have to assume an addressing unit, and the wrong assumption reports addresses past the
    // end of flash. Measured on this stack: consecutive addresses each carry one element
    // (three 16-bit values written to three consecutive addresses read back one per address),
    // so printing the bare index is the honest form and the caller can compute an address
    // when it needs one.
    for (var i = 0; i < values.length; i++) {
        var v = values[i];
        printLog("[" + i + "] = " + hex(v) + " (" + v + ")");
    }
} catch (err) {
    finishFail("Read memory failed: " + err);
}

finishOk();
