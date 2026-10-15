' CCS 12.2.0 automation: import a file's contents into target memory
' Prerequisite: board connected and powered on
' Non-interactive mode (CCS12_2_0_NONINTERACTIVE=1): each dialog becomes one console
' line carrying the default it would have pre-filled. This launcher CHANGES target
' state and its built-in defaults are examples, so in that mode every parameter
' must be given on the command line (see ccs12_2_0.conf.example).
' Options: --binary / --page data. The dialog does NOT cover them, and it supplies
' the TEXT form's positional parameters only (ccxml, address, count, file).
' Read the Usage block at the top of the same-named .js: the --binary form takes NO
' <count> (<ccxml_path> <address> <file> --binary), so that form must be driven from
' the command line rather than through this dialog. <file> must be an ABSOLUTE path.

Option Explicit

Dim WshShell, fso, args
Dim ccxmlPath, addr, count, srcFile, ccsRoot, dssBat, scriptPath
Dim cmd, output, failure

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set args = WScript.Arguments
' Load project defaults from ccs12_2_0.conf at the repository root (see ccs12_2_0.conf.example).
Dim repoRoot, configLibPath, config
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
configLibPath = fso.BuildPath(repoRoot, "session\config.vbs")
If Not fso.FileExists(configLibPath) Then
    Notify "Cannot find shared library: " & configLibPath, vbCritical, "Path Error"
    WScript.Quit 1
End If
ExecuteGlobal fso.OpenTextFile(configLibPath, 1).ReadAll
Set config = LoadProjectConfig(fso, repoRoot)

ccsRoot = ResolveDefault(config, "ccs_root", "CCS12_2_0_ROOT", "")
dssBat = ccsRoot & "\ccs\ccs_base\scripting\bin\dss.bat"
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\ccs12_2_0_mem_import.js"

If Not fso.FileExists(dssBat) Then
    Notify "Cannot find dss.bat: " & dssBat & vbCrLf & "Set env var CCS12_2_0_ROOT or set ccs_root in ccs12_2_0.conf.", vbCritical, "Path Error"
    WScript.Quit 1
End If

If args.Count >= 1 Then
    ccxmlPath = args(0)
Else
    ccxmlPath = Prompt("Enter ccxml file absolute path:", "CCS12_2_0 Memory Import - step 1/4", _
                     ResolveDefault(config, "ccxml", "CCS_CCXML", ""))
    If ccxmlPath = "" Then WScript.Quit 1   ' cancel = nothing ran => exit 1 (0/1 contract)
End If

If args.Count >= 2 Then
    addr = args(1)
Else
    addr = Prompt("Enter destination address (hex with 0x prefix):", "CCS12_2_0 Memory Import - step 2/4", "0xD000")
    If addr = "" Then WScript.Quit 1   ' cancel = nothing ran => exit 1 (0/1 contract)
End If

If args.Count >= 3 Then
    count = args(2)
Else
    count = Prompt("Enter number of WORDS to load:" & vbCrLf & _
                 "(text form only; the --binary form takes no count)", "CCS12_2_0 Memory Import - step 3/4", "256")
    If count = "" Then WScript.Quit 1   ' cancel = nothing ran => exit 1 (0/1 contract)
End If

If args.Count >= 4 Then
    srcFile = args(3)
Else
    ' Built from %TEMP% for the same reason as in ccs12_2_0_mem_export.vbs: the file must be
    ' absolute and this is not a project-wide default, so no ccs12_2_0.conf key is invented.
    srcFile = Prompt("Enter source file (ABSOLUTE path):", "CCS12_2_0 Memory Import - step 4/4", _
                   fso.BuildPath(fso.GetSpecialFolder(2), "ccs12_2_0_memory_dump.txt"))
    If srcFile = "" Then WScript.Quit 1   ' cancel = nothing ran => exit 1 (0/1 contract)
End If

