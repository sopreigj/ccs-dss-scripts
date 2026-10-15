# CCS 12.2.0 static verification battery - every number that
# can be checked without hardware, re-derived rather than trusted. Read-only against the
# repository: the only writes go to a temp mirror that is deleted at the end.
#
# Usage:  powershell -File test\verify_static.ps1        (exit 0 = all checks passed)
#         Runs identically under Windows PowerShell 5.1 and PowerShell 7 - see the third trap.
#
# What it CANNOT check: anything about the board. No DSS session is started, so nothing here
# says a single thing about target behaviour (.
#
# Three traps are encoded below, all learned by getting them wrong:
#   * The .vbs compile check injects "WScript.Quit 0" so cscript compiles the whole file and
#     runs none of it. It must go AFTER "Option Explicit" (which has to stay the first
#     statement) - injecting it first makes 25 of 26 files fail, which looks like a broken
#     repository and is actually a broken device.
#   * The bootstrap block must be sliced by whole lines. A regex that ends at the literal
#     "// ---" captures only 6 of the closing line's 77 characters and yields the hash
#     815B24026E72E45A - a stale value no file contains (a short slice keeps producing a wrong
#     digest, and the digest is the only thing that would tell you the slice was short).
#   * Native stderr is not portable. In Windows PowerShell 5.1 a native command's stderr
#     becomes an ErrorRecord, so ErrorActionPreference='Stop' turned the negative control's
#     expected compile error into a terminating one: the device exited 1 on a healthy tree and
#     skipped the last three checks, while pwsh 7 reported "all checks passed". Hence
#     Invoke-Native() below, and hence running the device under BOTH hosts at least once.
# A verification device that is wrong fakes failures and passes alike, so all of them are
# recorded rather than quietly fixed.
param(
    # Re-derive the expected bootstrap digest instead of asserting it. Use this after an
    # intentional change to the shared bootstrap block (or to a word inside it), then paste
    # the printed digest into $expectedBootstrapDigest below.
    [switch]$Calibrate
)
$ErrorActionPreference = 'Stop'
# Anchored on this script's own location: a hardcoded repository path would be one more
# reference that goes stale the moment the tree moves.
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'session\session.js'))) {
    throw "not a ccs12_2_0_scripts checkout: $root"
}
$fail = New-Object System.Collections.ArrayList

function Note($msg) { Write-Output $msg }

# Windows PowerShell 5.1 promotes a native command's stderr to an ErrorRecord, and with
# ErrorActionPreference='Stop' (above) that becomes a TERMINATING error. Measured :
# under powershell.exe (5.1) this device died at its own negative control -- the deliberately
# broken file writes to stderr -- so it reported exit 1 on a healthy repository AND silently
# skipped the last three checks; the same file under pwsh (7) printed "all checks passed".
# Worse in principle than in that instance: a real syntax error (node/cscript print to stderr)
# would have aborted the run instead of naming the file. Every native call therefore goes
# through this helper, which pins 'Continue' for the duration of that call only.
function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $text = (& $Program @Arguments 2>&1 | Out-String) } finally { $ErrorActionPreference = $eap }
    [pscustomobject]@{ Text = $text; Exit = $LASTEXITCODE }
}

