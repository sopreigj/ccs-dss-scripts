// session/session.js -- the one shared library for every ccs12_2_0_*.js script.
//
// CONTENTS
//   [A] CLI layer     : result markers, argument parsing, path/address/number validation
//   [B] Session layer : debug session lifecycle, safety halt, symbol loading
//
// WHY ONE FILE INSTEAD OF TWO (cli.js + session.js):
//   Rhino has no require(). Every shared file has to be loaded by absolute path and its
//   load has to be guarded by hand, because load() reports a missing file by printing one
//   line and returning NORMALLY (measured -- no exception). One file means one bootstrap
//   guard per script instead of two, and no question of load order between them. The two
//   sections below stay strictly separate: section [A] knows nothing about DSS sessions.
//
// MEASURED CONSTRAINTS THAT SHAPE THIS FILE (all of them measured on a real board):
//   * load() resolves a RELATIVE path against the process CWD, not against the calling
//     script's directory.
//   * load() decodes the file with the platform charset (file.encoding=GBK on this
//     machine), so non-ASCII bytes in a .js file come out wrong; a UTF-8 Chinese comment
//     can even swallow the newline after it. Every .js/.vbs/.bat here is ASCII-only and
//     Chinese lives in the .md/.ini documents.
//   * dss.bat's own process exit code is 0 to the caller whatever the script does --
//     measured with System.exit(1), System.exit(7), a natural end and a nonexistent script
//     path. The cmd-level %errorlevel% does carry the JVM's code when it is read after the
//     call (on a following line inside a .bat, or via cmd /v:on with !errorlevel!); reading
//     it inside the same `&`-compound line expands it before the command runs, which is a
//     measurement artifact rather than a property of the launcher. The value is ambiguous
//     anyway -- a nonexistent script path also yields 0 -- so the outcome is reported on
//     stdout instead:
//         success -> RESULT_OK_LINE
//         failure -> RESULT_FAIL_PREFIX + reason, then System.exit(EXIT_FAIL)
//     and examples/*.bat parse the OK line rather than checking %errorlevel%.
//   * A Java shutdown hook registered from Rhino does run (measured for a natural end and
//     for System.exit), which is the only way to halt the target when the script is
//     killed. run_for_ms.js and target_run.js already did this by hand; this file does it
//     once for every script.
//
// DEPENDENCY DIRECTION: atomic/*, workflows/*  ->  session/*  (one way).

// Java classes used here. The calling script imports the same packages before loading
// this file; the imports are repeated so this file does not depend on the caller doing it.
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

// Bumped whenever the contract above changes; scripts assert it after load() to turn a
// silently failed load into a loud error.
var LIB_SENTINEL = "ccs12-dss-session-v1";

var RESULT_OK_LINE = "CCS12_2_0_RESULT=OK";
var RESULT_FAIL_PREFIX = "CCS12_2_0_RESULT=FAIL ";

var EXIT_OK = 0;
var EXIT_FAIL = 1;

// Settle delay inherited from the original scripts: every one of them ended with
// Thread.sleep(1500) before the JVM exited. Nobody recorded why, and it was never
// verified, so it is not described as a mechanism here -- it is centralised so the
// number lives in exactly one place; on this stack that absolute-output rule is still unverified.
var SETTLE_MS = 1500;

function printLog(msg) { java.lang.System.out.println(msg); }

// Hexadecimal formatting for log lines. Callers must not derive per-element addresses by
// adding `index * (bits/8)`: on this target that reported addresses past the end of flash.
// (The reason is that C28x is word-addressed; that much was measured on the other implementation.
// On this stack it is neither documented nor measured.)
// The rule holds either way, which is why the memory scripts print element indices instead
// of derived addresses.)
function hex(value) { return "0x" + java.lang.Long.toHexString(value); }

// =========================================================== [A] CLI layer ==========

function resultFail(reason) { printLog(RESULT_FAIL_PREFIX + reason); }

// Usage and argument errors travel the same path as any other failure, so a .bat sees one
// kind of failure marker instead of two.
function usageError(message, usage) {
    printLog("Error: " + message);
    if (usage) printLog(usage);
    finishFail(message);
}

