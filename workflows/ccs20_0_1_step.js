// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/step.js header.
// Usage: run.bat ccs20_0_1_step.js <ccxml_path> <out_file_path> <count>
//   [--from <location>] [--kind into|over|out|asm] [--timeout <ms>]
var ORCH_MAIN = require("../orchestration/step.js");
ORCH_MAIN(require("../session/orch_driver.js"));