# ---------- 1. syntax: node --check on every .js ----------
$js = @(Get-ChildItem $root -Recurse -File -Filter *.js | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$bad = @()
foreach ($f in $js) {
    $r = Invoke-Native 'node' @('--check', $f.FullName)
    if ($r.Exit -ne 0) { $bad += "$($f.Name) :: $($r.Text.Trim())" }
}
Note ("syntax  node --check            : {0}/{1} ok" -f ($js.Count - $bad.Count), $js.Count)
foreach ($b in $bad) { [void]$fail.Add("syntax $b") }

# ---------- 2. bootstrap block: identical bytes across every entry-style .js ----------
# Exemptions (file kinds that must NOT carry the block), each a property of its layer:
#   session\            libraries loaded by entries (session.js, orch_driver.js);
#   orchestration\  shared orchestration mains: stack-blind by contract, loaded BY an
#                   entry -- a dss bootstrap here would be a layering violation, so absence
#                   is asserted by this rule (and re-asserted by the shared-layer check below);
#   test\check_*    Node-run harnesses (naming convention), they never launch DSS.
#                   test\driver_smoke.js stays checked: it IS a DSS entry.
$bs = @($js | Where-Object {
    $_.Directory.Name -ne 'session' -and
    $_.Directory.Name -ne 'orchestration' -and
    -not ($_.Directory.Name -eq 'test' -and $_.Name -like 'check_*.js')
})
$seen = @{}
foreach ($f in $bs) {
    # Calibre exactly as documented in : slice whole lines from the
    # "shared library bootstrap" line to the next line starting with "// ---", join with LF.
    # Do NOT use a regex whose match ends at the literal "// ---": that truncates the closing
    # line to 6 of its 77 characters and yields 815B24026E72E45A, a value no file contains.
    $lx = [System.IO.File]::ReadAllLines($f.FullName); $p = -1; $q = -1
    for ($i = 0; $i -lt $lx.Count; $i++) {
        if ($p -lt 0 -and $lx[$i] -match '^// --- shared library bootstrap') { $p = $i }
        elseif ($p -ge 0 -and $lx[$i] -match '^// ---') { $q = $i; break }
    }
    if ($p -lt 0 -or $q -lt 0) { [void]$fail.Add("bootstrap block not found in $($f.Name)"); continue }
    $blk = ($lx[$p..$q]) -join "`n"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $digest = ([BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($blk))) -replace '-', '').Substring(0, 16)
    $lines = ($blk -split "`n").Count
    if (-not $seen.ContainsKey($digest)) { $seen[$digest] = New-Object System.Collections.ArrayList }
    [void]$seen[$digest].Add("$($f.Name):$lines")
}
Note ("bootstrap blocks               : {0} files -> {1} distinct byte sequence(s), 22 source lines each" -f $bs.Count, $seen.Count)
# The digest of the shared bootstrap block, re-derivable with -Calibrate. It changes whenever
# the block's bytes change (including a word inside it), so a mismatch here is a real finding:
# either the block was edited in some files and not others, or it was edited everywhere and
# this constant was not re-derived.
$expectedBootstrapDigest = '5F7828BB18A00D20'
foreach ($k in $seen.Keys) {
    $v = $seen[$k]
    Note ("   {0}  x{1}  (first: {2})" -f $k, $v.Count, $v[0])
    if (-not $Calibrate -and $k -ne $expectedBootstrapDigest) {
        [void]$fail.Add("bootstrap digest is $k, expected $expectedBootstrapDigest (re-run with -Calibrate to re-derive)")
    }
}
if ($seen.Count -ne 1) { [void]$fail.Add("bootstrap block is not byte-identical across files") }

# ---------- 2b. shared-layer rules: orchestration/_selftest.js is the single source -------
# It asserts (a) no shared main carries the entry bootstrap, and (b) nothing in
# orchestration/ names a stack, a launcher, a repository or a documentation route. This
# replaces the cross-repository parity device, which needed a second repository present.
$sharedRules = Join-Path $root 'orchestration\_selftest.js'
if (Test-Path -LiteralPath $sharedRules) {
    $r = Invoke-Native 'node' @($sharedRules)
    $ok2 = ($r.Exit -eq 0) -and ($r.Text -match 'SHARED LAYER OK')
    Note ("shared layer rules            : {0}" -f $(if ($ok2) { 'SHARED LAYER OK' } else { 'FAILED' }))
    if (-not $ok2) { [void]$fail.Add("shared layer rules: " + $r.Text.Trim()) }
} else {
    Note "shared layer rules            : _selftest.js MISSING"
    [void]$fail.Add('orchestration\_selftest.js is missing')
}

