# checks.ps1 -- one cell per invocation, no shared state.
#
# WHY ONE CELL AT A TIME: running all 18 launchers inside one PowerShell process
# kept reporting "no exit, no output" for launchers that a standalone cscript
# launch proved healthy in ~250 ms. One cell per process makes every verdict
# attributable to the launcher that produced it.
#
# MODES
#   static : the launcher's shape -- exactly one Prompt helper holding the file's
#            only InputBox, >=1 Prompt call, the class declaration and header line
#            its class requires, ASCII, CRLF.
#   run    : the launcher against a STUB dss.bat inside a mirror of the repository
#            (built by drive_checks.ps1), with CCS12_2_0_NONINTERACTIVE=1:
#              allow    (read-only launcher, no positional args)
#                       -> every dialog echoed, stub reached, exit 0
#              refuse   (changes-target launcher, no positional args)
#                       -> refusal text, NOTHING echoed, stub never reached, exit 1
#              explicit (any launcher, all positionals given)
#                       -> nothing echoed, no refusal, stub reached, exit 0
#            The mirror + stub is what makes this a real check: the previous
#            version pointed CCS12_2_0_ROOT at a directory with no dss.bat, so every
#            cell stopped at the dss.bat guard and NEVER reached a Prompt at all.
#
# A cell prints one STATIC/RUN line plus one "    first=[...]" line for diagnosis,
# and exits 0 (OK), 1 (FAIL) or 2 (harness could not run the cell). drive_checks.ps1
# owns the class and argument tables.

