// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/pin_drive.js header -
// the GPIO51 facts, the refuse-before-write ordering, and the KNOWN_FREE_PINS table live
// there.
// Usage: run.bat ccs20_0_1_pin_drive.js <ccxml_path> [--pin <name>] [--level high|low|toggle]
//   [--hold <ms>]
var ORCH_MAIN = require("../orchestration/pin_drive.js");
ORCH_MAIN(require("../session/orch_driver.js"));
