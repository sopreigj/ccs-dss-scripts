' CCS 20.0.1 automation: CCS 20.0.1 Write Register
' 本脚本没有选项；对话框覆盖它的全部位置参数（ccxml / register / value）。完整说明见同名 .js 的 Usage。

Option Explicit

Dim WshShell, fso, args, ccxmlPath, ccsRoot, runBat, scriptPath, cmd, ret, extraArgs
Dim regName, regValue
Dim confPath, confRoot, confCcxml, confOut, confFile, confText, confLine, confPos, confKey

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set args = WScript.Arguments
' --- project config ccs20_0_1.conf: env > config (no built-in defaults) ---
confRoot = "" : confCcxml = "" : confOut = ""
' 本脚本位于 atomic/<分类>/ 下，配置文件在仓库根，所以是上两级。
' ReadAll + 行尾归一化：FSO 的 ReadLine 不把单独的 LF 当换行。
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
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\ccs20_0_1_write_reg.js"

If Not fso.FileExists(runBat) Then
    MsgBox "Cannot find run.bat: " & runBat & vbCrLf & "Set env var CCS20_0_1_ROOT or set CCS_ROOT in ccs20_0_1.conf.", vbCritical, "Path Error"
    WScript.Quit 1
End If

If args.Count >= 1 Then
    ccxmlPath = args(0)
Else
    ccxmlPath = InputBox("ccxml file absolute path:", "CCS 20.0.1 Write Register", defCcxml)
    If Trim(ccxmlPath) = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
End If
ccxmlPath = Trim(Replace(ccxmlPath, """", ""))
If Not fso.FileExists(ccxmlPath) Then
    MsgBox "ccxml file not found: " & ccxmlPath, vbCritical, "Error"
    WScript.Quit 1
End If
regName = Trim(InputBox("register name (e.g. AL, PC):", "CCS 20.0.1 Write Register", "AL"))
If regName = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
regValue = Trim(InputBox("value (decimal or 0x hex):", "CCS 20.0.1 Write Register", "0x1234"))
If regValue = "" Then WScript.Quit 1     ' 取消 = 什么都没做 ⇒ 退出码 1（对外契约 0/1）
extraArgs = " " & Qt(regName) & " " & Qt(regValue)
cmd = Qt(runBat) & " " & Qt(scriptPath) & " " & Qt(ccxmlPath) & extraArgs
WScript.Echo "Executing: " & cmd
ret = WshShell.Run(cmd, 1, True)

If ret = 0 Then
    MsgBox "Register write finished.", vbInformation, "Done"
Else
    MsgBox "CCS 20.0.1 Write Register failed, return code: " & ret, vbExclamation, "Failed"
    ' 失败必须让退出码说话：批处理与流水线按 0/1 判成败（对话框不是机器可读的信号）。
    WScript.Quit 1
End If

' VBScript 没有内建引号函数；参数里可能出现空格（表达式、路径），统一加引号并转义内部引号。
Function Qt(s)
    Qt = """" & Replace(s, """", """""") & """"
End Function