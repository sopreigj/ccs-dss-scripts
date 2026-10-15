// Measurement probe (board-queue 1e
// addresses word or byte addresses? Method: two overlapping writes in adjacent addresses
// on the DATA page. If addresses are words the two 16-bit writes land in different words
// and read back clean; if they are byte addresses the second write overlaps the tail of
// the first and the values entangle. Address 0x8FF0 is the cell 1b proved firmware-free.
// The original values are read first and restored afterwards (probe leaves no trace).
//
// Usage: dss.bat test/probe_word_address.js <ccxml_path>
// Outcome: CCS12_2_0_RESULT=OK/FAIL marker.
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
var USAGE = "Usage: dss.bat test/probe_word_address.js <ccxml_path>";
var args = parseArgs(arguments, { usage: USAGE, confFill: ["CCXML"], maxPositional: 1 });
var ccxmlPath = requireAbsoluteFile(requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
var PAGE = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;
var A = 0x8FF0;

try {
    var session = openTarget(ccxmlPath);
    var old0 = session.memory.readWord(PAGE, A);
    var old1 = session.memory.readWord(PAGE, A + 1);
    var old2 = session.memory.readWord(PAGE, A + 2);
    printLog("original: A=" + hex(old0) + " A+1=" + hex(old1) + " A+2=" + hex(old2));

    session.memory.writeWord(PAGE, A, 0xBEEF);
    session.memory.writeWord(PAGE, A + 1, 0x1234);
    var r0 = session.memory.readWord(PAGE, A);
    var r1 = session.memory.readWord(PAGE, A + 1);
    var r2 = session.memory.readWord(PAGE, A + 2);
    printLog("after two writes: A=" + hex(r0) + " A+1=" + hex(r1) + " A+2=" + hex(r2));

    session.memory.writeWord(PAGE, A, old0);
    session.memory.writeWord(PAGE, A + 1, old1);
    session.memory.writeWord(PAGE, A + 2, old2);
    printLog("restored: A=" + hex(session.memory.readWord(PAGE, A))
        + " A+1=" + hex(session.memory.readWord(PAGE, A + 1))
        + " A+2=" + hex(session.memory.readWord(PAGE, A + 2)));

    if (r0 === 0xBEEF && r1 === 0x1234 && r2 === old2) {
        printLog("VERDICT: word-addressed (adjacent writes did not overlap)");
    } else {
        printLog("VERDICT: entangled (writes overlapped or shifted) -- read the three values above");
    }
} catch (err) {
    finishFail("word-address probe failed: " + err);
}
finishOk();