// -- machine-local conf reader ------------
// Every .js now reads the same ccs12_2_0.conf the .bat/.vbs consumers read, so machine and
// project values live in exactly one file. Rhino has no module path, so the conf is
// found by walking up from the CWD -- the same walk the bootstrap block uses to find
// this file. A missing conf is NOT an error here: callers only get the "copy the
// example" usage error when a parseArgs confFill slot actually needs a value.
// Format: key=value lines; ";" whole-line comments; "[section]" lines are skipped;
// keys are compared case-insensitively (the file writes them lower-case).
var __confTable = null;

function confGet(key) {
    if (__confTable === null) {
        __confTable = {};
        var dir = new java.io.File(java.lang.System.getProperty("user.dir"));
        var confFile = null;
        while (dir !== null) {
            var cand = new java.io.File(dir, "ccs12_2_0.conf");
            if (cand.exists()) { confFile = cand; break; }
            dir = dir.getParentFile();
        }
        if (confFile !== null) {
            var reader = new Packages.java.io.BufferedReader(new Packages.java.io.FileReader(confFile));
            var line;
            while ((line = reader.readLine()) !== null) {
                var text = "" + line;
                if (text.length === 0) continue;
                var head = text.charAt(0);
                if (head === ";" || head === "[") continue;
                var eq = text.indexOf("=");
                if (eq <= 0) continue;
                __confTable[text.substring(0, eq).replace(/^\s+|\s+$/g, "").toUpperCase()] =
                    text.substring(eq + 1).replace(/^\s+|\s+$/g, "");
            }
            reader.close();
        }
    }
    var raw = __confTable[("" + key).toUpperCase()];
    if (raw === undefined || raw === null || raw === "") return null;
    return raw;
}

// Parse the Rhino `arguments` object. spec:
//   { usage: "<usage string>",
//     flags: { "--symbols": { takesValue: true }, "--set": { takesValue: true, repeat: true } },
//     maxPositional: <number>, or null when the tail is a variadic list }
// Options may appear anywhere and in any order (the original scripts only recognised
// --symbols at the first optional position, so `eval_expr <ccxml> "expr" --symbols x`
// silently treated the option name as an expression).
//
// maxPositional must be declared explicitly. A missing declaration is a programming
// error and throws; too many positional arguments is a usage error. Silently ignoring
// extra arguments is the same defect class as "fails but still reports success" and was
// fixed in the other implementation for exactly that reason.
function parseArgs(argv, spec) {
    var flagsSpec = spec.flags || {};
    var positional = [];
    var flags = {};
    var list = [];
    for (var i = 0; i < argv.length; i++) list.push("" + argv[i]);

    for (var j = 0; j < list.length; j++) {
        var token = list[j];
        if (flagsSpec.hasOwnProperty(token)) {
            var def = flagsSpec[token];
            if (!def.takesValue) { flags[token] = true; continue; }
            if (j + 1 >= list.length) usageError("option " + token + " requires a value", spec.usage);
            var raw = list[++j];
            var value = def.parse ? def.parse(raw, token) : raw;
            if (def.repeat) {
                if (!flags[token]) flags[token] = [];
                flags[token].push(value);
            } else {
                flags[token] = value;
            }
        } else if (token.length > 1 && token.substring(0, 2) === "--") {
            usageError("unknown option: " + token, spec.usage);
        } else {
            positional.push(token);
        }
    }

    // confFill (spec field,: the script declares which
    // leading path positionals ccs12_2_0.conf may fill. Deliberately a deterministic split:
    //   * positional[0] looks like an absolute Windows path (X:\...) -> leave argv alone,
    //     explicit arguments always win;
    //   * otherwise (no leading path given, and the first positional is an address /
    //     expression / number) -> prepend ALL declared confFill values. This is exactly
    //     the "run without ccxml/out" shape, and it never half-fills: giving ccxml but
    //     omitting out stays a usage error (all-or-nothing).
    // A declared key with no conf value -> usage error pointing at the example file.
    if (spec.confFill && spec.confFill.length > 0) {
        var first0 = positional.length > 0 ? positional[0] : null;
        // Absolute-path shape ("X:\..." or "X:/..."), tested char by char instead of a
        // regex literal: this Rhino build rejects a bracket-class regex ending in an escaped
        // slash with "missing ; before statement" -- the char test says the same thing.
        var firstIsPath = first0 !== null && first0.length >= 3 && first0.charAt(1) === ":" &&
            (first0.charAt(2) === "\\" || first0.charAt(2) === "/");
        if (!firstIsPath) {
            var filled = [];
            for (var fi = 0; fi < spec.confFill.length; fi++) {
                var confVal = confGet(spec.confFill[fi]);
                if (confVal === null) {
                    usageError("confFill " + spec.confFill[fi] + ": no value for it and no explicit " +
                        "argument was given -- copy ccs12_2_0.conf.example to ccs12_2_0.conf and fill in " +
                        "your machine's values", spec.usage);
                }
                filled.push(confVal);
            }
            var merged = [];
            for (var mi = 0; mi < filled.length; mi++) merged.push(filled[mi]);
            for (var pi = 0; pi < positional.length; pi++) merged.push(positional[pi]);
            positional = merged;
        }
    }

    if (typeof spec.maxPositional === "undefined") {
        throw "parseArgs: spec.maxPositional is required (a number, or null for a variadic tail)";
    }
    if (spec.maxPositional !== null && positional.length > spec.maxPositional) {
        usageError("too many arguments: " + positional.slice(spec.maxPositional).join(" "), spec.usage);
    }
    return { positional: positional, flags: flags };
}

