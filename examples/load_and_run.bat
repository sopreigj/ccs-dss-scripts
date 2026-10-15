@echo off
setlocal

:: 示例：烧录固件并让目标运行起来（单会话）
:: Usage: load_and_run.bat [ccxml_path] [out_path]
:: 默认值来自仓库根的 ccs20_0_1.conf；缺键直接报错（本仓库没有内置回落）。
:: 换板子/换芯片时直接传自己的文件，例如：
::   load_and_run.bat <ccxml_path> <out_path>
::
:: 为什么这里是**一个**工作流脚本，而不是"load_program 再 target_run"：
:: 那两个原子脚本各开一个调试会话，而每次连接都会复位目标——分开跑等于"烧完就复位"，
:: 程序不会按你烧的那样跑。会话边界与实测证据见 session/session.js（会话边界）。

set "ROOT=%~dp0.."
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCXML_CFG=" & set "OUT_CFG=" & set "ROOT_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
    if /i "%%a"=="CCS_ROOT" set "ROOT_CFG=%%b"
)

set "RUN=%CCS20_0_1_ROOT%"
if "%RUN%"=="" set "RUN=%ROOT_CFG%"
if "%RUN%"=="" (
    echo ERROR: CCS_ROOT not configured - set env CCS20_0_1_ROOT or set CCS_ROOT in ccs20_0_1.conf.
    exit /b 1
)
set "RUN=%RUN%\ccs\scripting\run.bat"
if not exist "%RUN%" (
    echo ERROR: run.bat not found: %RUN%
    exit /b 1
)

set "CCXML=%~1"
set "OUT=%~2"
if "%CCXML%"=="" set "CCXML=%CCXML_CFG%"
if "%CCXML%"=="" (
    echo ERROR: CCXML not configured - pass it as arg 1 or set CCXML in ccs20_0_1.conf.
    exit /b 1
)
if "%OUT%"=="" set "OUT=%OUT_CFG%"
if "%OUT%"=="" (
    echo ERROR: OUT not configured - pass it as arg 2 or set OUT in ccs20_0_1.conf.
    exit /b 1
)

:: 链式调用 run.bat 必须写 call：漏了 call 时第一步之后会静默结束，而退出码仍是 0。
call "%RUN%" "%ROOT%\workflows\ccs20_0_1_load_run.js" "%CCXML%" "%OUT%"
if %errorlevel% neq 0 (
    echo Load+run failed.
    exit /b %errorlevel%
)

echo Done: the target is running the newly loaded program.