param(
    [Parameter(Mandatory = $true)][ValidateSet('static', 'run')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Rel,
    [ValidateSet('', 'read-only', 'changes-target')][string]$Class = '',
    [ValidateSet('', 'allow', 'refuse', 'explicit')][string]$Case = '',
    # Positional arguments AFTER ccxml, joined with ';', e.g. 'AL;0x1234'.
    # A string[] parameter cannot be used: PowerShell's -File mode flattens an
    # array into one scalar, so the driver shell cannot pass one. ';' is safe for
    # the values these launchers take; a value containing a quote is refused below
    # rather than silently mangled. '_NONE_' means "no extra arguments", because an
    # empty string cannot be passed through -File mode either.
    [string]$Args = '_NONE_',
    # Repository-shaped mirror holding a stub ccs\ccs_base\scripting\bin\dss.bat.
    [string]$Mirror = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($Mode -eq 'run') {
    if ($Mirror -eq '' -or -not (Test-Path -LiteralPath $Mirror)) {
        Write-Output ("RUN FAIL {0} reason=harness-needs-a-mirror" -f $Rel)
        exit 2
    }
    $path = Join-Path $Mirror $Rel
}
else {
    $path = Join-Path $root $Rel
}
$path = $path.Trim()

if (-not (Test-Path -LiteralPath $path)) { Write-Output "MISSING $Rel"; exit 2 }

$text = [System.IO.File]::ReadAllText($path)
$helperAt = $text.IndexOf('Function Prompt(message, title, defaultValue)')
$helperRegion = if ($helperAt -ge 0) { $text.Substring($helperAt) } else { '' }
$ibTotal = ([regex]::Matches($text, 'InputBox\(')).Count
$ibInHelper = ([regex]::Matches($helperRegion, 'InputBox\(')).Count
$promptCalls = ([regex]::Matches($text, '=\s*Prompt\(')).Count
$declaresReadOnly = ($text -match '(?m)^DeclareLauncherReadOnly[ \t]*\r?$')
$headerReadOnly = ($text -match 'only READS the')
$headerChangesTarget = ($text -match 'CHANGES target')
$loneLF = ([regex]::Matches($text, "(?<!\r)\n")).Count
$bom = ($text.Length -gt 0 -and [int]$text[0] -eq 0xFEFF)
$nonAscii = $false
foreach ($ch in $text.ToCharArray()) { if ([int]$ch -gt 127) { $nonAscii = $true; break } }

if ($Mode -eq 'static') {
    $bad = @()
    if ($Class -eq '') { $bad += 'no-class-given' }
    if ($helperAt -lt 0) { $bad += 'no-helper' }
    if ($ibInHelper -ne 1) { $bad += "helper-InputBox=$ibInHelper" }
    if (($ibTotal - $ibInHelper) -ne 0) { $bad += "InputBox-outside-helper=$($ibTotal - $ibInHelper)" }
    if ($promptCalls -lt 1) { $bad += 'no-Prompt-call' }
    if ($Class -eq 'read-only' -and -not $declaresReadOnly) { $bad += 'missing-DeclareLauncherReadOnly' }
    if ($Class -eq 'changes-target' -and $declaresReadOnly) { $bad += 'unexpected-DeclareLauncherReadOnly' }
    if ($Class -eq 'read-only' -and -not $headerReadOnly) { $bad += 'header-does-not-say-read-only' }
    if ($Class -eq 'changes-target' -and -not $headerChangesTarget) { $bad += 'header-does-not-say-changes-target' }
    if ($loneLF -ne 0) { $bad += "loneLF=$loneLF" }
    if ($bom) { $bad += 'BOM' }
    if ($nonAscii) { $bad += 'non-ASCII' }
    $verdict = if ($bad.Count -eq 0) { 'OK' } else { 'FAIL' }
    Write-Output ("STATIC {0} {1} class={2} calls={3} inHelper={4} {5}" -f $verdict, $Rel, $Class, $promptCalls, $ibInHelper, ($bad -join ','))
    exit $(if ($bad.Count -eq 0) { 0 } else { 1 })
}

# ---- run mode ----
if ($Case -eq '') { Write-Output ("RUN FAIL {0} reason=harness-needs-a-case" -f $Rel); exit 2 }

$Argv = @()
if ($Case -eq 'explicit') {
    $Argv += (Join-Path $Mirror 'dummy.ccxml')
    if ($Args.Trim() -ne '' -and $Args.Trim() -ne '_NONE_') {
        $Argv += @($Args.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    }
}

# The stub records the command line it was handed (see drive_checks.ps1), because a
# launcher does NOT echo DSS output on success -- it only shows "done, see console
# output". That file is the positive evidence that the stub ran at all, and it is
# also what proves the values really reached the command line instead of merely
# being printed. It must be removed before every run so a stale one cannot pass a
# cell.
$sentinel = Join-Path $Mirror 'ccs\ccs_base\scripting\bin\stub-args.txt'
if (Test-Path -LiteralPath $sentinel) { Remove-Item -LiteralPath $sentinel -Force }

# CCS12_2_0_ROOT points at the mirror, so dssBat resolves to the stub: the launcher gets
# past every guard and reaches its Prompts. CCS_CCXML names a file that exists, so a
# resolved ccxml default survives the launcher's own existence check.
$env:CCS12_2_0_NONINTERACTIVE = '1'
$env:CCS12_2_0_ROOT = $Mirror
$env:CCS_CCXML = (Join-Path $Mirror 'dummy.ccxml')

# Whitespace is load-bearing here. Building the command line as ('" ' + $path + ' "')
# produced a quoted argument with spaces INSIDE the quotes (" D:\...\x.vbs "), which
# cscript reported as "cannot find the file or directory" -- it read the value as a
# directory, so every launcher looked broken while only the harness was.
$parts = New-Object System.Collections.Generic.List[string]
$parts.Add('//Nologo')
$parts.Add(('"' + $path + '"'))
foreach ($a in $Argv) {
    if ($a.Contains('"')) {
        Write-Output ("RUN FAIL {0} reason=harness-cannot-quote-argument" -f $Rel)
        exit 2
    }
    $parts.Add(('"' + $a + '"'))
}
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cscript.exe'
$psi.Arguments = ($parts -join ' ')
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = $Mirror

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$proc = [System.Diagnostics.Process]::Start($psi)
$oTask = $proc.StandardOutput.ReadToEndAsync()
$eTask = $proc.StandardError.ReadToEndAsync()
$exited = $proc.WaitForExit(20000)
$out = ''
if ($exited) {
    $out = ($oTask.Result + $eTask.Result).Trim()
}
else {
    try { $proc.Kill() } catch { }
}
$sw.Stop()

$stubArgs = if (Test-Path -LiteralPath $sentinel) { [System.IO.File]::ReadAllText($sentinel) } else { '' }
$stubRan = ($stubArgs.Trim().Length -gt 0)
$refused = ($out -match 'will not fall back to a default')
$echoed = ([regex]::Matches($out, 'Non-interactive: ')).Count
$dialogLeaked = ($out -match '(?m)^Enter .*:$')
# Every value the launcher echoed as "using this default" must appear, quoted, in
# the command line the stub actually received.
$echoedValues = @([regex]::Matches($out, '(?m)^Non-interactive: .*? = (.*)$') | ForEach-Object { $_.Groups[1].Value.Trim() })
$valuesMissing = @($echoedValues | Where-Object { -not $stubArgs.Contains('"' + $_ + '"') })

$bad = @()
if (-not $exited) { $bad += 'NO-EXIT' }
if ($out -match 'compilation error') { $bad += 'COMPILE-ERROR' }
if ($dialogLeaked) { $bad += 'a-dialog-message-leaked-to-console' }
switch ($Case) {
    'allow' {
        if (-not $stubRan) { $bad += 'stub-not-reached' }
        if ($refused) { $bad += 'refused-despite-read-only' }
        if ($echoed -ne $promptCalls) { $bad += "echoed=$echoed-of-$promptCalls" }
        if ($echoedValues.Count -ne $promptCalls) { $bad += "parsed-values=$($echoedValues.Count)-of-$promptCalls" }
        if ($valuesMissing.Count -gt 0) { $bad += "default-not-on-command-line=$($valuesMissing -join '|')" }
        if ($exited -and $proc.ExitCode -ne 0) { $bad += "exit=$($proc.ExitCode)" }
    }
    'refuse' {
        if (-not $refused) { $bad += 'no-refusal' }
        if ($stubRan) { $bad += 'stub-ran-anyway' }
        if ($echoed -ne 0) { $bad += "echoed=$echoed" }
        if ($exited -and $proc.ExitCode -ne 1) { $bad += "exit=$($proc.ExitCode)" }
    }
    'explicit' {
        if ($refused) { $bad += 'refused-despite-explicit-arguments' }
        if ($echoed -ne 0) { $bad += "echoed=$echoed" }
        if (-not $stubRan) { $bad += 'stub-not-reached' }
        $missing = @($Argv | Where-Object { -not $stubArgs.Contains('"' + $_ + '"') })
        if ($missing.Count -gt 0) { $bad += "argument-not-on-command-line=$($missing -join '|')" }
        if ($exited -and $proc.ExitCode -ne 0) { $bad += "exit=$($proc.ExitCode)" }
    }
}
$verdict = if ($bad.Count -eq 0) { 'OK' } else { 'FAIL' }
$first = if ($out.Length -gt 0) { ($out -split "`r?`n")[0] } else { '<empty>' }
Write-Output ("RUN {0} {1} case={2} ms={3} argn={4} echoed={5} stubArgs={6} {7}" -f $verdict, $Rel, $Case, $sw.ElapsedMilliseconds, $Argv.Count, $echoed, $stubRan, ($bad -join ','))
Write-Output ("    first=[{0}]" -f $first)
exit $(if ($bad.Count -eq 0) { 0 } else { 1 })