function requiredArg(positional, index, name, usage) {
    if (index >= positional.length || positional[index] === "") {
        usageError("missing required argument: " + name, usage);
    }
    return positional[index];
}

// Paths must be absolute, inputs and outputs alike. The original scripts checked the
// input side only; the other implementation measured that a relative output path is resolved
// by the debugger against its own install directory (<CCS_ROOT>\DebugServer\bin) while the
// log line echoes the relative name -- so "where did the file go" becomes unanswerable.
function requireAbsolutePath(filePath, label) {
    if (!new java.io.File(filePath).isAbsolute()) {
        usageError(label + " must be an absolute path: " + filePath, null);
    }
    return filePath;
}

function requireAbsoluteFile(filePath, label) {
    requireAbsolutePath(filePath, label);
    if (!new java.io.File(filePath).exists()) {
        usageError(label + " not found: " + filePath, null);
    }
    return filePath;
}

// Addresses must carry an explicit 0x prefix.
//
// The original scripts parsed addresses with java.lang.Long.decode(), which accepts
// "0x1F" as hex, "017" as OCTAL and bare "8000" as DECIMAL -- while every usage string
// says "hex address, e.g. 0xC000" and the examples write 0x. A bare 8000 therefore meant
// 0x1F40, not 0x8000, and a leading zero silently changed the base. Rejecting bare
// numbers removes the ambiguity at the entry point; this is a deliberate breaking change,
// recorded as a deliberate breaking change in the project history.
function parseAddress(text, label) {
    var name = label ? label : "address";
    if (!/^0[xX][0-9a-fA-F]+$/.test(text)) {
        usageError(name + " must be hexadecimal with a 0x prefix (e.g. 0xC000), got: " + text, null);
    }
    return java.lang.Long.decode(text).longValue();
}

function parseInteger(text, label) {
    var name = label ? label : "value";
    if (!/^[0-9]+$/.test(text)) {
        usageError(name + " must be a non-negative decimal integer, got: " + text, null);
    }
    return parseInt(text, 10);
}

// Accepts decimal or 0x-prefixed hexadecimal (used for values, not for addresses).
function parseNumber(text, label) {
    var name = label ? label : "value";
    if (/^0[xX][0-9a-fA-F]+$/.test(text)) return java.lang.Long.decode(text).longValue();
    if (/^[0-9]+$/.test(text)) return parseInt(text, 10);
    usageError(name + " must be decimal or 0x-prefixed hexadecimal, got: " + text, null);
    return 0;
}

// allowed is passed per script: memory read supports 8/16/32, memory write also 24.
function parseBitSize(text, allowed, label) {
    var name = label ? label : "bit size";
    var value = parseInteger(text, name);
    if (allowed.indexOf(value) < 0) {
        usageError(name + " must be one of " + allowed.join(" / ") + ", got: " + text, null);
    }
    return value;
}

// ======================================================= [B] Session layer ==========

var activeServer = null;
var activeSession = null;

