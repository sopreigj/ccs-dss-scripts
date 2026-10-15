// Orchestration driver facade (CCS 12.2.0 implementation).
// Contract: the name table exported by session/orch_driver.js.
//
// WHY THE orch* PREFIX: session/session.js exposes its helpers as GLOBAL functions
// (openTarget, parseArgs, hex, finishOk, ...). A top-level function of the same name in
// this file would clobber them when the entry loads it -- and because ES3 hoists function
// declarations, capturing the original before the redefinition would still grab the new
// one and recurse forever. So every implementation here is named orch*, and the common
// names live only on the ORCH_DRIVER object that entries and shared mains consume.
//
// ARGV: measured on this machine, the top-level `arguments` seen inside a load()'d file
// IS the entry script's argument list (probe: entry foo bar -> loaded lib sees len=2 a0=foo),
// so parseArgs(spec) can hide argv here exactly as the 20.x facade does with process.argv.
//
// All session.js globals are referenced lazily INSIDE functions (never at top level), so
// `require()` of this file under node does not throw -- that is what lets the cross-repo
// key-set diff load both drivers. ES3 subset, ASCII only (repo rule D9).
var _session = null;
var _symbolsPath = null;
var _argv = arguments;

function _req() {
    if (_session === null) throw new Error("orch_driver: openTarget() has not been called");
    return _session;
}

// Java longs and evaluate() strings arrive as either a JS number or a wrapper whose
// toString() is the text (12.2.0 watch_write carries the same caution). Number() parses
// both "0x..." and decimal text, so one normaliser covers both shapes.
function _num(value) {
    if (typeof value === "number") return value;
    var n = Number("" + value);
    if (isNaN(n)) n = parseInt("" + value, 10);
    return n;
}

// MEASURED '=' rejoin pre-pass: dss.bat cuts "--set x=1" at the '=' (not at the space) - a transport defect the
// contract assigns to THIS layer (same family as envList). The 20.x transport does not drop
// '=', so having this pre-pass only here is a legitimate per-stack override.
function _rejoinSetPairs(argv) {
    var out = [];
    for (var i = 0; i < argv.length; i++) {
        var token = "" + argv[i];
        out.push(token);
        if (token !== "--set") continue;
        if (i + 1 >= argv.length) continue;
        var id = "" + argv[i + 1];
        if (id.indexOf("=") >= 0) { out.push(id); i++; continue; }
        if (i + 2 >= argv.length) { out.push(id); i++; continue; }
        var raw = "" + argv[i + 2];
        if (raw.length > 1 && raw.substring(0, 2) === "--") { out.push(id); i++; continue; }
        out.push(id + "=" + raw);
        i += 2;
    }
    return out;
}
function orchParseArgs(spec) { return parseArgs(_rejoinSetPairs(_argv), spec); }
function orchRequiredArg(positional, index, name, usage) { return requiredArg(positional, index, name, usage); }
function orchRequireAbsoluteFile(path, label) { return requireAbsoluteFile(path, label); }
function orchRequireAbsolutePath(path, label) { return requireAbsolutePath(path, label); }
function orchParseAddress(text, label) { return parseAddress(text, label); }
function orchParseInteger(text, label) { return parseInteger(text, label); }
function orchParseNumber(text, label) { return parseNumber(text, label); }
// Argument-order divergence the facade absorbs: this stack's parseBitSize is (text, allowed, label)
// with allowed REQUIRED (calling it as (text, label) makes the label the receiver of
// allowed.join and throws "Cannot find function join" -- measured by the first smoke run).
// The contract signature is (text, label), with the allowed set baked in behind it. The set
// below mirrors what the contract fixes, so every implementation accepts the same bit sizes.
var ORCH_ALLOWED_BIT_SIZES = [8, 16, 24, 32, 40, 48, 64];
function orchParseBitSize(text, label) { return parseBitSize(text, ORCH_ALLOWED_BIT_SIZES, label); }
function orchUsageError(message, usage) { usageError(message, usage); }
function orchEnvList(name) {
    var raw = java.lang.System.getenv(name);
    if (!raw) return [];
    var parts = ("" + raw).split(";");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var item = parts[i].replace(/^\s+|\s+$/g, "");
        if (item) out.push(item);
    }
    return out;
}

