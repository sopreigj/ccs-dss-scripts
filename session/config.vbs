' Shared launcher library for all ccs12_2_0_*.vbs scripts.
' Loaded via ExecuteGlobal from each launcher (see ccs12_2_0.conf.example).
'
' Precedence is PER KEY, not one merged order (see ccs12_2_0.conf.example):
'   ccs_root : environment CCS12_2_0_ROOT > ccs12_2_0.conf > ERROR (there is no command-line level)
'   ccxml/out: command-line argument > dialog prefill > environment (CCS_CCXML / CCS_OUT)
'              > ccs12_2_0.conf > ERROR / empty prefill. ResolveDefault() below implements
'              the environment > ccs12_2_0.conf > fallback part; the two higher levels
'              belong to the caller.
' No built-in path defaults since (portability fix, same rule on both implementations):
' pass "" as the fallback and the caller's own missing-value handling takes over - a .bat
' fails with its verdict line, a dialog prefills empty and the operator types the path.
' The firmware recipe keys (eval_expr / write_expr / watch_addr / settle_ms) are read the
' same way: only ccs12_2_0.conf supplies them (envName = "" at the call sites).
' NOTE: examples\*.bat do NOT go through this file and do NOT read CCS12_2_0_ROOT at all -
'       they let ccs12_2_0.conf overwrite the same-named variable CCS_ROOT.

' Reads ccs12_2_0.conf at the repository root and returns a Scripting.Dictionary
' of key -> value. Section headers and ; comment lines are ignored.
' Keys must be unique across the whole file (section names are not part of keys).
Function LoadProjectConfig(fso, repoRoot)
    Dim dict, iniPath, content, lines, i, line, pos
    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = 1 ' vbTextCompare: keys are case-insensitive
    iniPath = fso.BuildPath(repoRoot, "ccs12_2_0.conf")
    If fso.FileExists(iniPath) Then
        content = ReadTextFileUtf8(iniPath)
        content = Replace(content, vbCr, "")
        lines = Split(content, vbLf)
        For i = 0 To UBound(lines)
            line = Trim(lines(i))
            If Len(line) > 0 Then
                If Left(line, 1) <> ";" And Left(line, 1) <> "[" Then
                    pos = InStr(line, "=")
                    If pos > 1 Then
                        dict(Trim(Left(line, pos - 1))) = Trim(Mid(line, pos + 1))
                    End If
                End If
            End If
        Next
    End If
    Set LoadProjectConfig = dict
End Function

' FSO OpenTextFile decodes as the system ANSI codepage: UTF-8 multibyte
' sequences get corrupted and can even swallow line breaks. ADODB.Stream
' decodes UTF-8 natively, independent of the system locale.
Function ReadTextFileUtf8(path)
    Dim stream
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2 ' adTypeText
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile path
    ReadTextFileUtf8 = stream.ReadText(-1) ' adReadAll
    stream.Close
End Function

' envName may be "" to skip the environment-variable level.
Function ResolveDefault(config, key, envName, fallback)
    Dim v
    v = ""
    If Len(envName) > 0 Then
        v = CreateObject("WScript.Shell").Environment("PROCESS").Item(envName)
    End If
    If Len(v) = 0 And config.Exists(key) Then v = config(key)
    If Len(v) = 0 Then v = fallback
    ResolveDefault = v
End Function

' --- dialogs and non-interactive mode ----------------------------------------
' Every launcher dialog has a non-interactive twin: with CCS12_2_0_NONINTERACTIVE=1
' the launcher takes the value the dialog would have pre-filled and prints it as
' one console line, so an automated run can never park on a dialog (measured; see
' test/README.md). The policy below is the half of that rule a machine enforces:
'
'   a launcher that CHANGES target state may not fall back to a default in that
'   mode, because the built-in defaults are examples -- an address, a value, a run
'   time -- and such a run would succeed at the wrong thing.
'
' Only launchers that merely READ the target opt out. The default is the strict
' side on purpose: forgetting to declare means "refuse", never "guess". The dialog
' mechanics (Notify / InputBox / exit code) stay in each launcher, because one of
' the branches they serve is "session\config.vbs is missing" (see the launcher header),
' so this library must not depend on them.
Dim launcherChangesTarget
launcherChangesTarget = True

' Call this from a launcher that only reads the target. It must run before the
' first Prompt call (see the launchers' argument blocks).
Sub DeclareLauncherReadOnly()
    launcherChangesTarget = False
End Sub

Function IsNonInteractive()
    IsNonInteractive = (CreateObject("WScript.Shell").Environment("PROCESS").Item("CCS12_2_0_NONINTERACTIVE") = "1")
End Function

' The one-line label for the non-interactive echo: the first line of the dialog
' message, without the leading "Enter " and the trailing ":".
Function DialogLabel(message)
    Dim line, pos
    line = message
    pos = InStr(line, vbLf)
    If pos > 0 Then line = Left(line, pos - 1)
    line = Trim(Replace(Replace(line, vbCr, ""), vbTab, " "))
    If Left(line, 6) = "Enter " Then line = Mid(line, 7)
    If Right(line, 1) = ":" Then line = Left(line, Len(line) - 1)
    DialogLabel = Trim(line)
End Function

' The remaining lines of the dialog message, indented, so the echo keeps the
' guidance a human clicker would have read. "" when the message is a single line.
Function DialogExtraLines(message, indent)
    Dim lines, i, out
    lines = Split(Replace(Replace(message, vbCrLf, vbLf), vbCr, vbLf), vbLf)
    out = ""
    For i = 1 To UBound(lines)
        If Len(Trim(lines(i))) > 0 Then
            If Len(out) > 0 Then out = out & vbCrLf
            out = out & indent & Trim(lines(i))
        End If
    Next
    DialogExtraLines = out
End Function

' "" when a non-interactive run may use the pre-filled default for this message;
' otherwise the text saying why it may not and what to do instead.
Function DefaultRefusal(message)
    If Not launcherChangesTarget Then
        DefaultRefusal = ""
        Exit Function
    End If
    DefaultRefusal = "CCS12_2_0_NONINTERACTIVE=1 will not fall back to a default for: " & DialogLabel(message) & vbCrLf & _
        "This launcher changes target state and its built-in defaults are examples" & vbCrLf & _
        "(an address, a value, a run time), so the run would succeed at the wrong thing." & vbCrLf & _
        "Pass the parameter on the command line instead, or run the launcher interactively."
End Function
