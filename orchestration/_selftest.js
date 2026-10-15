// orchestration/_selftest.js -- rules about the shared layer itself.
//
// WHY THIS FILE EXISTS: the eight mains in this directory are ONE source shared by two
// stacks. They were kept honest by a parity device that byte-compared the two copies, and
// that device cannot run in a checkout that contains only this repository. The rules below
// are the same rules, expressed so a single checkout can check them:
//
//   1. no .js here carries the entry-level bootstrap block (these files are loaded BY an
//      entry, through the driver; a bootstrap here would be a layering violation);
//   2. no file here names a stack, a launcher, a repository, or a route into a documentation
//      tree -- shared code that describes one implementation is wrong for the other.
//
// One source, called by both repositories' test harnesses, so the rule cannot drift between
// them. It asserts nothing about the board.
//
// It is covered by its own rule, so the words it forbids are assembled from character codes
// rather than written as literals here (a literal would make the rule trip on itself), and
// the wording above avoids them. This file also lives under the ES3 discipline that applies
// to everything in this directory: var/function only.
//
// The first four entries are generation stems, not whole names: they are matched as prefixes,
// so a checkout whose files carry a versioned prefix (a release tree) is covered by the same
// rule as the working tree.
//
// Usage: node orchestration/_selftest.js     (exit 0 = all rules pass)
var fs = require("fs");
var path = require("path");

function codesToString(codes) {
    var out = "";
    for (var i = 0; i < codes.length; i++) out += String.fromCharCode(codes[i]);
    return out;
}

// [repository/tool family stems, lower and upper] [launchers] [launcher extension]
// [routes into a documentation tree] [words that assume a second repository]
var FORBIDDEN = [
    codesToString([99, 99, 115, 49, 50]),
    codesToString([99, 99, 115, 50, 48]),
    codesToString([67, 67, 83, 49, 50]),
    codesToString([67, 67, 83, 50, 48]),
    codesToString([100, 115, 115, 46, 98, 97, 116]),
    codesToString([114, 117, 110, 46, 98, 97, 116]),
    codesToString([108, 97, 117, 110, 99, 104, 101, 114, 46, 109, 106, 115]),
    codesToString([46, 118, 98, 115]),
    codesToString([100, 111, 99, 115, 47]),
    codesToString([100, 111, 99, 115, 92]),
    codesToString([115, 105, 98, 108, 105, 110, 103]),
    codesToString([115, 105, 115, 116, 101, 114])
];

var BOOTSTRAP = /^\/\/ --- shared library bootstrap/;

function listMains(dir) {
    return fs.readdirSync(dir).filter(function (name) {
        return /\.js$/.test(name);
    }).sort();
}

function check(dir) {
    var problems = [];
    var names = listMains(dir);
    var i;
    if (names.length === 0) problems.push("no files found in " + dir);

    for (i = 0; i < names.length; i++) {
        var src = fs.readFileSync(path.join(dir, names[i]), "utf8");
        var lines = src.split(/\r?\n/);
        for (var j = 0; j < lines.length; j++) {
            if (BOOTSTRAP.test(lines[j])) {
                problems.push(names[i] + ":" + (j + 1)
                    + " carries the entry bootstrap block; shared mains are loaded BY an entry");
            }
            for (var k = 0; k < FORBIDDEN.length; k++) {
                if (lines[j].indexOf(FORBIDDEN[k]) >= 0) {
                    problems.push(names[i] + ":" + (j + 1) + " names " + FORBIDDEN[k]
                        + " -- " + lines[j].replace(/^\s+|\s+$/g, ""));
                }
            }
        }
    }
    return { files: names.length, problems: problems };
}
function main() {
    var res = check(__dirname);
    var i;
    console.log("orchestration shared layer: " + res.files + " file(s) checked");
    if (res.problems.length === 0) {
        console.log("SHARED LAYER OK");
        process.exit(0);
    }
    for (i = 0; i < res.problems.length; i++) console.log("SHARED LAYER FAIL: " + res.problems[i]);
    console.log("SHARED LAYER FAILED: " + res.problems.length + " problem(s)");
    process.exit(1);
}

main();
