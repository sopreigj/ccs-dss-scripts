// Orchestration shared main: drive an idle pin inside ONE session - configure direction,
// set / clear / toggle, read back, optionally hold, then restore - driven through the
// orchestration driver every implementation provides. The
// workflows/*_pin_drive.js entry loads this file and calls ORCH_MAIN(ORCH_DRIVER);
// this file stays stack-blind.
//
// WHY THIS MUST BE ONE SESSION: peripherals do not survive a session boundary - a register
// configured by one script is back at its reset value in the next one (whether connecting
// resets the target is measured on one implementation; treat the other as unverified).
// "Configure the direction here, set the level there" is a
// two-script sequence whose second step cannot see the first.
//
// WHAT IS KNOWN ABOUT GPIO51 ON THIS BOARD (measured on an F28335; the same register family
// is exercised by this very shared code on the other implementation, so those board runs count as
// confirmation of this flow too):
//   * GPIO51 is free at reset: GPBMUX2 = 0 (GPIO function), GPBDIR bit19 = 0 (input), and
//     GPBDAT bit19 reads 1 because the internal pull-up is enabled (GPBPUD = 0);
//   * a 32-bit port-B register written with a 16-bit width IS SILENTLY TRUNCATED - that is
//     where "EALLOW blocks the debugger" came from, and it was wrong: EALLOW does not
//     block the debugger, the value simply did not fit. Every write uses 32 bits;
//   * the level read BEFORE configuring the output is the pull-up, not the output latch;
//     once configured, the latch drives 0 until set. Predicting a toggle from the
//     pre-configuration read gives the wrong answer (a measured bug of the first version).
//
// REFUSAL ORDER IS PART OF THE DESIGN: if the MUX field is already non-zero the firmware
// is using the pin as a peripheral - the script REFUSES BEFORE THE FIRST WRITE, so a
// refused run leaves nothing modified (this ordering was a stack flow's, adopted by the union).
//
// Only pins in KNOWN_FREE_PINS may be driven (driving a wired pin fights the external
// signal - this is a motor control board); to add one, confirm on the schematic first.
// Known names are collected with for-in, NOT Object.keys: on one implementation's runtime
// Object.keys is undefined (measured), and a missing function inside the error path
// would turn a usage error into a confusing one.
//
// The script restores the reset defaults (direction to input, MUX field to 0) and
// verifies the restore - a run leaves no side effect behind. Verdict: every check
// (direction took, level reached, level held, restore held) is counted; any failure
// ends as one final FAIL.
var ORCH_MAIN = function (orch) {
    var USAGE = "Usage: pin_drive <ccxml_path> [--pin <name>] [--level high|low|toggle] [--hold <ms>]";

    // Per-pin register bits, given per pin rather than derived: the MUX registers change
    // stride (2 bits per pin from GPIO48 on), so a formula would be a guess. The mask is
    // this pin's single bit inside its port; SET/CLEAR/TOGGLE registers keep every other
    // pin of the port untouched (the firmware may be using them).
    var KNOWN_FREE_PINS = {
        "GPIO51": {
            muxAddr: 0x6F98, muxShift: 6,   // GPBMUX2: bits 6-7 for GPIO51
            dirAddr: 0x6F9A, mask: 0x80000, // GPBDIR bit19 (GPIO51 - 32 = 19)
            datAddr: 0x6FC8,
            setAddr: 0x6FCA, clearAddr: 0x6FCC, toggleAddr: 0x6FCE
        }
    };
    var DEFAULT_PIN = "GPIO51";
    var LEVELS = ["high", "low", "toggle"];

    function readReg(address) {
        return orch.readMem(address, 32, 1)[0];
    }
    function writeReg(address, value) {
        // 32 bits is these registers' real width; a narrower write is truncated silently.
        orch.writeMem(address, value, 32);
    }
    // Read-modify-write of the one bit this pin owns. readMem already returns an unsigned
    // 32-bit value, and `>>> 0` pulls the result back to unsigned: `~mask` makes bit31 set
    // once, and writing a negative number into a 32-bit register is a path nobody has
    // measured - cheaper not to produce it than to find out.
    function modifyReg(address, mask, set) {
        var current = readReg(address);
        writeReg(address, (set ? (current | mask) : (current & ~mask)) >>> 0);
        return readReg(address);
    }

    var args = orch.parseArgs({
        usage: USAGE,
        flags: {
            "--pin": { takesValue: true },
            "--level": { takesValue: true },
            "--hold": { takesValue: true, parse: orch.parseInteger }
        },
        confFill: ["CCXML"], maxPositional: 1
    });
    var ccxmlPath = orch.requireAbsoluteFile(orch.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml_path");
    var pinName = args.flags["--pin"] || DEFAULT_PIN;
    var pin = KNOWN_FREE_PINS[pinName];
    if (!pin) {
        var knownNames = [];
        var name;
        for (name in KNOWN_FREE_PINS) {
            if (KNOWN_FREE_PINS.hasOwnProperty(name)) knownNames.push(name);
        }
        orch.usageError("pin " + pinName + " is not known to be free on this board; only "
            + knownNames.join(", ") + " may be driven by this script - driving a pin"
            + " that is wired to something else fights the external signal", USAGE);
    }
    var level = args.flags["--level"] || "high";
    if (LEVELS.indexOf(level) < 0) {
        orch.usageError("--level must be one of " + LEVELS.join("|") + ", got: " + level, USAGE);
    }
    var holdMs = args.flags["--hold"] || 0;

    var failures = 0;
    try {
        orch.openTarget(ccxmlPath);

        var maskHex = orch.hex(pin.mask);
        var beforeMux = readReg(pin.muxAddr);
        var beforeDir = readReg(pin.dirAddr);
        var beforeDat = readReg(pin.datAddr);
        orch.printLog("Before: " + pinName + " = " + maskHex
            + "  GPBMUX2=" + orch.hex(beforeMux) + " (bits " + pin.muxShift + "-" + (pin.muxShift + 1) + " = "
            + ((beforeMux >>> pin.muxShift) & 0x3) + ")"
            + "  GPBDIR=" + orch.hex(beforeDir) + " (bit = " + ((beforeDir & pin.mask) ? 1 : 0) + ")"
            + "  GPBDAT=" + orch.hex(beforeDat) + " (bit = " + ((beforeDat & pin.mask) ? 1 : 0) + ")");

        // 1) Refuse BEFORE the first write when the firmware owns the pin as a peripheral.
        var muxBeforeField = (beforeMux >>> pin.muxShift) & 0x3;
        if (muxBeforeField) {
            orch.finishFail("refusing to drive " + pinName + ": its MUX field is " + muxBeforeField
                + ", i.e. the firmware is using it as a peripheral pin, not as GPIO;"
                + " nothing was written");
        }
        var muxAfter = modifyReg(pin.muxAddr, 0x3 << pin.muxShift, false);
        if ((muxAfter >>> pin.muxShift) & 0x3) {
            failures++;
            orch.printLog("Error: the MUX field did not clear: bits " + pin.muxShift + "-"
                + (pin.muxShift + 1) + " still read " + ((muxAfter >>> pin.muxShift) & 0x3)
                + " in GPBMUX2 (read back " + orch.hex(muxAfter) + ").");
        }
        var dirAfter = modifyReg(pin.dirAddr, pin.mask, true);
        if (!(dirAfter & pin.mask)) {
            failures++;
            orch.printLog("Error: direction did not take: " + maskHex
                + " is not set in GPBDIR (read back " + orch.hex(dirAfter) + ").");
        }

        // Re-read the level AFTER configuring the output: only now is this the latch.
        var levelBefore = (readReg(pin.datAddr) & pin.mask) ? 1 : 0;
        orch.printLog("Configured: GPBMUX2=" + orch.hex(muxAfter) + " (GPIO function), GPBDIR="
            + orch.hex(dirAfter) + " (output), level now = " + levelBefore);

        // 2) Set / clear / toggle through the dedicated registers, never raw DAT.
        var target;
        if (level === "toggle") {
            target = levelBefore ? 0 : 1;
            writeReg(pin.toggleAddr, pin.mask);
            orch.printLog("Wrote " + maskHex + " to GPBTOGGLE (was " + levelBefore + ", expect " + target + ").");
        } else if (level === "high") {
            target = 1;
            writeReg(pin.setAddr, pin.mask);
            orch.printLog("Wrote " + maskHex + " to GPBSET.");
        } else {
            target = 0;
            writeReg(pin.clearAddr, pin.mask);
            orch.printLog("Wrote " + maskHex + " to GPBCLEAR.");
        }

        // 3) "The write went out" is not the same as "the pin is at that level".
        var readback = (readReg(pin.datAddr) & pin.mask) ? 1 : 0;
        orch.printLog("Level read back: GPBDAT bit = " + readback + " (asked for " + target + ")");
        if (readback !== target) {
            failures++;
            orch.printLog("Error: the pin did not reach the requested level - something else is driving it"
                + " (external circuit, or another peripheral on this pin).");
        }

        // 4) Optionally hold and read again: separates "correct when read" from "stayed".
        if (holdMs > 0) {
            orch.sleepMs(holdMs);
            var held = (readReg(pin.datAddr) & pin.mask) ? 1 : 0;
            orch.printLog("After holding " + holdMs + " ms: GPBDAT bit = " + held);
            if (held !== target) {
                failures++;
                orch.printLog("Error: the level did not hold for " + holdMs + " ms.");
            }
        }

        // 5) Restore the reset defaults and check: no side effect left behind.
        var dirRestored = modifyReg(pin.dirAddr, pin.mask, false);
        var muxRestored = modifyReg(pin.muxAddr, 0x3 << pin.muxShift, false);
        var datRestored = readReg(pin.datAddr);
        orch.printLog("Restored: GPBMUX2=" + orch.hex(muxRestored) + "  GPBDIR=" + orch.hex(dirRestored)
            + " (bit = " + ((dirRestored & pin.mask) ? 1 : 0) + ", back to input)"
            + "  GPBDAT=" + orch.hex(datRestored) + " (bit = " + ((datRestored & pin.mask) ? 1 : 0) + ")");
        if (dirRestored & pin.mask) {
            failures++;
            orch.printLog("Error: restore failed: the GPBDIR bit for " + pinName + " is still set to output.");
        }
    } catch (err) {
        orch.finishFail("Pin drive failed: " + err);
    }

    if (failures > 0) orch.finishFail(failures + " check(s) failed");
    orch.finishOk();
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = ORCH_MAIN;
}
