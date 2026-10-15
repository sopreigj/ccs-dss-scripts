@echo off
setlocal

:: 示例：烧录 → 写变量（WRITE_EXPR，取自 ccs20_0_1.conf）→ 运行 2 秒 → 读回（单会话）
:: Usage: load_set_run_read.bat [ccxml_path] [out_path]
:: 路径与固件配方默认值都来自仓库根的 ccs20_0_1.conf；缺键直接报错（没有内置回落）。
::
:: 为什么必须用工作流脚本：程序变量活不过会话边界。用两个原子脚本
:: "write_expr 写 1 → eval_expr 读回"会读到 0（每个脚本都会连接目标即复位）。
::
:: --settle（毫秒取自 ccs20_0_1.conf 的 SETTLE_MS，默认 500）的作用：烧录后立刻写、再运行，读回是 0——写入被程序启动阶段的初始化覆盖了；
:: 先让程序跑 500 ms 再写，同样的写入能留住（读回 1）。四个对照试验与证据见
:: session/session.js（会话边界）。断言"写进去有效"必须靠"settle + 运行 + 回读"，而不是靠赋值没报错。

set "ROOT=%~dp0.."
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCXML_CFG=" & set "OUT_CFG=" & set "ROOT_CFG=" & set "EVAL_CFG=" & set "WRITE_CFG=" & set "SETTLE_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
    if /i "%%a"=="CCS_ROOT" set "ROOT_CFG=%%b"
    if /i "%%a"=="EVAL_EXPR" set "EVAL_CFG=%%b"
    if /i "%%a"=="WRITE_EXPR" set "WRITE_CFG=%%b"
    if /i "%%a"=="SETTLE_MS" set "SETTLE_CFG=%%b"
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
:: EVAL_EXPR 允许写逗号分隔的列表，本示例只用逗号前第一个。
for /f "tokens=1 delims=," %%e in ("%EVAL_CFG%") do set "EXPR=%%e"
if "%EXPR%"=="" (
    echo ERROR: EVAL_EXPR not configured in ccs20_0_1.conf.
    exit /b 1
)
if "%WRITE_CFG%"=="" (
    echo ERROR: WRITE_EXPR not configured in ccs20_0_1.conf.
    exit /b 1
)
if "%SETTLE_CFG%"=="" (
    echo ERROR: SETTLE_MS not configured in ccs20_0_1.conf.
    exit /b 1
)

:: --set / --read 的表达式含空格与等号，必须用英文双引号括起来。
call "%RUN%" "%ROOT%\workflows\ccs20_0_1_load_write_run_read.js" "%CCXML%" "%OUT%" 2000 --settle %SETTLE_CFG% --set "%WRITE_CFG%" --read "%EXPR%"
if %errorlevel% neq 0 (
    echo Workflow failed.
    exit /b %errorlevel%
)

echo Done. Check the "Read back" section above for the value that survived the run.
