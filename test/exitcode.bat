@echo off
setlocal
:: 退出码契约回归：5 项。C/E 是纯参数层（离线可跑），B/G/H 打开会话（需真板）。
::  %TEMP% 入库（原 ccs20_0_1_exitcode.bat）：路径改为按本文件位置推导，
:: RUN/CCXML 唯一来源是 ccs20_0_1.conf。
cd /d "%~dp0.."

set "CONFIG=%CD%\ccs20_0_1.conf"
set "CCXML_CFG=" & set "ROOT_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="CCS_ROOT" set "ROOT_CFG=%%b"
)
set "RUN=%CCS20_0_1_ROOT%"
if "%RUN%"=="" set "RUN=%ROOT_CFG%"
if "%RUN%"=="" (
    echo ERROR: CCS_ROOT not configured - set CCS_ROOT in ccs20_0_1.conf.
    exit /b 1
)
set "RUN=%RUN%\ccs\scripting\run.bat"
if not exist "%RUN%" (
    echo ERROR: run.bat not found: %RUN%
    exit /b 1
)
set "A=%CD%\atomic"
set "CCXML=%CCXML_CFG%"
if "%CCXML%"=="" (
    echo ERROR: CCXML not configured in ccs20_0_1.conf.
    exit /b 1
)

call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --list --op Erase >nul 2>&1
echo C flash_op 互斥          = %errorlevel%   (期望 1)
call "%RUN%" "%A%\target\ccs20_0_1_target_reset.js" "%CCXML%" --list --kind "CPU Reset" >nul 2>&1
echo E target_reset 互斥      = %errorlevel%   (期望 1)
call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --list >nul 2>&1
echo B flash_op --list 正常   = %errorlevel%   (期望 0)
call "%RUN%" "%A%\memory\ccs20_0_1_mem_write.js" "%CCXML%" 0xD000 0x10000 16 >nul 2>&1
echo G 值超位宽             = %errorlevel%   (期望 1)
call "%RUN%" "%A%\memory\ccs20_0_1_mem_write.js" "%CCXML%" 0xD000 0xBEEF 16 >nul 2>&1
echo H 正常写入             = %errorlevel%   (期望 0)
