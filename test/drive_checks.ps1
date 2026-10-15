# drive_checks.ps1 -- run every launcher cell and report one table.
#
# WHAT THIS IS FOR: the non-interactive path of the 18 .vbs launchers is the part
# of this repository that no human clicks and no .js test can reach. This driver
# makes it testable without a debugger, a target or hardware:
#
#   1. it mirrors the repository into %TEMP% and drops in a STUB dss.bat, so every
#      launcher gets past its guards and actually reaches its Prompts;
#   2. it runs each launcher's cells (see checks.ps1) under CCS12_2_0_NONINTERACTIVE=1;
#   3. it knows each launcher's class, because that classification is the rule the
#      cells check: a launcher that CHANGES target state must refuse to fall back to
#      a built-in default, a launcher that only READS may use it.
#
# The class table below is the single source of truth for the classification. It
# must agree with the header line and the DeclareLauncherReadOnly call in each
# launcher; ${Class} is asserted in both directions, so a launcher that silently
# changes sides fails the static cell.
#
# Run it under BOTH hosts -- powershell (5.1) and pwsh (7) -- and compare the
# tables: a device that only works in one host is a defect.
#
#   pwsh      -NoProfile -File test\drive_checks.ps1
#   powershell -NoProfile -File test\drive_checks.ps1
#   pwsh      -NoProfile -File test\drive_checks.ps1 -SelfCheck   # prove it can fail

