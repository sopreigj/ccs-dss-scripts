// CCS 12.2.0 automation script: import the contents of a file into target memory.
//
// Usage: dss.bat atomic/memory/ccs12_2_0_mem_import.js <ccxml_path> <address> <count> <file> [--page data]
//        dss.bat atomic/memory/ccs12_2_0_mem_import.js <ccxml_path> <address> <file> --binary [--page data]
//   address   hexadecimal with a 0x prefix
//   count     how many WORDS to load; text mode only -- memory.load takes a word count
//   file      input file; must be an ABSOLUTE path, like every other path in this repository
//   --binary  loadBinaryProgram: the WHOLE file is loaded at <address>; it has no length
//             argument, so <count> is refused in this mode rather than quietly reduced to
//             "how many words are read back as evidence"
//   --page    program (default) or data
//
// HOW THIS DIFFERS FROM ccs12_2_0_load_program.js: that one is a program load -- it can program
// flash, it replaces the symbol table, and per its javadoc it restarts the target. This script
// only pushes bytes into memory (load / loadBinaryProgram as used here write what the file
// says at the address given), which is what you want for injecting a data image or a partial
// image without a full program load.
//
// TRAP ON THIS STACK -- loadBinaryProgram TAKES THE FILE FIRST AND THE ADDRESS SECOND:
//   void loadBinaryProgram(String sFileName, long startAddr)
// Every other memory method takes the address first (load(nAddress, nPage, nLength, sFile),
// fill(nAddress, nPage, nLength, nValue), save(nAddress, nPage, ...)), so copying the other implementation
// project's loadBinary(location, file) order here would load the file at whatever address the
// debugger made of a path string. The call below is written from the javadoc signature.
//
// The javadoc also says loadBinaryProgram issues Target.halt() before the load and
// Target.restart() after it -- i.e. it leaves the target RUNNING, which is not what the
// the other implementation's loadBinary does. That sentence is javadoc-sourced and NOT verified on hardware.
//
// a board before it is treated as known; this particular sentence is NOT in that list yet, so
// read it as "what the javadoc claims" and nothing stronger.
//
// CONSEQUENCE FOR THE READ-BACK BELOW: if that sentence is true, the target is left running,
// and reading memory while the CPU runs cannot show what the write left -- the read may catch a
// different state than the load produced. The evidence read is therefore taken after an
// explicit, quiet halt, and it is only meaningful because of that halt. The text path does not
// need one of its own: memory.load() does not restart the target (only loadBinaryProgram is
// documented to), so the session is still stopped when the read happens.
//
// Element width: the text formats carry their own element size in the file header and load()
// reads that header itself, so this script has no --format option on the import side. The
// evidence line below reads 16-bit elements regardless, which means its numbers only need to
// be consistent with each other, not with the file's element size.
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

var USAGE = "Usage: dss.bat atomic/memory/ccs12_2_0_mem_import.js <ccxml_path> <address> <count> <file> [--page data]\n"
    + "       dss.bat atomic/memory/ccs12_2_0_mem_import.js <ccxml_path> <address> <file> --binary [--page data]";

// Evidence read back after the import, in words.
var EVIDENCE_COUNT = 4;

var PAGE_PROGRAM = Packages.com.ti.debug.engine.scripting.Memory.Page.PROGRAM;
var PAGE_DATA = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;

var args = parseArgs(arguments, {
    usage: USAGE,
    flags: {
        "--binary": { takesValue: false },
        "--page": { takesValue: true }
    },
    // The two forms take a different number of positionals (text 4, binary 3). The larger one
    // is declared here and tightened below, so that the error message can say what the binary
    // form looks like instead of just "too many arguments".
    confFill: ["CCXML"], maxPositional: 4
});
var isBinary = args.flags["--binary"] === true;
if (isBinary && args.positional.length > 3) {
    usageError("--binary does not take <count>; write: <ccxml_path> <address> <file> --binary", USAGE);
}

var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var address = parseAddress(requiredArg(args.positional, 1, "address", USAGE), "address");
var filePath = requireAbsoluteFile(requiredArg(args.positional, isBinary ? 2 : 3, "file", USAGE), "input file");
// In binary mode <count> is not an import length (the whole file is loaded), so the number
// only drives the evidence line; it must not be taken from the command line.
var count = isBinary ? EVIDENCE_COUNT : parseInteger(requiredArg(args.positional, 2, "count", USAGE), "count");

if (count < 1) usageError("count must be at least 1", USAGE);
var pageName = args.flags["--page"] || "program";
if (pageName !== "program" && pageName !== "data") usageError("--page must be program or data", USAGE);
var page = (pageName === "data") ? PAGE_DATA : PAGE_PROGRAM;

try {
    var session = openTarget(ccxmlPath);

    if (isBinary) {
        printLog("Importing (binary) " + filePath + " -> " + hex(address) + " (entire file)");
        // Address last: see the TRAP note in the header -- this signature is the reverse of
        // every other memory call.
        session.memory.loadBinaryProgram(filePath, address);
    } else {
        printLog("Importing " + filePath + " -> " + hex(address) + " (" + count + " words)");
        session.memory.load(address, page, count, filePath);
    }

    // Binaries go in with loadBinaryProgram first, so the halt covers both paths: the text path
    // is already stopped, and the binary path is only stopped once this call has run (the
    // javadoc says loadBinaryProgram restarts the target after loading -- see the header).
    haltQuietly();

    var probeCount = Math.min(count, EVIDENCE_COUNT);
    var readBack = session.memory.readData(page, address, 16, probeCount);
    var parts = [];
    for (var i = 0; i < readBack.length; i++) parts.push("[" + i + "]=" + hex(readBack[i]));
    printLog("Read back: " + parts.join(" "));
} catch (err) {
    finishFail("Memory import failed: " + err);
}

finishOk();
