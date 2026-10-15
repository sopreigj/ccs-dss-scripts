@echo off
setlocal
:: 实机审计回归装置：10 项，每项一行 echo 写期望退出码（0=正常 / 1=用法或守卫拒绝）。
:: 除 [8] 外都需要真板（XDS100v1 + F28335 + 固件在位）；[8] 是解析期拒绝，不碰硬件。
:: 从 test/ 入库（原 %TEMP%\ccs20_0_1_audit_fix_test.bat，）：仓库根与配置改为
:: 按本文件位置推导（%~dp0..），路径唯一来源是 ccs20_0_1.conf；[8] 原为一条已删脚本
:: 的陈旧用例，已换成加密线拒绝用例。
cd /d "%~dp0.."

set "CONFIG=%CD%\ccs20_0_1.conf"
set "CCXML_CFG=" & set "OUT_CFG=" & set "ROOT_CFG=" & set "EVAL_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
    if /i "%%a"=="CCS_ROOT" set "ROOT_CFG=%%b"
    if /i "%%a"=="EVAL_EXPR" set "EVAL_CFG=%%b"
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
set "W=%CD%\workflows"
set "CCXML=%CCXML_CFG%"
if "%CCXML%"=="" (
    echo ERROR: CCXML not configured in ccs20_0_1.conf.
    exit /b 1
)
set "OUT=%OUT_CFG%"
if "%OUT%"=="" (
    echo ERROR: OUT not configured in ccs20_0_1.conf.
    exit /b 1
)
:: 第 [10] 步的采样表达式来自 ccs20_0_1.conf 的 EVAL_EXPR（逗号列表取第一个）。
for /f "tokens=1 delims=," %%e in ("%EVAL_CFG%") do set "EXPR=%%e"
if "%EXPR%"=="" (
    echo ERROR: EVAL_EXPR not configured in ccs20_0_1.conf.
    exit /b 1
)

echo [1] flash_op --op FrequencyTest --op EndFrequencyTest --set FTPin=GPIO51  (single session pair)
call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --op FrequencyTest --op EndFrequencyTest --set FTPin=GPIO51
echo 1 exit=%errorlevel%   (期望 0)

echo [2] flash_op --op CalculateChecksum  (exact name still accepted)
call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --op CalculateChecksum
echo 2 exit=%errorlevel%   (期望 0)

echo [3] flash_op --op Checksum  (substring: must now be refused)
call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --op Checksum
echo 3 exit=%errorlevel%   (期望 1)

echo [4] mem_fill value too wide for 16 bits
call "%RUN%" "%A%\memory\ccs20_0_1_mem_fill.js" "%CCXML%" 0xD000 8 0x10000 16
echo 4 exit=%errorlevel%   (期望 1)

echo [5] mem_fill in range
call "%RUN%" "%A%\memory\ccs20_0_1_mem_fill.js" "%CCXML%" 0xD000 8 0xBEEF 16
echo 5 exit=%errorlevel%   (期望 0)

echo [6] mem_export --binary with --format
call "%RUN%" "%A%\memory\ccs20_0_1_mem_export.js" "%CCXML%" 0xD000 8 "%TEMP%\ccs20_0_1_x.hex" --binary --format "16-Bit Hex - TI Style"
echo 6 exit=%errorlevel%   (期望 1)

echo [7] eval_expr negative values
call "%RUN%" "%A%\expression\ccs20_0_1_eval_expr.js" "%CCXML%" --symbols "%OUT%" -1 "(int)-1"
echo 7 exit=%errorlevel%   (期望 0)

echo [8] flash_op --op ProgramPassword  (guard: refused before any session opens)
call "%RUN%" "%A%\program\ccs20_0_1_flash_op.js" "%CCXML%" --op ProgramPassword
echo 8 exit=%errorlevel%   (期望 1)

echo [9] target_reset (PC after, no --kind)
call "%RUN%" "%A%\target\ccs20_0_1_target_reset.js" "%CCXML%"
echo 9 exit=%errorlevel%   (期望 0)

echo [10] sample_exprs 200ms x 5 (time column)
call "%RUN%" "%W%\ccs20_0_1_sample_exprs.js" "%CCXML%" "%OUT%" 200 5 "%TEMP%\ccs20_0_1_samples2.csv" "%EXPR%"
echo 10 exit=%errorlevel%   (期望 0)
type "%TEMP%\ccs20_0_1_samples2.csv"
