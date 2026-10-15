<#
    verify_launchers.ps1 -- drives the .vbs launcher dialogs automatically.

    WHY: a launcher's dialog path is the one path a human has to click through, and
    that made it the least verified part of the repository. A probe that passes too
    few positional arguments parks on an InputBox and hangs instead of failing --
    that happened twice while these launchers were being added. This script answers
    the dialogs itself, then asserts what the launcher built from those answers.

    WHAT IT PROVES: not merely "the launcher exited", but "the text typed into
    dialog N appeared in the command line the launcher echoed". That is the actual
    contract of the dialog path, and the previous hand-run probes could not check it.

    HOW THE DIALOG IS DRIVEN: the launcher runs with its positional arguments
    omitted and ccxml pointed at a path that does not exist, so every parameter has
    to come from a dialog and the launcher fails fast at its own existence check --
    no dss.bat, no session, no hardware. Each InputBox is answered with
    TAB -> HOME -> SHIFT+END -> the answer -> ENTER. SendKeys needs a message loop,
    which a console host does not provide, so a hidden WinForms form supplies one.

    MEASURED STATUS -- READ THIS BEFORE TRUSTING A RESULT: the script
    parses clean and its logic was reviewed, but it has NEVER completed a run in this
    repository's development environment. Driving the dialogs failed on all 7 cases:
    3 could not be answered before the launcher had to be killed (the echoed command
    line came back empty, or holding the launcher's built-in default -- i.e. the
    keystrokes never arrived) and 4 raised "SendWait: Access is denied" from
    SendKeys. So SendKeys/AppActivate is NOT a usable verification device here, and
    this script must not be treated as the acceptance gate for the dialog path -- it
    manufactures false negatives. The durable fix is launcher-side: make
    CCS12_2_0_NONINTERACTIVE=1 take the resolved default instead of opening an InputBox,
    so the whole chain is testable with no UI at all (see test/README.md and
    the non-interactive path). The dialog path itself was last verified by hand, with a human
    clicking.

    WHY HOME+SHIFT+END RATHER THAN Ctrl+A: the answer has to REPLACE the pre-filled
    default. Ctrl+A is not a documented accelerator of the single-line Win32 edit
    control that a VBScript InputBox uses, while HOME followed by SHIFT+END selects
    the text without depending on one. This is a defensive choice, NOT a measured
    difference: because no case ever delivered its keystrokes (see above), the
    Ctrl+A behaviour was never observed here. Either way the assertion below judges
    the ECHOED COMMAND LINE, not the exit code, so a default that silently survives
    is caught rather than counted as a pass.

    AMBIGUITY, STATED: once a window is activated the keystrokes go to whatever is
    active. With nothing else stealing focus the target is certain; this is a test
    harness, not a production path.

    Keep this file ASCII-only, like every other script in this repository.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

# SendKeys requires a message loop; a hidden form supplies it for this process.
$form = New-Object System.Windows.Forms.Form
$form.ShowInTaskbar = $false
$form.WindowState = 'Minimized'
$null = $form.Handle

# This file lives in test\, so the repository root is one level up: the case names
# below are repository-relative and the launchers resolve their own ../lib and ../ccs12_2_0.conf.
$Root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { throw 'cannot locate the repository: run this file from test\, do not paste its body' }
$Temp = [System.IO.Path]::GetTempPath()

