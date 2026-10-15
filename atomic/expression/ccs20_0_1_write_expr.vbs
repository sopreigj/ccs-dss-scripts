' CCS 20.0.1 automation: assign C expression

Option Explicit

Dim WshShell, fso, args
Dim ccxmlPath, expr, ccsRoot, runBat, scriptPath
Dim cmd, ret

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set args = WScript.Arguments
' --- project config ccs20_0_1.conf: env > config (no built-in defaults) ---
Dim confPath, confRoot, confCcxml, confOut, confWrite, confFile, confText, confLine, confPos, confKey
confRoot = "" : confCcxml = "" : confOut = "" : confWrite = ""
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
                    Case "WRITE_EXPR": confWrite = Trim(Mid(confLine, confPos + 1))
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
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\ccs20_0_1_write_expr.js"

If Not fso.FileExists(runBat) Then
    MsgBox "Cannot find run.bat: " & runBat & vbCrLf & "Set env var CCS20_0_1_ROOT or set CCS_ROOT in ccs20_0_1.conf.", vbCritical, "Path Error"
    WScript.Quit 1
End If

If args.Count >= 1 Then
    ccxmlPath = args(0)
Else
    ccxmlPath = InputBox("Enter ccxml file absolute path:", "CCS 20.0.1 Assign Expression", _
                     defCcxml)
    If ccxmlPath = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If

If args.Count >= 2 Then
    expr = args(1)
Else
    ' 缺配置 = 空预填（弹窗仍可用）——本仓库不再回落任何内置默认值，配方只在 ccs20_0_1.conf。
    expr = InputBox("Enter assignment expression:", "CCS 20.0.1 Assign Expression", confWrite)
    If expr = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If

ccxmlPath = Trim(Replace(ccxmlPath, """", ""))
expr = Trim(expr)

If Not fso.FileExists(ccxmlPath) Then
    MsgBox "ccxml file not found: " & ccxmlPath, vbCritical, "Error"
    WScript.Quit 1
End If

cmd = Qt(runBat) & " " & Qt(scriptPath) & " " & Qt(ccxmlPath) & " " & Qt(expr)
WScript.Echo "Executing: " & cmd
ret = WshShell.Run(cmd, 1, True)

If ret = 0 Then
    MsgBox "Assignment done.", vbInformation, "Done"
Else
    MsgBox "Assignment failed, return code: " & ret, vbExclamation, "Failed"
    ' 失败必须让退出码说话：批处理与流水线按 0/1 判成败（对话框不是机器可读的信号）。
    WScript.Quit 1
End If

' VBScript 没有内建引号函数。赋值表达式里必然有空格（conf 的 WRITE_EXPR 即如此），
' 不加引号会被 cmd 拆成多个参数、脚本侧因"位置参数过多"而失败。
' 注意：编译检查抓不到这类漏引号——它只解析、不执行到这一行，所以每个 .vbs 里的字符串参数
' 都要人工确认走过 Qt()。
Function Qt(s)
    Qt = """" & Replace(s, """", """""") & """"
End Function
