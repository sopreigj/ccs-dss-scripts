' CCS 20.0.1 automation: write memory word (8/16/32-bit)

Option Explicit

Dim WshShell, fso, args
Dim ccxmlPath, addr, val, ccsRoot, runBat, scriptPath
Dim cmd, ret

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set args = WScript.Arguments
' --- project config ccs20_0_1.conf: env > config (no built-in defaults) ---
Dim confPath, confRoot, confCcxml, confOut, confFile, confText, confLine, confPos, confKey
confRoot = "" : confCcxml = "" : confOut = ""
' ReadAll + split on CR/LF/CRLF: FSO ReadLine does not treat a lone LF
' as a line break, so a LF-saved ccs20_0_1.conf would otherwise parse as one blob.
confPath = fso.GetAbsolutePathName(fso.GetParentFolderName(WScript.ScriptFullName) & "\..\..\ccs20_0_1.conf")
If fso.FileExists(confPath) Then
    Set confFile = fso.OpenTextFile(confPath, 1)
    confText = confFile.ReadAll
    confFile.Close
    confText = Replace(confText, vbCrLf, vbLf)
    confText = Replace(confText, vbCr, vbLf)
    For Each confLine In Split(confText, vbLf)
        confLine = Trim(confLine)
        If Len(confLine) > 0 And Left(confLine, 1) <> "#" Then
            confPos = InStr(confLine, "=")
            If confPos > 0 Then
                confKey = UCase(Trim(Left(confLine, confPos - 1)))
                Select Case confKey
                    Case "CCS_ROOT" : confRoot = Trim(Mid(confLine, confPos + 1))
                    Case "CCXML"    : confCcxml = Trim(Mid(confLine, confPos + 1))
                    Case "OUT"      : confOut = Trim(Mid(confLine, confPos + 1))
                End Select
            End If
        End If
    Next
End If
Dim defCcxml, defOut
defCcxml = confCcxml
defOut = confOut
' --- end project config ---

ccsRoot = WshShell.Environment("PROCESS").Item("CCS20_0_1_ROOT")
If ccsRoot = "" Then ccsRoot = confRoot
runBat = ccsRoot & "\ccs\scripting\run.bat"
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\ccs20_0_1_mem_write.js"

If Not fso.FileExists(runBat) Then
    MsgBox "Cannot find run.bat: " & runBat & vbCrLf & "Set env var CCS20_0_1_ROOT or set CCS_ROOT in ccs20_0_1.conf.", vbCritical, "Path Error"
    WScript.Quit 1
End If

If args.Count >= 1 Then
    ccxmlPath = args(0)
Else
    ccxmlPath = InputBox("Enter ccxml file absolute path:", "CCS 20.0.1 Memory Write", _
                     defCcxml)
    If ccxmlPath = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If

If args.Count >= 2 Then
    addr = args(1)
Else
    addr = InputBox("Enter target address (hex, e.g. 0x8000):", "CCS 20.0.1 Memory Write", "0x8000")
    If addr = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If

If args.Count >= 3 Then
    val = args(2)
Else
    val = InputBox("Enter value to write (0-65535, 0x prefix ok):", "CCS 20.0.1 Memory Write", "0x1234")
    If val = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If

ccxmlPath = Trim(Replace(ccxmlPath, """", ""))
addr = Trim(Replace(addr, """", ""))
val = Trim(Replace(val, """", ""))

If Not fso.FileExists(ccxmlPath) Then
    MsgBox "ccxml file not found: " & ccxmlPath, vbCritical, "Error"
    WScript.Quit 1
End If

cmd = """" & runBat & """ """ & scriptPath & """ """ & ccxmlPath & """ """ & addr & """ """ & val & """"
If args.Count >= 4 Then
    cmd = cmd & " """ & args(3) & """"
End If
WScript.Echo "Executing: " & cmd
ret = WshShell.Run(cmd, 1, True)

If ret = 0 Then
    MsgBox "Memory write done.", vbInformation, "Done"
Else
    MsgBox "Memory write failed, return code: " & ret, vbExclamation, "Failed"
    ' 失败必须让退出码说话：批处理与流水线按 0/1 判成败（对话框不是机器可读的信号）。
    WScript.Quit 1
End If
