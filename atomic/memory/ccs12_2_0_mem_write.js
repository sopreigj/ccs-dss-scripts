// CCS 12.2.0 automation script: write an integer to a memory address
// Usage: dss.bat atomic/memory/ccs12_2_0_mem_write.js <ccxml_path> <address_hex> <value_hex_or_dec> [bit_size]
//
// Parameters:
//   bit_size  data width (optional, default 16): 8 / 16 / 24 / 32
//
// Examples:
//   dss.bat atomic/memory/ccs12_2_0_mem_write.js xxx.ccxml 0x8000 0x1234
//   dss.bat atomic/memory/ccs12_2_0_mem_write.js xxx.ccxml 0x8000 0x12345678 32
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

var USAGE = "Usage: dss.bat atomic/memory/ccs12_2_0_mem_write.js <ccxml_path> <address_hex> <value_hex_or_dec> [bit_size]";

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 4 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var address = parseAddress(requiredArg(args.positional, 1, "address_hex", USAGE), "address_hex");
// The value is required; the original reported its absence with the "value" wording, not
// with the generic missing-argument text.
var valueStr = requiredArg(args.positional, 2, "value", USAGE);
var value = parseNumber(valueStr, "value_hex_or_dec");

var bitSize = 16;
var bitSizeArg = args.positional[3];
if (bitSizeArg !== undefined) bitSize = parseBitSize(bitSizeArg, [8, 16, 24, 32], "bit_size");

// A value wider than the requested width would be truncated silently by Memory.write, so
// refuse it here instead of writing something the operator did not ask for.
var maxValue = Math.pow(2, bitSize) - 1;
if (value < 0 || value > maxValue) {
    usageError("value must fit in " + bitSize + "-bit unsigned integer: " + valueStr, USAGE);
}

// Encryption line sealed: 0x0AEF is
// the word address of CSMSCR; a write with bit15 FORCESEC=1 locks the CSM -- the same effect
// as "flash_op --op Lock", but through memory write it bypasses that script's WARNING.
// Widths <= 8 cannot reach bit15, so they are not refused.
var CSMSCR_WORD = 0x0AEF;
if (bitSize > 8 && address <= CSMSCR_WORD && CSMSCR_WORD < address + Math.ceil(bitSize / 16)) {
    usageError("write covers CSMSCR (0xAEF): setting FORCESEC locks the CSM"
        + " -- refused by policy", USAGE);
}

// DATA page (measured ): peripheral registers are invisible in program
// space (page PROGRAM throws Error 0x20000 on 0x6F98, page DATA writes/reads fine);
// RAM and flash accept either page. The CSMSCR refusal above runs before any access.
var PAGE_DATA = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;

try {
    var session = openTarget(ccxmlPath);

    printLog("To " + hex(address).substring(2).toUpperCase() + " write " + hex(value).substring(2).toUpperCase() + " (" + bitSize + " bit) ...");

    session.memory.writeData(PAGE_DATA, address, value, bitSize);

    printLog("Write done.");
} catch (err) {
    finishFail("Write memory failed: " + err);
}

finishOk();