// The library's openTarget already prints "Configuring target configuration: ..." and
// "Opening debug session..." (kept in the same order every original script printed), so
// unlike the 20.x facade this one adds no log line of its own.
function orchOpenTarget(ccxmlPath) {
    _session = openTarget(ccxmlPath);
}
function orchLoadProgram(outPath) {
    _req().memory.loadProgram(outPath);
}
// Explicit symbol load for the shared main's --symbols-only mode; evalExpr reuses it so the
// lazy per-path rule lives in exactly one place.
function orchLoadSymbols(symbolsPath) {
    if (symbolsPath && symbolsPath !== _symbolsPath) {
        loadSymbols(_req(), symbolsPath);
        _symbolsPath = symbolsPath;
    }
}
function orchReadPC() {
    return hex(_num(_req().expression.evaluate("PC")));
}
function orchRunTarget() {
    _req().target.runAsynch();
}
function orchRunForMs(ms) {
    orchRunTarget();
    sleepMs(ms);
    _req().target.halt();
    return orchReadPC();
}
function orchHaltTarget() {
    _req().target.halt();
}
// STRICT query: errors propagate - load_run's three-outcome semantics must
// tell "the query failed" from "the target is running", and swallowing an exception into
// false would state a failure as a fact (the exact style the shared workstream rejects).
function orchIsHalted() {
    return _req().target.isHalted();
}
// Quiet variant for the poll loop: one failed query counts as "not halted yet" and polling
// continues - a timeout is then reported honestly by the caller. This is the board-proven
// behaviour of waitUntilHalted; it stays untouched.
function _isHaltedQuiet() {
    try { return _req().target.isHalted(); } catch (e) { return false; }
}
// Same 50 ms poll loop the workflows already use (ccs12_2_0_step / ccs12_2_0_watch_write).
function orchWaitUntilHalted(timeoutMs) {
    var deadline = new Date().getTime() + timeoutMs;
    while (new Date().getTime() < deadline) {
        if (_isHaltedQuiet()) return true;
        sleepMs(50);
    }
    return _isHaltedQuiet();
}
function orchStep(kind) {
    if (kind === "into") _req().target.sourceStep.into();
    else if (kind === "over") _req().target.sourceStep.over();
    else if (kind === "out") _req().target.sourceStep.out();
    else if (kind === "asm") {
        // The shared main accepts asm (the other interface exposes it as stepInto(true));
        // on this stack the assembly steppers live on target.asmStep, a container whose method
        // name was never measured on this install. This refuses to ship a guessed call - keeping
        // that narrowing, upgraded from a generic usage error to a stated reason
        // (contract: per-stack behaviour overrides allowed here).
        usageError("assembly stepping is not available on this stack: the asm steppers"
            + " live on target.asmStep and that method name was never measured here"
            + " (decision: no guessed calls; the other interface exposes asm as"
            + " stepInto(true))", null);
    } else usageError("step kind must be into|over|out|asm, got: " + kind, null);
}
// evaluate() returns the stack's own string form; contract rule 4 keeps it as-is.
function orchEvalExpr(expr, symbolsPath) {
    orchLoadSymbols(symbolsPath);
    return "" + _req().expression.evaluate(expr);
}
// Raw cell string for sampling/write-back: this stack's evaluate already
// returns the native string that IS the CSV cell format (byte-compatible with the old
// workflows/ccs12_2_0_sample_exprs.js "" + evaluate).
function orchEvalRaw(expr, symbolsPath) {
    orchLoadSymbols(symbolsPath);
    return "" + _req().expression.evaluate(expr);
}
// Whole-file write: the shared layer builds the text (with \r\n) and it is
// written verbatim, never via a platform line separator - byte-identical to 20.x's
// fs.writeFileSync.
function orchWriteTextFile(path, text) {
    var w = new java.io.FileWriter(path);
    try { w.write(text); } finally { w.close(); }
}
function orchSleepMs(ms) { sleepMs(ms); }
function orchPrintLog(msg) { printLog(msg); }
function orchHex(value) { return hex(value); }
// DATA page, not PROGRAM (measured): a peripheral register
// such as GPBMUX2 at 0x6F98 lives only in data space - page 0 throws Error 0x20000 there
// while page 1 returns the value; RAM and flash read the same in either page, and the
// target's running/halted state changes nothing. The page is stack plumbing: the shared
// layer keeps address/bitSize/count and never sees it.
var _PAGE_DATA = Packages.com.ti.debug.engine.scripting.Memory.Page.DATA;
function orchReadMem(address, bitSize, count) {
    var raw = _req().memory.readData(_PAGE_DATA, address, bitSize, count);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
        var v = _num(raw[i]);
        // 32-bit reads arrive sign-extended on this engine (the pin_drive line measured it);
        // <=16-bit values print correctly unnormalised, so only the 32-bit case is forced.
        if (bitSize === 32) v = v >>> 0;
        out.push(v);
    }
    return out;
}
function orchWriteMem(address, value, bitSize) {
    _req().memory.writeData(_PAGE_DATA, address, value, bitSize);
}

