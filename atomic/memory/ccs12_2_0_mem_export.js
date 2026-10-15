// CCS 12.2.0 automation script: export a block of target memory to a file.
//
// Usage: dss.bat atomic/memory/ccs12_2_0_mem_export.js <ccxml_path> <address> <count> <file>
//           [--format hex|int|long|float|coff] [--binary] [--page data] [--append]
//   address   hexadecimal with a 0x prefix
//   count     number of WORDS to export (the API takes a word count, not a byte count)
//   file      output file; must be an ABSOLUTE path
//   --format  how each word is written (default hex). this stack takes a Memory.IOFormat constant,
//             NOT a format string: the other interface's "--format \"16-Bit Hex - TI Style\""
//             is an idiom that has no equivalent here. The names used below map onto the
//             javadoc constants: hex=HEX(1) int=INT(2) long=LONG(3) float=FLOAT(4) coff=COFF(5).
//   --binary  saveBinary: raw binary without a format header, i.e. the shape that
//             loadBinaryProgram can read back
//   --page    program (default) or data. this stack takes the page as a real call argument, so the
//             "0xADDR@DATA" address-suffix syntax is neither used nor accepted here.
//   --append  append to an existing file instead of overwriting it (save's bAppend flag)
//
// WHY <file> MUST BE ABSOLUTE (the rule is carried over from the shared contract, not
// re-measured here): a relative output name is resolved by the debugger against ITS OWN
// bin directory -- <CCS_ROOT>\ccs\ccs_base\DebugServer\bin -- and not against the caller's
// current directory (two different working directories produced the same landing place). The
// log line echoes the relative name, so "where did the file go" becomes unanswerable, and
// inside the CCS installation is almost never where anyone wanted it.
//
// Why the script exists at all: what is in the target is the only truth, and looking at it in
// a debugger window leaves no evidence and cannot be compared between two runs. A file can be
// diffed, which is the basis of long-running debugging and regression work.
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

var USAGE = "Usage: dss.bat atomic/memory/ccs12_2_0_mem_export.js <ccxml_path> <address> <count> <file> "
    + "[--format hex|int|long|float|coff] [--binary] [--page data] [--append]";

var DEFAULT_FORMAT = "hex";

// Execution order of the array is the order the names are printed in the usage error, so the
// caller sees the whole accepted set, not just the one that was wrong.
var FORMATS = [
    { name: "hex", ioFormat: Packages.com.ti.debug.engine.scripting.Memory.IOFormat.HEX },
    { name: "int", ioFormat: Packages.com.ti.debug.engine.scripting.Memory.IOFormat.INT },
    { name: "long", ioFormat: Packages.com.ti.debug.engine.scripting.Memory.IOFormat.LONG },
    { name: "float", ioFormat: Packages.com.ti.debug.engine.scripting.Memory.IOFormat.FLOAT },
    { name: "coff", ioFormat: Packages.com.ti.debug.engine.scripting.Memory.IOFormat.COFF }
];

var PAGE_PROGRAM = Packages.com.ti.debug.engine.scripting.Memory.Page.PROGRAM;
var PAGE_DATA = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;

var args = parseArgs(arguments, {
    usage: USAGE,
    flags: {
        "--format": { takesValue: true },
        "--binary": { takesValue: false },
        "--page": { takesValue: true },
        "--append": { takesValue: false }
    },
    confFill: ["CCXML"], maxPositional: 4
});
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var address = parseAddress(requiredArg(args.positional, 1, "address", USAGE), "address");
var count = parseInteger(requiredArg(args.positional, 2, "count", USAGE), "count");
// The output path is checked for absoluteness but not for existence: an export creates it.
var filePath = requireAbsolutePath(requiredArg(args.positional, 3, "file", USAGE), "output file");

var isBinary = args.flags["--binary"] === true;
var append = args.flags["--append"] === true;
var formatName = args.flags["--format"] || DEFAULT_FORMAT;

if (count < 1) usageError("count must be at least 1", USAGE);
var pageName = args.flags["--page"] || "program";
if (pageName !== "program" && pageName !== "data") usageError("--page must be program or data", USAGE);

var format = null;
var formatNames = [];
for (var i = 0; i < FORMATS.length; i++) {
    formatNames.push(FORMATS[i].name);
    if (FORMATS[i].name === formatName) format = FORMATS[i];
}
if (format === null) {
    usageError("--format must be one of " + formatNames.join(" / ") + ", got: " + formatName, USAGE);
}

// Refused instead of ignored: saveBinary writes no format header, so a --format given with
// --binary would silently not decide anything, while looking exactly like a request that it did.
if (isBinary && args.flags["--format"] !== undefined) {
    usageError("--binary does not use --format; give only one of them", USAGE);
}
if (isBinary && append) {
    usageError("--binary cannot append; saveBinary always writes a fresh file", USAGE);
}
// The javadoc of Memory.save says "Append is not supported for COFF formatted files", so an
// append request would fail somewhere inside the debugger. Say it here, where it is readable.
if (append && format.name === "coff") {
    usageError("append is not supported for COFF files (Memory.save javadoc)", USAGE);
}

var page = (pageName === "data") ? PAGE_DATA : PAGE_PROGRAM;

try {
    var session = openTarget(ccxmlPath);

    if (isBinary) {
        printLog("Exporting " + count + " words (binary, no format header) from " + hex(address)
            + " to " + filePath);
        session.memory.saveBinary(address, page, count, filePath);
    } else {
        printLog("Exporting " + count + " words as " + format.name + " from " + hex(address)
            + " to " + filePath + (append ? " (append)" : " (overwrite)"));
        session.memory.save(address, page, count, filePath, format.ioFormat, append);
    }
    printLog("Export done.");
} catch (err) {
    finishFail("Memory export failed: " + err);
}

finishOk();
