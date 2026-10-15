// Entry point only: wiring for the shared orchestration main.
// Contract: the name table exported by session/orch_driver.js; behavior: orchestration/watch_write.js header.
// Usage: run.bat ccs20_0_1_watch_write.js <ccxml_path> <out_file_path> <address>
//   [--read] [--skip <n>] [--timeout <ms>]
var ORCH_MAIN = require("../orchestration/watch_write.js");
ORCH_MAIN(require("../session/orch_driver.js"));
