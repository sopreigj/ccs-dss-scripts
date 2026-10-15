# A 项行为验证：每个脚本声明的 maxPositional 是否与它的用法串一致，且确实被强制。
# 全部发生在"参数层"，即开会话之前 —— 不碰硬件，可离线复跑。
#
# 期望值来自各脚本的 USAGE 串（人工写的规格），声明值来自源码，行为来自实跑：
#   三方一致才算通过 —— 只比对声明值等于期望值是循环论证，实跑才是独立证据。
#
#  %TEMP% 入库（原 ccs20_0_1_verify_maxpos.ps1）：
#   - Set-Location 改为按本文件位置推导；
#   - 修两处陈旧条目（已删掉的 target_restart 仍在表里、新增的 pin_drive 从没进过表
#     ——装置住在 %TEMP% 时没人复跑它）。改后应为 26 条、0 失败；
#   - 输出串全部改 ASCII：Windows PowerShell 5.1 把无 BOM 的 UTF-8 .ps1 当 ANSI 读，
#     中文标签会输出乱码（实测），而本设备要求在 5.1 与 pwsh 7 下判决与显示一致。
#
# 架构适配：8 个 workflow 已退化为纯接线入口（无 parseArgs
#   调用），maxPositional 的**声明**随之移入 orchestration/ 共享 main。
#   本装置相应改为：声明从 orchestration/<name>.js 读取，行为仍实跑 workflows/<name>.js 入口
#   ——参数层（cli.js 的 parseArgs）仍在 openTarget 之前，离线可复跑，口径不变。
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

# Path source is ccs20_0_1.conf only (test/README "unique source").
# $CCXML feeds just the informational mem_import probes at the bottom: when it is
# absent or nonexistent they are skipped, which never changes the pass/fail verdict.
$conf = @{}
if (Test-Path 'ccs20_0_1.conf') {
    Get-Content 'ccs20_0_1.conf' | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)=(.*)$') { $conf[$matches[1].Trim().ToLower()] = $matches[2].Trim() }
    }
}
$CCXML = $null
if ($conf.ContainsKey('ccxml')) { $CCXML = $conf['ccxml'] }
if ($CCXML -and -not (Test-Path $CCXML)) { $CCXML = $null }

# declaration source: workflow entries read their maxPositional from the shared orchestration main
$declSource = @{
    'workflows/ccs20_0_1_load_run.js'             = 'orchestration/load_run.js'
    'workflows/ccs20_0_1_load_run_read.js'        = 'orchestration/load_run_read.js'
    'workflows/ccs20_0_1_load_write_run_read.js'  = 'orchestration/load_write_run_read.js'
    'workflows/ccs20_0_1_run_to_bp.js'            = 'orchestration/run_to_bp.js'
    'workflows/ccs20_0_1_step.js'                 = 'orchestration/step.js'
    'workflows/ccs20_0_1_watch_write.js'          = 'orchestration/watch_write.js'
    'workflows/ccs20_0_1_sample_exprs.js'         = 'orchestration/sample_exprs.js'
    'workflows/ccs20_0_1_pin_drive.js'            = 'orchestration/pin_drive.js'
}

$expected = [ordered]@{
    'atomic/target/ccs20_0_1_check_connection.js' = 1
    'atomic/target/ccs20_0_1_target_state.js'     = 1
    'atomic/target/ccs20_0_1_target_run.js'       = 1
    'atomic/target/ccs20_0_1_target_halt.js'      = 1
    'atomic/target/ccs20_0_1_target_reset.js'     = 1
    'atomic/target/ccs20_0_1_run_for_ms.js'       = 2
    'atomic/program/ccs20_0_1_load_program.js'    = 2
    'atomic/program/ccs20_0_1_verify_program.js'  = 2
    'atomic/program/ccs20_0_1_flash_op.js'        = 1
    'atomic/memory/ccs20_0_1_mem_read.js'         = 4
    'atomic/memory/ccs20_0_1_mem_write.js'        = 4
    'atomic/memory/ccs20_0_1_mem_fill.js'         = 5
    'atomic/memory/ccs20_0_1_mem_export.js'       = 4
    'atomic/memory/ccs20_0_1_mem_import.js'       = 4
    'atomic/register/ccs20_0_1_write_reg.js'      = 3
    'atomic/register/ccs20_0_1_read_reg.js'       = $null   # variadic: register list
    'atomic/expression/ccs20_0_1_eval_expr.js'    = $null   # variadic: expression list
    'atomic/expression/ccs20_0_1_write_expr.js'   = 2
    'workflows/ccs20_0_1_load_run.js'             = 2
    'workflows/ccs20_0_1_load_run_read.js'        = $null   # variadic: expression list
    'workflows/ccs20_0_1_load_write_run_read.js'  = 3
    'workflows/ccs20_0_1_run_to_bp.js'            = 3
    'workflows/ccs20_0_1_step.js'                 = 3
    'workflows/ccs20_0_1_watch_write.js'          = 3
    'workflows/ccs20_0_1_sample_exprs.js'         = $null   # variadic: expression list
    'workflows/ccs20_0_1_pin_drive.js'            = 1
}

