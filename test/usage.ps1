# usage.ps1 -- print each launcher's positional-argument order and existing-file guards.
# Read-only. Derived from the file, so it cannot drift from what the launcher does.
$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.vbs' |
    Where-Object { $_.FullName -notmatch '\\session\\' -and $_.FullName -notmatch '\\test\\' } |
    Sort-Object FullName

foreach ($f in $files) {
    $rel = $f.FullName.Replace($root + '\', '')
    $t = [System.IO.File]::ReadAllText($f.FullName)
    $lines = $t -split "`r`n"
    Write-Output ("===== {0}" -f $rel)
    # argument-count guards, in order
    foreach ($m in [regex]::Matches($t, 'If args\.Count >= (\d+) Then[ \t]*\r?\n[ \t]*(\w+) = args\((\d+)\)')) {
        Write-Output ("   positional args({0}) -> {1}" -f $m.Groups[3].Value, $m.Groups[2].Value)
    }
    # existing-file guards
    foreach ($m in [regex]::Matches($t, 'If Not fso\.FileExists\((\w+)\) Then')) {
        Write-Output ("   EXISTENCE GUARD on {0}" -f $m.Groups[1].Value)
    }
    # the Prompt() call sites, in order, give the dialog order
    foreach ($m in [regex]::Matches($t, '(\w+) = Prompt\("([^"]*)"')) {
        Write-Output ("   prompt -> {0}  [{1}]" -f $m.Groups[1].Value, $m.Groups[2].Value)
    }
}
