@echo off
setlocal

:: 示例：断点、单步、观察点（每一步都是一个自包含的单会话工作流）
:: Usage: breakpoint_step.bat [ccxml_path] [out_path]
:: 默认值来自仓库根的 ccs20_0_1.conf；缺键直接报错（本仓库没有内置回落）。
::
:: 为什么这里每一步都要重新"烧录+动作"（看起来很浪费）：
:: 断点、单步位置、符号表全都活在会话里，跨脚本不保留。实测证据：
::   * 一个脚本设断点（打印 "Breakpoint set, ID: 9"）后，另一个脚本跑 1000 ms 的 PC 是
::     0x3001ab，并没有停在断点地址上；
::   * 单步只有"目标已停机"时才有意义，而目标在脚本之间是自由运行的。
:: 所以"设断点"和"跑到断点"必须在同一个脚本里完成——这就是 workflows\ 存在的理由。
:: 会话边界与证据见 session/session.js（会话边界）。

set "ROOT=%~dp0.."
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCXML_CFG=" & set "OUT_CFG=" & set "ROOT_CFG=" & set "WATCH_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
    if /i "%%a"=="CCS_ROOT" set "ROOT_CFG=%%b"
    if /i "%%a"=="WATCH_ADDR" set "WATCH_CFG=%%b"
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

:: 固件配方只认 ccs20_0_1.conf：换固件改配置键，不改本文件。
if "%WATCH_CFG%"=="" (
    echo ERROR: WATCH_ADDR not configured in ccs20_0_1.conf.
    exit /b 1
)

echo.
echo [1/3] Run to a breakpoint at main
:: loadProgram 结束时目标就停在 main，所以这一步会报告"已经在 main"（这是正常的，不是失败）。
call "%RUN%" "%ROOT%\workflows\ccs20_0_1_run_to_bp.js" "%CCXML%" "%OUT%" main
if %errorlevel% neq 0 (
    echo Run-to-breakpoint failed.
    exit /b %errorlevel%
)

ping -n 3 127.0.0.1 >nul

echo.
echo [2/3] Assembly-level single step x5
call "%RUN%" "%ROOT%\workflows\ccs20_0_1_step.js" "%CCXML%" "%OUT%" 5 --kind asm
if %errorlevel% neq 0 (
    echo Stepping failed.
    exit /b %errorlevel%
)

ping -n 3 127.0.0.1 >nul

echo.
echo [3/3] Watch for a write to %WATCH_CFG% and report the writing instruction
:: 触发时报告的 PC 就是"做那次写"的指令地址；要在 CCS GUI 里看它对应的源码行。
call "%RUN%" "%ROOT%\workflows\ccs20_0_1_watch_write.js" "%CCXML%" "%OUT%" "%WATCH_CFG%"
if %errorlevel% neq 0 (
    echo Watchpoint did not trigger.
    exit /b %errorlevel%
)

echo.
echo Done: all three single-session debug workflows completed.
