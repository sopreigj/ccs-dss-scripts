// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/run_to_bp.js header.
// Usage: run.bat ccs20_0_1_run_to_bp.js <ccxml_path> <out_file_path> <location>
//   [--symbols-only] [--timeout <ms>]
var ORCH_MAIN = require("../orchestration/run_to_bp.js");
ORCH_MAIN(require("../session/orch_driver.js"));