# ---------- 3. encoding: no non-ASCII byte in code/launcher files ----------
$code = @(Get-ChildItem $root -Recurse -File -Include *.js, *.vbs, *.bat | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$nonAscii = @()
foreach ($f in $code) {
    $b = [System.IO.File]::ReadAllBytes($f.FullName)
    $n = 0; foreach ($x in $b) { if ($x -gt 127) { $n++ } }
    if ($n -gt 0) { $nonAscii += "$($f.Name) ($n bytes)" }
}
Note ("encoding non-ASCII bytes       : {0} offending file(s) out of {1}" -f $nonAscii.Count, $code.Count)
foreach ($x in $nonAscii) { [void]$fail.Add("non-ASCII in $x") }

# ---------- 4. line endings against .gitattributes ----------
$lfOnly = @(Get-ChildItem $root -Recurse -File -Include *.js, *.md, *.ps1 | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$crlfInLf = @()
foreach ($f in $lfOnly) {
    if ([System.IO.File]::ReadAllText($f.FullName).Contains("`r`n")) { $crlfInLf += $f.Name }
}
$crlfFiles = @(Get-ChildItem $root -Recurse -File -Include *.bat, *.vbs, *.conf | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$bareLf = @()
foreach ($f in $crlfFiles) {
    $t = [System.IO.File]::ReadAllText($f.FullName)
    if ([regex]::IsMatch($t, '(?<!\r)\n')) { $bareLf += $f.Name }
}
Note ("line endings CRLF-in-LF-group  : {0} file(s)  (must be 0)" -f $crlfInLf.Count)
Note ("line endings bare-LF-in-CRLF  : {0} file(s)  (must be 0)" -f $bareLf.Count)
foreach ($x in $crlfInLf) { [void]$fail.Add("CRLF in $x") }
foreach ($x in $bareLf) { [void]$fail.Add("bare LF in $x") }

# ---------- 5. .vbs compile: temp mirror + inject WScript.Quit 0 ----------
$mirror = Join-Path $env:TEMP ('ccs12_2_0_vbs_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $mirror | Out-Null
$vbs = @(Get-ChildItem $root -Recurse -File -Filter *.vbs | Where-Object { $_.FullName -notmatch '\\\.git\\' })
foreach ($f in $vbs) {
    $lines = [System.IO.File]::ReadAllLines($f.FullName)
    $out = New-Object System.Collections.ArrayList
    # Calibre: "Option Explicit" must stay the first statement, so the injected
    # WScript.Quit goes directly after it; session/config.vbs has none, so there it goes first.
    # Injecting before "Option Explicit" would make 25 of the 26 files fail to COMPILE.
    $done = $false
    foreach ($l in $lines) {
        [void]$out.Add($l)
        if (-not $done -and $l -match '^\s*Option\s+Explicit') { [void]$out.Add('WScript.Quit 0'); $done = $true }
    }
    if (-not $done) { $out.Insert(0, 'WScript.Quit 0') }
    [System.IO.File]::WriteAllLines((Join-Path $mirror $f.Name), $out.ToArray())
}
$okCount = 0; $badVbs = @()
foreach ($f in $vbs) {
    $p = Join-Path $mirror $f.Name
    $r = Invoke-Native 'cscript' @('//nologo', $p)
    $code2 = $r.Exit
    $txt = $r.Text
    if ($code2 -eq 0 -and $txt -notmatch 'Microsoft VBScript') { $okCount++ }
    else { $badVbs += "$($f.Name) exit=$code2 :: $($txt.Trim())" }
}
Note ("vbs compile (injected Quit 0)  : {0}/{1} ok" -f $okCount, $vbs.Count)
foreach ($b in $badVbs) { [void]$fail.Add("vbs $b") }

# negative control: break one function in the mirror, expect failure
$ctl = Join-Path $mirror 'lib_config_broken.vbs'
$cfg = Join-Path $root 'session\config.vbs'
$ctlLines = [System.IO.File]::ReadAllLines($cfg)
$ctlOut = New-Object System.Collections.ArrayList
$done = $false
foreach ($l in $ctlLines) {
    $inj = $l
    if ($inj -match '^Function ') { $inj = $inj -replace '^Function ', 'Functio ' }
    [void]$ctlOut.Add($inj)
    if (-not $done -and $l -match '^\s*Option\s+Explicit') { [void]$ctlOut.Add('WScript.Quit 0'); $done = $true }
}
if (-not $done) { $ctlOut.Insert(0, 'WScript.Quit 0') }
[System.IO.File]::WriteAllLines($ctl, $ctlOut.ToArray())
$ctlRun = Invoke-Native 'cscript' @('//nologo', $ctl)
$ctlTxt = $ctlRun.Text
$ctlPass = ($ctlRun.Exit -ne 0) -or ($ctlTxt -match 'Microsoft VBScript')
Note ("vbs negative control           : {0} (exit={1})" -f $(if ($ctlPass) { 'effective' } else { 'INEFFECTIVE' }), $ctlRun.Exit)
if (-not $ctlPass) { [void]$fail.Add('vbs negative control did not fire') }
Remove-Item $mirror -Recurse -Force

# ---------- 6. relative markdown links resolve from their own directory ----------
$mds = @(Get-ChildItem $root -Recurse -File -Filter *.md | Where-Object { $_.FullName -notmatch '\\\.git\\' })
$linkCount = 0; $dead = @()
foreach ($f in $mds) {
    $raw = [System.IO.File]::ReadAllText($f.FullName)
    foreach ($m in [regex]::Matches($raw, '\]\((?<t>[^)\s]+)\)')) {
        $t = $m.Groups['t'].Value
        if ($t -match '^(https?:|mailto:|#)') { continue }
        $t = ($t -split '#')[0]
        if ($t -eq '') { continue }
        $linkCount++
        $p = Join-Path $f.DirectoryName $t
        if (-not (Test-Path -LiteralPath $p)) { $dead += "$($f.Name) -> $t" }
    }
}
Note ("markdown relative links        : {0} checked, {1} dead" -f $linkCount, $dead.Count)
foreach ($d in $dead) { [void]$fail.Add("dead link $d") }

# ---------- verdict ----------
Note ''
if ($fail.Count -eq 0) { Note 'VERDICT: all checks passed' } else { Note ("VERDICT: {0} failure(s)" -f $fail.Count); foreach ($x in $fail) { Note ("  - " + $x) } }

# Explicit exit code. Without this the script inherits $LASTEXITCODE from the last native
# command it ran (the negative-control cscript leaves 1), so a fully successful run would
# report failure to any caller that gates on the exit code - the device would fake a failure.
exit $(if ($fail.Count -eq 0) { 0 } else { 1 })