// add() idiom copied from workflows/ccs12_2_0_run_to_bp.js: a 0x literal goes in as the
// parsed NUMBER, a symbol name as the STRING; negative id means not created.
function orchAddBreakpoint(location) {
    var id;
    if (typeof location === "number") {
        id = _req().breakpoint.add(location);
    } else if (/^0[xX]/.test("" + location)) {
        id = _req().breakpoint.add(parseAddress("" + location, "location"));
    } else {
        id = _req().breakpoint.add(location);
    }
    var n = _num(id);
    if (isNaN(n) || n < 0) {
        throw new Error("breakpoint could not be set at " + location + " (add returned " + id + ")");
    }
    return n;
}
function orchRemoveBreakpoint(id) {
    try { _req().breakpoint.remove(id); } catch (e) { /* absent must not change the verdict */ }
}
function orchRemoveAllBreakpoints() {
    try { _req().breakpoint.removeAll(); } catch (e) { /* same */ }
}
// The three verified steps from workflows/ccs12_2_0_run_to_bp.js: resolve the address
// (0x literal -> parseAddress, symbol -> evaluate, neither -> null), treat "already at X"
// as a hit (loadProgram parks the CPU at main), else run + poll + compare PCs.
// Silent: the shared main prints, this returns data only.
function orchRunToBreakpoint(location, timeoutMs, symbolsPath) {
    orchLoadSymbols(symbolsPath);
    var bpAddress = null;
    if (/^0[xX]/.test("" + location)) {
        bpAddress = parseAddress("" + location, "location");
    } else {
        try { bpAddress = _num(_req().expression.evaluate(location)); } catch (e) { bpAddress = null; }
    }
    var pcNow = _num(_req().expression.evaluate("PC"));
    if (bpAddress !== null && pcNow === bpAddress) {
        return { hit: true, alreadyAt: true, halted: true, pc: hex(pcNow), expected: hex(bpAddress) };
    }
    var id = orchAddBreakpoint(location);
    _req().target.runAsynch();
    var halted = orchWaitUntilHalted(timeoutMs);
    var observed = _num(_req().expression.evaluate("PC"));
    orchRemoveBreakpoint(id);
    var hit = halted && bpAddress !== null && observed === bpAddress;
    return {
        hit: hit, alreadyAt: false, halted: halted,
        pc: hex(observed),
        expected: bpAddress === null ? null : hex(bpAddress)
    };
}
// the same decision -- THE FLOW BELOW IS BOARD-MEASURED (F28335 +
// XDS100v1, CCS 12.2.0: watch on the WATCH_ADDR address halted the running firmware within 2000 ms).
// Discovered by board probes. The property names are NOT the ones
// in TI's msp430f169_watchpoints.js example -- that example's "Type.Trigger 0" does not
// exist on CCS 12.2.0 (measured, three probes); what exists:
//   1. createProperties(<AET index found via getTypes(), not a hard-coded 1>)
//   2. setString("Hardware Configuration.Type", "Watchpoint") -- rebuilds the sub-tree,
//      exactly the 20.x Type-first mechanism; READ THE VALUE BACK before trusting it
//   3. setString("Hardware Configuration.Type.Trigger Type.Location", "" + address)
//      setString("Hardware Configuration.Type.Trigger Type.Memory", access) -- Write|Read
//      optional "...Trigger Type.Skip Count" (the set name is measured; its EFFECT is not)
//   4. haltOnTrigger via getBoolean("...Action Type.Halt CPU") BEFORE add -- it is a
//      BOOLEAN property; getString throws "not a string ..." on it. No per-id query exists
//      after add (Breakpoint: add/remove/removeAll/createProperties/getTypes/loadConfig/
//      saveConfig only), so the pre-add read is the readback.
function orchWatchWrite(address, access, skipCount) {
    var aet = 1;
    var types = _req().breakpoint.getTypes();
    for (var i = 0; i < types.length; i++) {
        if (("" + types[i]) === "AET") { aet = i; break; }
    }
    var props = _req().breakpoint.createProperties(aet);
    props.setString("Hardware Configuration.Type", "Watchpoint");
    var typeBack = "" + props.getString("Hardware Configuration.Type");
    if (typeBack !== "Watchpoint") {
        throw new Error("watchpoint Type did not take (readback \"" + typeBack + "\")");
    }
    props.setString("Hardware Configuration.Type.Trigger Type.Location", "" + address);
    props.setString("Hardware Configuration.Type.Trigger Type.Memory", access);
    if (skipCount > 0) {
        props.setString("Hardware Configuration.Type.Trigger Type.Skip Count", "" + skipCount);
    }
    var haltBack;
    try {
        haltBack = props.getBoolean("Hardware Configuration.Type.Action Type.Halt CPU");
    } catch (e) { haltBack = null; }
    var id = _num(_req().breakpoint.add(props));
    if (isNaN(id) || id < 0) {
        throw new Error("hardware watchpoint could not be set at " + address + " (add returned " + id + ")");
    }
    return { id: id, haltOnTrigger: haltBack };
}