param(
    [switch]$SelfCheck,
    [string]$Mirror = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$checks = Join-Path $root 'test\checks.ps1'
$probe = Join-Path $root 'test\policy_probe.vbs'
$hostExe = (Get-Process -Id $PID).Path

# class -> 'read-only' | 'changes-target'; value -> positional args AFTER ccxml,
# ';'-joined ('_NONE_' = none), used by the explicit cell. <MIRROR> is substituted
# with the mirror path so the file arguments exist and are absolute.
$launchers = [ordered]@{
    'atomic\target\ccs12_2_0_check_connection.vbs' = @{ Class = 'read-only'; Args = '_NONE_' }
    'atomic\target\ccs12_2_0_run_for_ms.vbs'     = @{ Class = 'changes-target'; Args = '100' }
    'atomic\target\ccs12_2_0_target_halt.vbs'    = @{ Class = 'changes-target'; Args = '_NONE_' }
    'atomic\target\ccs12_2_0_target_reset.vbs'   = @{ Class = 'changes-target'; Args = '_NONE_' }
    'atomic\target\ccs12_2_0_target_run.vbs'     = @{ Class = 'changes-target'; Args = '_NONE_' }
    'atomic\target\ccs12_2_0_target_state.vbs'   = @{ Class = 'read-only'; Args = '_NONE_' }
    'atomic\program\ccs12_2_0_flash_op.vbs'         = @{ Class = 'changes-target'; Args = '_NONE_' }
    'atomic\program\ccs12_2_0_load_program.vbs'     = @{ Class = 'changes-target'; Args = '<MIRROR>\dummy.out' }
    'atomic\program\ccs12_2_0_verify_program.vbs'   = @{ Class = 'changes-target'; Args = '<MIRROR>\dummy.out' }
    'atomic\expression\ccs12_2_0_eval_expr.vbs'          = @{ Class = 'changes-target'; Args = '1+1' }
    'atomic\memory\ccs12_2_0_mem_export.vbs'         = @{ Class = 'read-only'; Args = '0xC000;4;<MIRROR>\export.txt' }
    'atomic\memory\ccs12_2_0_mem_fill.vbs'           = @{ Class = 'changes-target'; Args = '0xC000;4;0x1234;16' }
    'atomic\memory\ccs12_2_0_mem_import.vbs'         = @{ Class = 'changes-target'; Args = '0xC000;4;<MIRROR>\dummy_src.txt' }
    'atomic\memory\ccs12_2_0_mem_read.vbs'           = @{ Class = 'read-only'; Args = '0xC000;16;4' }
    'atomic\memory\ccs12_2_0_mem_write.vbs'          = @{ Class = 'changes-target'; Args = '0x8000;0x1234' }
    'atomic\register\ccs12_2_0_read_reg.vbs'           = @{ Class = 'read-only'; Args = 'AL' }
    'atomic\expression\ccs12_2_0_write_expr.vbs'         = @{ Class = 'changes-target'; Args = 'AL=1' }
    'atomic\register\ccs12_2_0_write_reg.vbs'          = @{ Class = 'changes-target'; Args = 'AL;0x1234' }
}

function New-Mirror {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
    New-Item -ItemType Directory -Path $Path | Out-Null
    robocopy $root $Path /E /XD .git /NFL /NDL /NJH /NJS /NP | Out-Null
    $bin = Join-Path $Path 'ccs\ccs_base\scripting\bin'
    New-Item -ItemType Directory -Path $bin -Force | Out-Null
    # The stub stands in for dss.bat: the launcher gets past its guards, reaches its
    # Prompts, then "runs DSS" and sees the marker line that means success. Nothing
    # here opens a debugger session or touches a target.
    #
    # It also writes the command line it was handed next to itself. A launcher does
    # not echo DSS output on success, so this file is the only positive evidence that
    # the stub was reached -- and it is what lets a cell assert that the values the
    # launcher resolved really arrived on the command line.
    $stub = @(
        '@echo off',
        'echo STUB-DSS-RAN',
        'echo CCS12_2_0_RESULT=OK',
        'echo %* > "%~dp0stub-args.txt"',
        'exit /b 0'
    ) -join "`r`n"
    [System.IO.File]::WriteAllText((Join-Path $bin 'dss.bat'), $stub + "`r`n", [System.Text.Encoding]::ASCII)
    foreach ($f in @('dummy.ccxml', 'dummy.out', 'dummy_src.txt', 'export.txt')) {
        [System.IO.File]::WriteAllText((Join-Path $Path $f), "stub fixture`r`n", [System.Text.Encoding]::ASCII)
    }
}

function Invoke-Cell {
    param([string[]]$CellArgs)
    $out = & $hostExe -NoProfile -ExecutionPolicy Bypass -File $checks @CellArgs 2>&1
    return @($out | ForEach-Object { $_.ToString() })
}

if ($Mirror -eq '') { $Mirror = Join-Path $env:TEMP 'ccs12_2_0_probe' }

# ---------------------------------------------------------------- self-check --
if ($SelfCheck) {
    Write-Output 'SELF-CHECK: each device must be able to report FAIL'
    $ctl = Join-Path $env:TEMP 'ccs12_2_0_selfcheck'
    $bad = 0

    # (1) the policy probe, against a library whose default class is flipped
    New-Mirror -Path $ctl
    $cfg = Join-Path $ctl 'session\config.vbs'
    $t = [System.IO.File]::ReadAllText($cfg)
    $t2 = $t.Replace('launcherChangesTarget = True', 'launcherChangesTarget = False')
    if ($t -eq $t2) { Write-Output 'SELF-CHECK FAIL control-1 mutation did not apply'; $bad++ }
    else {
        [System.IO.File]::WriteAllText($cfg, $t2, [System.Text.Encoding]::ASCII)
        $o = & cscript //Nologo (Join-Path $ctl 'test\policy_probe.vbs') 2>&1
        if ($LASTEXITCODE -ne 0) { Write-Output ("SELF-CHECK OK  policy probe fails on a flipped default (exit={0})" -f $LASTEXITCODE) }
        else { Write-Output 'SELF-CHECK FAIL policy probe passed on a flipped default'; $bad++ }
    }

    # (2) the allow cell, against a read-only launcher whose declaration is stripped
    New-Mirror -Path $ctl
    $p = Join-Path $ctl 'atomic\memory\ccs12_2_0_mem_read.vbs'
    $t = [System.IO.File]::ReadAllText($p)
    $t2 = $t.Replace("DeclareLauncherReadOnly`r`n", '')
    if ($t -eq $t2) { Write-Output 'SELF-CHECK FAIL control-2 mutation did not apply'; $bad++ }
    else {
        [System.IO.File]::WriteAllText($p, $t2, [System.Text.Encoding]::ASCII)
        $line = (Invoke-Cell @('-Mode', 'run', '-Rel', 'atomic\memory\ccs12_2_0_mem_read.vbs', '-Class', 'read-only', '-Case', 'allow', '-Mirror', $ctl) | Where-Object { $_ -match '^RUN ' })
        if ($line -match '^RUN FAIL') { Write-Output ("SELF-CHECK OK  allow cell fails without the declaration -- {0}" -f $line) }
        else { Write-Output ("SELF-CHECK FAIL allow cell passed without the declaration -- {0}" -f $line); $bad++ }
    }

    # (3) the refuse cell, against a changes-target launcher given the declaration
    New-Mirror -Path $ctl
    $p = Join-Path $ctl 'atomic\target\ccs12_2_0_target_halt.vbs'
    $t = [System.IO.File]::ReadAllText($p)
    $anchor = 'Set config = LoadProjectConfig(fso, repoRoot)' + "`r`n"
    if (-not $t.Contains($anchor)) { Write-Output 'SELF-CHECK FAIL control-3 anchor missing'; $bad++ }
    else {
        [System.IO.File]::WriteAllText($p, $t.Replace($anchor, $anchor + "DeclareLauncherReadOnly`r`n"), [System.Text.Encoding]::ASCII)
        $line = (Invoke-Cell @('-Mode', 'run', '-Rel', 'atomic\target\ccs12_2_0_target_halt.vbs', '-Class', 'changes-target', '-Case', 'refuse', '-Mirror', $ctl) | Where-Object { $_ -match '^RUN ' })
        if ($line -match '^RUN FAIL') { Write-Output ("SELF-CHECK OK  refuse cell fails once the launcher opts out -- {0}" -f $line) }
        else { Write-Output ("SELF-CHECK FAIL refuse cell passed once the launcher opted out -- {0}" -f $line); $bad++ }
    }

    if (Test-Path -LiteralPath $ctl) { Remove-Item -LiteralPath $ctl -Recurse -Force }
    Write-Output ''
    Write-Output ("SELF-CHECK TOTAL controls=3 failed={0}" -f $bad)
    exit $(if ($bad -eq 0) { 0 } else { 1 })
}

# ---------------------------------------------------------------------- main --
New-Mirror -Path $Mirror
Write-Output ("mirror {0} (repository copy + stub dss.bat; no target, no debugger)" -f $Mirror)

# The policy itself, as a unit: label / extra lines / refusal / default class.
$probeOut = & cscript //Nologo $probe 2>&1
$probeExit = $LASTEXITCODE
foreach ($l in @($probeOut)) { Write-Output $l.ToString() }
$failProbe = if ($probeExit -eq 0) { 0 } else { 1 }
Write-Output ''

$failStatic = 0
$failRun = 0
foreach ($rel in $launchers.Keys) {
    $cls = $launchers[$rel].Class
    $explicit = $launchers[$rel].Args.Replace('<MIRROR>', $Mirror)

    $s = Invoke-Cell @('-Mode', 'static', '-Rel', $rel, '-Class', $cls)
    $sLine = ($s | Where-Object { $_ -match '^STATIC' })
    if (-not $sLine) { $sLine = "STATIC FAIL $rel harness-no-output" }
    Write-Output $sLine
    if ($sLine -match '^STATIC FAIL') { $failStatic++ }

    $cases = if ($cls -eq 'read-only') { @('allow', 'explicit') } else { @('refuse', 'explicit') }
    foreach ($case in $cases) {
        $r = Invoke-Cell @('-Mode', 'run', '-Rel', $rel, '-Class', $cls, '-Case', $case, '-Args', $explicit, '-Mirror', $Mirror)
        $rLine = ($r | Where-Object { $_ -match '^RUN ' })
        if (-not $rLine) { $rLine = "RUN FAIL $rel case=$case harness-no-output" }
        $first = ($r | Where-Object { $_ -match 'first=' })
        Write-Output ("{0}{1}" -f $rLine, $(if ($first) { '  ' + $first.Trim() } else { '' }))
        if ($rLine -match '^RUN FAIL') { $failRun++ }
    }
}

Write-Output ''
Write-Output ("TOTAL launchers={0} probeFail={1} staticFail={2} runFail={3}" -f $launchers.Count, $failProbe, $failStatic, $failRun)
exit $(if (($failProbe + $failStatic + $failRun) -eq 0) { 0 } else { 1 })
