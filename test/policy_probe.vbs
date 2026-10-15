' policy_probe.vbs -- unit probe for the non-interactive policy in session\config.vbs.
'
' WHY THIS EXISTS: "a launcher that changes target state may not fall back to a
' built-in default" is the one part of this repository a machine can decide. The
' launcher cells prove the wiring; this proves the decision itself, through the
' library's public functions, with no dialog, no DSS and no hardware.
'
' Run by test\drive_checks.ps1 under both PowerShell hosts. One "FAIL" line per
' failed check, exit 1; on success one line, exit 0.
'
' It is also the negative control for the policy: test\drive_checks.ps1 -SelfCheck
' points it at a copy of session\config.vbs whose default class has been flipped and
' requires this file to fail.

Option Explicit

Dim fso, root, libPath, failures, checks

Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
libPath = fso.BuildPath(root, "session\config.vbs")
If Not fso.FileExists(libPath) Then
    WScript.Echo "FAIL session\config.vbs not found at " & libPath
    WScript.Quit 1
End If
ExecuteGlobal fso.OpenTextFile(libPath, 1).ReadAll

failures = 0
checks = 0

' --- DialogLabel: the one-line label of the non-interactive echo -------------
Check "label drops the Enter prefix and the colon", DialogLabel("Enter ccxml file absolute path:"), "ccxml file absolute path"
Check "label is the first line only", DialogLabel("Enter number of WORDS to export:" & vbCrLf & "(the API takes a word count, not a byte count)"), "number of WORDS to export"
Check "label tolerates a message without the prefix", DialogLabel("register name:"), "register name"
Check "label trims whitespace", DialogLabel("  Enter value:  "), "value"

' --- DialogExtraLines: the guidance the dialog carried -----------------------
Check "extra lines keep the second line", DialogExtraLines("Enter count:" & vbCrLf & "e.g. 4", "  "), "  e.g. 4"
Check "extra lines are empty for a one-line message", DialogExtraLines("Enter count:", "  "), ""
Check "extra lines skip blank ones", DialogExtraLines("Enter a:" & vbCrLf & vbCrLf & "hint", ">"), ">hint"
Check "extra lines indent every line", DialogExtraLines("Enter a:" & vbCrLf & "one" & vbCrLf & "two", ">>"), ">>one" & vbCrLf & ">>two"

' --- DefaultRefusal: the policy ---------------------------------------------
' A launcher that never declares anything is on the strict side, so a default is
' refused and the text says which parameter and what to do instead.
Dim refusal
refusal = DefaultRefusal("Enter ccxml file absolute path:")
Check "undeclared launcher refuses a default", (Len(refusal) > 0), True
Check "refusal names the parameter", (InStr(refusal, "ccxml file absolute path") > 0), True
Check "refusal says where to put it instead", (InStr(refusal, "command line") > 0), True

' After opting out, the same message may use its default.
DeclareLauncherReadOnly
Check "declared read-only launcher allows a default", DefaultRefusal("Enter ccxml file absolute path:"), ""
Check "declaration is idempotent", DefaultRefusal("Enter value:"), ""

' --- IsNonInteractive: reads the environment, not a global --------------------
Dim env
env = CreateObject("WScript.Shell").Environment("PROCESS").Item("CCS12_2_0_NONINTERACTIVE")
Check "IsNonInteractive follows CCS12_2_0_NONINTERACTIVE", IsNonInteractive(), (env = "1")

If failures > 0 Then
    WScript.Echo "FAIL policy_probe: " & failures & " of " & checks & " check(s) failed"
    WScript.Quit 1
End If
WScript.Echo "POLICY OK " & checks & " unit checks passed (label / extra lines / refusal / default class)"

Sub Check(what, actual, expected)
    checks = checks + 1
    If actual <> expected Then
        failures = failures + 1
        WScript.Echo "FAIL " & what
        WScript.Echo "     expected: [" & expected & "]"
        WScript.Echo "     actual:   [" & actual & "]"
    End If
End Sub
