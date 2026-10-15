// CCS 12.2.0 automation script: fill a block of memory with one value.
//
// Usage: dss.bat atomic/memory/ccs12_2_0_mem_fill.js <ccxml_path> <address> <count> <value> [bit_size]
//   address   hexadecimal with a 0x prefix
//   count     number of WORDS to fill (the API takes a word count, not a byte count)
//   value     decimal or 0x-prefixed hexadecimal
//   bit_size  8 / 16 / 24 / 32, default 16 -- used ONLY as the guard on <value>
//
// SHAPE DIFFERENCE ON THIS STACK -- THERE IS NO BIT SIZE IN THE CALL:
//   void fill(long nAddress, int nPage, int nLength, long nValue)
// (javadoc, Memory.html) has no width parameter and no way to say how wide <value> is, so
// [bit_size] cannot be handed to the debugger. It is kept as the guard on <value> only, and
// the width the debugger actually writes with is NOT verified here. Keeping the guard
// matters: the other implementation measured that a value too wide for the target word is
// silently truncated (write 0x1FFFF into 16 bits and 0xFFFF is what lands), which would make
// this script report success while filling memory with a value nobody asked for.
//
// The fill targets the PROGRAM page (Memory.Page.PROGRAM = 0). There is no --page option
// here: the other implementation's script has none either, and a silently assumed page would be exactly the
// kind of hidden decision this repository removes.
//
// The first few words are read back as evidence, since fill() returns nothing. They are
// printed with the element index and not with a derived address: `base + i * (bits/8)` (what
// the old mem_read did) invented addresses past the end of the block. The reason is that C28x
// is word-addressed -- the measured half comes from another implementation, so treat it as unverified
// here: what the address of element i actually is on this target still has to be measured.
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

var USAGE = "Usage: dss.bat atomic/memory/ccs12_2_0_mem_fill.js <ccxml_path> <address> <count> <value> [bit_size]";

// How many words are read back as proof: enough to show the fill landed, few enough to read.
var EVIDENCE_COUNT = 4;

// Memory.Page.PROGRAM / the read-back width for the evidence line. The constants are ints in
// the API (javadoc constant-values.html: PROGRAM=0, DATA=1); they resolve in this Rhino
// (measured with a probe through the real dss.bat).
var PAGE_PROGRAM = Packages.com.ti.debug.engine.scripting.Memory.Page.PROGRAM;

var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 5 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var address = parseAddress(requiredArg(args.positional, 1, "address", USAGE), "address");
var count = parseInteger(requiredArg(args.positional, 2, "count", USAGE), "count");
var value = parseNumber(requiredArg(args.positional, 3, "value", USAGE), "value");
var bitSize = args.positional.length > 4 ? parseBitSize(args.positional[4], [8, 16, 24, 32], "bit_size") : 16;
if (count < 1) usageError("count must be at least 1", USAGE);
// Same guard as mem_write: a value that does not fit is not truncated silently, it is a usage
// error -- otherwise the fill "succeeds" with a value the caller never asked for.
if (value > Math.pow(2, bitSize) - 1) {
    usageError("value " + value + " does not fit in " + bitSize + " bits", USAGE);
}
// Encryption line sealed: a fill whose range covers CSMSCR (0x0AEF) with a width that can reach bit15
// would lock the CSM while bypassing flash_op's WARNING.
var CSMSCR_WORD = 0x0AEF;
if (bitSize > 8 && address <= CSMSCR_WORD && CSMSCR_WORD < address + count) {
    usageError("fill range covers CSMSCR (0xAEF): setting FORCESEC locks the CSM"
        + " -- refused by policy", USAGE);
}

try {
    var session = openTarget(ccxmlPath);

    printLog("Filling " + count + " words at " + hex(address) + " with " + hex(value) + "...");
    session.memory.fill(address, PAGE_PROGRAM, count, value);

    // The probe reads 16-bit elements regardless of [bit_size]: the call above cannot be told
    // a width, so the width of the read-back is this script's convention, not the API's.
    var probeCount = Math.min(count, EVIDENCE_COUNT);
    var readBack = session.memory.readData(PAGE_PROGRAM, address, 16, probeCount);
    var parts = [];
    for (var i = 0; i < readBack.length; i++) parts.push("[" + i + "]=" + hex(readBack[i]));
    printLog("Read back: " + parts.join(" "));
} catch (err) {
    finishFail("Memory fill failed: " + err);
}

finishOk();