ccxmlPath = Trim(Replace(ccxmlPath, """", ""))
addr = Trim(Replace(addr, """", ""))
count = Trim(Replace(count, """", ""))
srcFile = Trim(Replace(srcFile, """", ""))

If Not fso.FileExists(ccxmlPath) Then
    Notify "ccxml file not found: " & ccxmlPath, vbCritical, "Error"
    WScript.Quit 1
End If

If Not fso.FileExists(srcFile) Then
    Notify "input file not found: " & srcFile, vbCritical, "Error"
    WScript.Quit 1
End If

cmd = """" & dssBat & """ """ & scriptPath & """ """ & ccxmlPath & """ """ & addr & """ """ & count & """ """ & srcFile & """"
WScript.Echo "Executing: " & cmd
' Pin the process working directory to the repository root before launching: the
' .js bootstrap finds session/session.js by walking up from the process CWD, so
' the child must not inherit whatever directory the launcher was started from.
WshShell.CurrentDirectory = repoRoot

output = RunDss(cmd)
failure = DssFailure(output)
If failure = "" Then
    Notify "Memory import done, see console output.", vbInformation, "Done"
Else
    Notify "Memory import failed." & vbCrLf & vbCrLf & failure, vbExclamation, "Failed"
    ' Exit non-zero so a caller can tell this from success: the dialog is not a
    ' signal a .bat can read, and dss.bat's own exit code is 0 either way.
    WScript.Quit 1
End If

' --- launch helpers ----------------------------------------------------------
'
' They live in the launcher itself rather than in session\config.vbs because one of
' the branches they serve is "session\config.vbs is missing": a diagnostic path that
' would need the shared library in order to report on the shared library is
' useless. session\config.vbs stays the config parser it is documented to be.

' Show text to the operator. MsgBox can block forever in a session where nobody
' is there to click it (measured), so an automated session sets
' CCS12_2_0_NONINTERACTIVE=1 and every dialog becomes one console line; unset, this
' is the original double-click dialog, unchanged.
Function Notify(text, icon, title)
    If WshShell.Environment("PROCESS").Item("CCS12_2_0_NONINTERACTIVE") = "1" Then
        WScript.Echo text
    Else
        MsgBox text, icon, title
    End If
End Function

' Run the DSS command line and return everything it printed. The command goes
' through cmd /c so the redirect below is understood, and stderr is merged into
' stdout because an unread StdErr pipe can deadlock the child. The exit code is
' not read at all: dss.bat returns 0 whatever the script does (measured with
' System.exit(1) and System.exit(7)).
Function RunDss(cmdLine)
    Dim proc
    Set proc = WshShell.Exec("cmd /c """ & cmdLine & """ 2>&1")
    RunDss = proc.StdOut.ReadAll()
End Function

' Success is decided by the marker line the .js prints, never by the exit code.
' Returns "" when the output carries CCS12_2_0_RESULT=OK; otherwise the text for the
' failure dialog: that marker line -- or a note that none was printed, which
' means the script never reached its own end -- plus the last 15 lines of
' output, so a failure can be diagnosed instead of being a bare "Failed".
Function DssFailure(output)
    Dim lines, i, first, markerLine, tail
    lines = Split(Replace(Replace(output, vbCrLf, vbLf), vbCr, vbLf), vbLf)
    markerLine = "(no CCS12_2_0_RESULT line was printed)"
    For i = 0 To UBound(lines)
        If Left(Trim(lines(i)), 13) = "CCS12_2_0_RESULT=" Then markerLine = Trim(lines(i))
    Next
    If InStr(output, "CCS12_2_0_RESULT=OK") > 0 Then
        DssFailure = ""
        Exit Function
    End If
    first = UBound(lines) - 14
    If first < 0 Then first = 0
    tail = ""
    For i = first To UBound(lines)
        tail = tail & lines(i) & vbCrLf
    Next
    DssFailure = markerLine & vbCrLf & "--- last " & (UBound(lines) - first + 1) & " output lines ---" & vbCrLf & tail
End Function

' ---------------------------------------------------------------------------
' Ask for one positional parameter, unless the run is non-interactive.
' CCS12_2_0_NONINTERACTIVE=1 has no dialog to answer, so the value the dialog would
' have pre-filled is used, echoed as one console line that carries the SAME message
' text: the guidance a human clicker reads is not lost. Whether a default may be
' used at all is decided by session\config.vbs (see ccs12_2_0.conf.example) -- a launcher that
' changes target state refuses to guess and demands explicit parameters. An empty
' default is a hard error rather than a silent skip: no dialog can park an
' automated run, and no missing value can pass unnoticed.
Function Prompt(message, title, defaultValue)
    Dim refusal, extra
    If IsNonInteractive() Then
        If Len(defaultValue) = 0 Then
            Notify "CCS12_2_0_NONINTERACTIVE=1 but no default is available for: " & DialogLabel(message), vbCritical, "Missing default"
            WScript.Quit 1
        End If
        refusal = DefaultRefusal(message)
        If Len(refusal) > 0 Then
            Notify refusal, vbCritical, "Refused in non-interactive mode"
            WScript.Quit 1
        End If
        WScript.Echo "Non-interactive: " & DialogLabel(message) & " = " & defaultValue
        extra = DialogExtraLines(message, String(17, " "))
        If Len(extra) > 0 Then WScript.Echo extra
        Prompt = defaultValue
    Else
        Prompt = InputBox(message, title, defaultValue)
    End If
End Function