// Normal exit halts the target (safety). Scripts whose whole point is to leave the target
// running -- target_run, and the workflows that end with a run -- call releaseOnExit().
// A kill or a crash ignores this flag and always halts: an abandoned running target is the
// one failure mode that can physically damage an attached power stage.
var haltOnExit = true;
var reachedNormalEnd = false;
var hookInstalled = false;

function haltQuietly() {
    try { if (activeSession && activeSession.target) activeSession.target.halt(); } catch (e) { /* already halted or gone */ }
}

// Close the session deterministically. Nothing here may throw: this runs on the failure
// path too, where the session is often already broken.
function closeQuietly(halt) {
    if (halt) haltQuietly();
    try { if (activeSession) activeSession.terminate(); } catch (e) { }
    try { if (activeServer) activeServer.stop(); } catch (e) { }
    if (activeSession || activeServer) {
        try { java.lang.Thread.sleep(SETTLE_MS); } catch (e) { }
    }
    activeSession = null;
    activeServer = null;
}

// Backstop for every exit that is not finishOk()/finishFail(): a signal, an uncaught
// exception, or a script that simply forgot to close. Closing twice is harmless because
// closeQuietly() swallows everything.
function installSafetyHook() {
    if (hookInstalled) return;
    hookInstalled = true;
    try {
        java.lang.Runtime.getRuntime().addShutdownHook(new java.lang.Thread(new java.lang.Runnable({
            run: function () {
                if (!(reachedNormalEnd && !haltOnExit)) haltQuietly();
                try { if (activeSession) activeSession.terminate(); } catch (e) { }
                try { if (activeServer) activeServer.stop(); } catch (e) { }
            }
        })));
    } catch (e) {
        printLog("Warning: could not install the safety hook: " + e);
    }
}

// Open a session on the target named by ccxmlPath and leave the CPU halted.
// This is the only place that knows the call sequence of this stack.
function openTarget(ccxmlPath) {
    installSafetyHook();
    var scriptEnv = ScriptingEnvironment.instance();
    activeServer = scriptEnv.getServer("DebugServer.1");
    // The three log lines below are the ones every original script printed, kept in the
    // same order so existing log readers keep working.
    printLog("Configuring target configuration: " + ccxmlPath);
    activeServer.setConfig(ccxmlPath);
    printLog("Opening debug session...");
    activeSession = activeServer.openSession(".*");
    printLog("Connecting target...");
    activeSession.target.connect();
    // Every caller wants a stopped CPU (reads, writes, breakpoint setup, stepping), so halt
    // explicitly instead of assuming what the connection left behind. What connect() itself
    // does to the target is NOT documented for this stack: the javadoc says only that it must be
    // called before any target operation, and the User's Guide lists "reset the target on a
    // connect" as an *option* next to "halt the target on a connect ... set by default in all
    // devices". Measured here: a sentinel written to idle RAM survives disconnect and reconnect,
    // so a connect does NOT reset RAM -- but the halt below stays unconditional, because it also
    // covers the case where the target was running.
    haltQuietly();
    return activeSession;
}

// Load only the symbol table, without flashing. Symbol names (firmware globals) need
// this before they can be evaluated, and GEL_SymbolLoad wants forward slashes.
function loadSymbols(session, outPath) {
    session.expression.evaluate('GEL_SymbolLoad("' + ("" + outPath).replace(/\\/g, "/") + '")');
}

function releaseOnExit() { haltOnExit = false; }

// Normal end. Order matters: settle the session first, then print the marker, so a .bat
// that sees CCS12_2_0_RESULT=OK knows the work is finished rather than merely started.
function finishOk() {
    reachedNormalEnd = true;
    closeQuietly(haltOnExit);
    printLog(RESULT_OK_LINE);
}

// Failure end. The target is always halted -- on a failure the operator is about to walk
// up to the board, and "it kept running after the script failed" is how a power stage
// gets damaged. The marker carries the reason so it survives the launcher not passing the
// JVM's exit code on to the caller.
function finishFail(reason) {
    resultFail(reason);
    closeQuietly(true);
    java.lang.System.exit(EXIT_FAIL);
}

function sleepMs(ms) {
    try { java.lang.Thread.sleep(ms); } catch (e) { }
}