function Send-DialogAnswer {
    param([System.Diagnostics.Process]$Proc, [string]$Text)

    $activated = $false
    for ($try = 1; $try -le 8; $try++) {
        if ($Proc.HasExited) { return 'EXITED' }
        $Proc.Refresh()
        try {
            # Attach by PID: the dialog's caption is not reliably visible to
            # Shell.Application, while the PID is unambiguous (measured).
            $activated = (New-Object -ComObject WScript.Shell).AppActivate($Proc.Id)
        } catch { $activated = $false }
        if ($activated) { break }
        Start-Sleep -Milliseconds 700
    }
    if (-not $activated) { return 'NOATTACH' }

    Start-Sleep -Milliseconds 250
    # Tab first: the OK button holds focus when an InputBox opens.
    [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
    Start-Sleep -Milliseconds 120
    # HOME then SHIFT+END, not ^a, to replace the pre-filled default: see the
    # header note -- the choice is defensive, the difference was never measured here.
    [System.Windows.Forms.SendKeys]::SendWait('{HOME}')
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait('+{END}')
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Start-Sleep -Milliseconds 120
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 400
    return 'ANSWERED'
}

function Invoke-LauncherDialog {
    param([string]$Launcher, [string[]]$Answers)

    # Both streams are drained asynchronously from the moment the child starts.
    # Reading a pipe only after the child exits can deadlock (the child blocks
    # writing while nobody drains it), and reading it after the fact in the
    # EXITED_EARLY branch returned an empty stream, which silently turned
    # "the launcher died early" into "no output at all".
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cscript.exe'
    $psi.Arguments = '//Nologo "' + $Launcher + '"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = $Root

    $proc = [System.Diagnostics.Process]::Start($psi)
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()
    Start-Sleep -Milliseconds 1200

    foreach ($answer in $Answers) {
        if ($proc.HasExited) {
            $null = $proc.WaitForExit(5000)
            return @{ Status = 'EXITED_EARLY'; ExitCode = $proc.ExitCode; Output = ($outTask.Result + $errTask.Result) }
        }
        $send = Send-DialogAnswer -Proc $proc -Text $answer
        if ($send -ne 'ANSWERED') {
            try { $proc.Kill() } catch { }
            return @{ Status = $send; ExitCode = -1; Output = ($outTask.Result + $errTask.Result) }
        }
    }

    if (-not $proc.WaitForExit(20000)) {
        try { $proc.Kill() } catch { }
        return @{ Status = 'TIMEOUT'; ExitCode = -1; Output = ($outTask.Result + $errTask.Result) }
    }
    return @{ Status = 'DONE'; ExitCode = $proc.ExitCode; Output = ($outTask.Result + $errTask.Result) }
}

# launcher, the answers typed into each dialog, and the strings those answers must
# have produced in the echoed command line.
# NOTE: this file lives in test\; $Root is therefore the REPOSITORY root, one level up.
$probe = Join-Path $Temp 'ccs12_2_0_verify_probe.ccxml'
$outf  = Join-Path $Temp 'ccs12_2_0_verify.out'
$dump  = Join-Path $Temp 'ccs12_2_0_verify_dump.txt'

$cases = @(
    @{ Name = 'atomic\target\ccs12_2_0_target_state.vbs';   Answers = @($probe);                                   Expect = @($probe) }
    @{ Name = 'atomic\program\ccs12_2_0_verify_program.vbs';   Answers = @($probe, $outf);                            Expect = @($probe, $outf) }
    @{ Name = 'atomic\program\ccs12_2_0_flash_op.vbs';         Answers = @($probe);                                   Expect = @($probe) }
    @{ Name = 'atomic\register\ccs12_2_0_write_reg.vbs';          Answers = @($probe, 'AL', '0xAA55');                   Expect = @($probe, 'AL', '0xAA55') }
    @{ Name = 'atomic\memory\ccs12_2_0_mem_fill.vbs';           Answers = @($probe, '0x8000', '8', '0x1234', '16');    Expect = @($probe, '0x8000', '8', '0x1234', '16') }
    @{ Name = 'atomic\memory\ccs12_2_0_mem_export.vbs';         Answers = @($probe, '0xC000', '64', $dump);            Expect = @($probe, '0xC000', '64', $dump) }
    @{ Name = 'atomic\memory\ccs12_2_0_mem_import.vbs';         Answers = @($probe, '0xD000', '64', $dump);            Expect = @($probe, '0xD000', '64', $dump) }
)

$rows = @()
foreach ($case in $cases) {
    $launcher = Join-Path $Root $case.Name
    Write-Host ""
    Write-Host ("=== " + $case.Name + "   (" + $case.Answers.Count + " dialog(s))")

    if (-not (Test-Path -LiteralPath $launcher)) {
        Write-Host "    RESULT=FAIL (launcher not found)"
        $rows += [pscustomobject]@{ File = $case.Name; Dialogs = $case.Answers.Count; Status = 'MISSING'; Exit = ''; Verified = 'NO'; Detail = 'launcher not found' }
        continue
    }

    # $ErrorActionPreference is Stop, so an unexpected .NET error would otherwise
    # end the whole run and leave no row for this launcher -- the failure mode that
    # made an earlier version of this script stop after three cases with no verdict.
    try {
        $result = Invoke-LauncherDialog -Launcher $launcher -Answers $case.Answers
    } catch {
        Write-Host ("    RESULT=FAIL (harness error: " + $_.Exception.Message + ")")
        $rows += [pscustomobject]@{ File = $case.Name; Dialogs = $case.Answers.Count; Status = 'HARNESS_ERROR'; Exit = ''; Verified = 'NO'; Detail = $_.Exception.Message }
        continue
    }
    $line = ($result.Output -split "`r?`n" | Where-Object { $_ -like 'Executing:*' } | Select-Object -First 1)
    if (-not $line) { $line = '' }

    $missing = @($case.Expect | Where-Object { $line -notlike ('*' + $_ + '*') })
    $verified = ($missing.Count -eq 0) -and ($line -ne '')

    if ($result.Status -ne 'DONE') {
        $verdict = 'FAIL'; $detail = $result.Status
    } elseif ($result.ExitCode -ne 1) {
        $verdict = 'FAIL'; $detail = "exit $($result.ExitCode), expected 1"
    } elseif (-not $verified) {
        $verdict = 'FAIL'; $detail = 'echoed command missing: ' + ($missing -join ', ')
    } else {
        $verdict = 'OK'; $detail = 'all answers reached the command line'
    }

    Write-Host ("    command line: " + $line)
    Write-Host ("    RESULT=" + $verdict + "  (" + $detail + ")")

    $rows += [pscustomobject]@{
        File     = $case.Name
        Dialogs  = $case.Answers.Count
        Status   = $result.Status
        Exit     = $result.ExitCode
        Verified = if ($verified) { 'YES' } else { 'NO' }
        Detail   = $detail
    }
}

Write-Host ""
Write-Host "==================== SUMMARY ===================="
$rows | Format-Table -AutoSize -Wrap

$failed = @($rows | Where-Object { $_.Verified -ne 'YES' -or $_.Exit -ne 1 })
if ($failed.Count -eq 0) {
    Write-Host ("VERIFY_RESULT=OK (" + $rows.Count + "/" + $rows.Count + " launchers drove their dialogs and the answers reached the command line)")
    $form.Dispose()
    exit 0
}
Write-Host ("VERIFY_RESULT=FAIL (" + $failed.Count + " launcher(s) did not pass)")
$form.Dispose()
exit 1