$pass = 0; $fail = 0
foreach ($rel in $expected.Keys) {
    $exp = $expected[$rel]
    $declFile = if ($declSource.ContainsKey($rel)) { $declSource[$rel] } else { $rel }
    $src = Get-Content $declFile -Raw
    $m = [regex]::Match($src, 'maxPositional:\s*(null|\d+)')
    if (-not $m.Success) { Write-Host "FAIL $rel : no maxPositional in source ($declFile)"; $fail++; continue }
    $declared = if ($m.Groups[1].Value -eq 'null') { $null } else { [int]$m.Groups[1].Value }
    $declOk = ($declared -eq $exp) -or (($null -eq $declared) -and ($null -eq $exp))

    if ($null -eq $exp) {
        # Two distinct tokens matter here (confFill,):
        #   * argv[2] is DROPPED by process.argv.slice(3) -- under run.bat the script path
        #     occupies that slot -- so 'X' is a throwaway placeholder, NOT a positional;
        #   * the first VISIBLE positional must be path-shaped, otherwise confFill prepends
        #     the conf CCXML and pollutes this pure maxPositional measurement (and the
        #     verdict would depend on whether this machine has a ccs20_0_1.conf -- the harness
        #     must judge the same on a fresh clone where the conf is gitignored).
        # 8 visible positionals must NOT be rejected.
        $tail = @(2..8 | ForEach-Object { "junk$_" })
        $o = (& node $rel 'X' 'C:\nope\x.ccxml' @tail 2>&1 | Out-String)
        $behOk = -not ($o -match 'too many arguments')
        $detail = if ($behOk) { 'variadic: 8 positionals accepted' } else { 'variadic script REJECTED too many' }
    } else {
        # visible positionals: 'C:\nope\x.ccxml' (lead, path-shaped so confFill stays out)
        # + junk2.. -- exactly $n visible for the exact case, $n+1 for the over-limit case.
        $n = [int]$exp
        $exactArgs = @('C:\nope\x.ccxml')
        if ($n -ge 2) { $exactArgs += @(2..$n | ForEach-Object { "junk$_" }) }
        $moreArgs = @('C:\nope\x.ccxml') + @(2..($n + 1) | ForEach-Object { "junk$_" })
        $oMore = (& node $rel 'X' @moreArgs 2>&1 | Out-String)
        $oExact = (& node $rel 'X' @exactArgs 2>&1 | Out-String)
        $rejectsMore = $oMore -match 'too many arguments'
        $acceptsExact = -not ($oExact -match 'too many arguments')
        $behOk = $rejectsMore -and $acceptsExact
        $detail = "exact $n accepted=" + $acceptsExact + " / " + ($n + 1) + " rejected=" + $rejectsMore
    }

    $ok = $declOk -and $behOk
    if ($ok) { $pass++ } else { $fail++ }
    $tag = if ($ok) { 'OK  ' } else { 'FAIL' }
    $declTxt = if ($null -eq $declared) { 'null' } else { "$declared" }
    $expTxt = if ($null -eq $exp) { 'null' } else { "$exp" }
    Write-Host ("{0} {1,-44} declared={2,-4} expected={3,-4} {4}" -f $tag, $rel, $declTxt, $expTxt, $detail)
}
Write-Host ""
Write-Host "maxPositional assertion: $pass pass / $fail fail"

Write-Host ""
Write-Host "=== library guard: a spec without maxPositional must throw ==="
$lib = & node -e "const c=require('./session/cli.js'); try { c.parseArgs([], {usage:'u', flags:{}}); console.log('NO-THROW-BAD'); } catch (e) { console.log('THREW: ' + e.message); }" 2>&1 | Out-String
Write-Host ("  " + $lib.Trim())

Write-Host ""
Write-Host "=== optionalArg must be gone from exports ==="
$hasOpt = Select-String -Path session\cli.js -Pattern 'optionalArg' -Quiet
Write-Host "  cli.js still mentions optionalArg: $hasOpt"

Write-Host ""
Write-Host "=== mem_import forms (they stop at the parameter layer, no session) ==="
if ($CCXML) {
    $t1 = & node atomic/memory/ccs20_0_1_mem_import.js $CCXML '0x1000' '4' 'C:\nope.hex' 2>&1 | Out-String
    Write-Host ("  text form (4 positionals)      -> " + ($t1 -split "`n" | Select-Object -First 1))
    $t2 = & node atomic/memory/ccs20_0_1_mem_import.js $CCXML '0x1000' 'C:\nope.bin' '--binary' 2>&1 | Out-String
    Write-Host ("  binary form (3 positionals)    -> " + ($t2 -split "`n" | Select-Object -First 1))
    $t3 = & node atomic/memory/ccs20_0_1_mem_import.js $CCXML '0x1000' '4' 'C:\nope.bin' '--binary' 2>&1 | Out-String
    Write-Host ("  binary WITH count (must refuse)-> " + ($t3 -split "`n" | Select-Object -First 1))
} else {
    Write-Host "  skipped: CCXML not configured in ccs20_0_1.conf (informational probes only)"
}

if ($fail -gt 0) { exit 1 } else { exit 0 }
