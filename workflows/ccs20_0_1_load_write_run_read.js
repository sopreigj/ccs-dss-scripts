// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/load_write_run_read.js
// header - especially why --settle exists.
// Usage: run.bat ccs20_0_1_load_write_run_read.js <ccxml_path> <out_file_path> <run_ms>
//   [--settle <ms>] [--set "<assignment>"]... [--read "<expr>"]...
//   (or set env CCS_WRITE_EXPR / CCS_EVAL_EXPR)
var ORCH_MAIN = require("../orchestration/load_write_run_read.js");
ORCH_MAIN(require("../session/orch_driver.js"));
