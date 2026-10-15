// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/load_run.js header.
// Usage: run.bat ccs20_0_1_load_run.js <ccxml_path> <out_file_path>
var ORCH_MAIN = require("../orchestration/load_run.js");
ORCH_MAIN(require("../session/orch_driver.js"));
