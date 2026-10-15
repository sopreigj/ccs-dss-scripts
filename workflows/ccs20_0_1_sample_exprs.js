// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/sample_exprs.js header
// - especially the measured-timestamp rule and sampling semantics.
// Usage: run.bat ccs20_0_1_sample_exprs.js <ccxml_path> <out_file_path> <interval_ms> <count>
//   <csv_file> <expr1> [expr2 ...]  (or set env CCS_EVAL_EXPR)
var ORCH_MAIN = require("../orchestration/sample_exprs.js");
ORCH_MAIN(require("../session/orch_driver.js"));
