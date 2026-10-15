// CCS 20.0.1 脚本：复位目标。
// Usage: run.bat ccs20_0_1_target_reset.js <ccxml_path> --list
//        run.bat ccs20_0_1_target_reset.js <ccxml_path> [--kind "<reset type name>"]
//
// 复位类型名**不能静态枚举**，只能在运行时用 getResets() 问（本机 F28335 实测只有
// "CPU Reset" 可用，"Reset Emulator" 存在但不可执行）。所以 --list 是这个脚本的一半用途。
// 不传 --kind 时用目标的默认复位；注意 CCS 的 reset() 失败不会抛错，所以下面回读 PC 作为证据。
//
// 实测（真板）：无参 reset() 之后 PC 仍在 **Boot ROM 0x3ff9ce**，并不是"程序入口"。
// CCS GUI 的 Restart（复位后停在 main）在这个 API 里没有对应调用（Target.d.ts 只有 reset()），
// 所以要"复位后停在 main"应当用 workflows/ccs20_0_1_run_to_bp.js。
// 所以这里只提供 reset()：不加一层改名的"restart"包装——无参 reset() 的落点是 Boot ROM，
// 名字响了落点也不会变；要"复位后停在 main"就显式用 workflows/ccs20_0_1_run_to_bp.js。

const cli = require("../../session/cli.js");
const ccs = require("../../session/session.js");

const USAGE = 'Usage: run.bat ccs20_0_1_target_reset.js <ccxml_path> --list\n'
    + '       run.bat ccs20_0_1_target_reset.js <ccxml_path> [--kind "<reset type name>"]';

const args = cli.parseArgs(process.argv.slice(3), {
    usage: USAGE,
    flags: {
        "--list": { takesValue: false },
        "--kind": { takesValue: true },
    },
    confFill: ["CCXML"], maxPositional: 1,
});
const ccxmlPath = cli.requireAbsoluteFile(cli.requiredArg(args.positional, 0, "ccxml_path", USAGE), "ccxml path");

try {
    console.log("Configuring target configuration: " + ccxmlPath);
    // 两种意图不能同时表达：静默偏向 --list 会让 --kind 的合法性校验被跳过。
    if (args.flags["--list"] && args.flags["--kind"]) {
        cli.usageError("--list and --kind are mutually exclusive", USAGE);
    }

    const session = ccs.openTarget(ccxmlPath);
    const resets = session.target.getResets();

    if (args.flags["--list"]) {
        console.log("Available reset types:");
        for (const name of Object.keys(resets)) {
            console.log("  " + name + (resets[name] ? "" : "  (not executable now)"));
        }
    } else {
        const kind = args.flags["--kind"] || null;
        if (kind && !Object.prototype.hasOwnProperty.call(resets, kind)) {
            cli.usageError("unknown reset type: " + kind + " (available: " + Object.keys(resets).join(", ") + ")", USAGE);
        }
        const pcBefore = ccs.readPC(session);
        console.log("Resetting target" + (kind ? " (" + kind + ")" : " (default)") + "...");
        if (kind) session.target.reset(kind);
        else session.target.reset();
        console.log("Reset issued. PC before: " + pcBefore + ", after: " + ccs.readPC(session));
    }
} catch (err) {
    console.error("Reset failed: " + err.message);
    ccs.shutdownQuietly();
    process.exit(cli.EXIT_FAIL);
}

ccs.finishQuietly();
process.exit(cli.EXIT_OK);