function orchReleaseOnExit() { releaseOnExit(); }
function orchFinishOk() { finishOk(); }
function orchFinishFail(reason) { finishFail(reason); }

var ORCH_DRIVER = {
    sentinel: "ccs-orch-driver-v1",
    parseArgs: orchParseArgs,
    requiredArg: orchRequiredArg,
    requireAbsoluteFile: orchRequireAbsoluteFile,
    requireAbsolutePath: orchRequireAbsolutePath,
    parseAddress: orchParseAddress,
    parseInteger: orchParseInteger,
    parseNumber: orchParseNumber,
    parseBitSize: orchParseBitSize,
    usageError: orchUsageError,
    envList: orchEnvList,
    openTarget: orchOpenTarget,
    loadProgram: orchLoadProgram,
    loadSymbols: orchLoadSymbols,
    readPC: orchReadPC,
    runTarget: orchRunTarget,
    runForMs: orchRunForMs,
    haltTarget: orchHaltTarget,
    isHalted: orchIsHalted,
    waitUntilHalted: orchWaitUntilHalted,
    step: orchStep,
    evalExpr: orchEvalExpr,
    evalRaw: orchEvalRaw,
    writeTextFile: orchWriteTextFile,
    sleepMs: orchSleepMs,
    printLog: orchPrintLog,
    hex: orchHex,
    readMem: orchReadMem,
    writeMem: orchWriteMem,
    addBreakpoint: orchAddBreakpoint,
    removeBreakpoint: orchRemoveBreakpoint,
    removeAllBreakpoints: orchRemoveAllBreakpoints,
    runToBreakpoint: orchRunToBreakpoint,
    watchWrite: orchWatchWrite,
    releaseOnExit: orchReleaseOnExit,
    finishOk: orchFinishOk,
    finishFail: orchFinishFail,
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_DRIVER;
}
