@echo off
setlocal

:: phase_d_pipeline.bat - FILLED pipeline for the phase D board regression.
:: It is examples\pipeline_template.bat with the step list filled in (same
:: skeleton: fail-fast, ping delays, one verdict). Kept in test/ because it is a
:: re-runnable regression asset bound to this board's conf, not a copy-and-fill
:: skeleton for users (that role belongs to examples\pipeline_template.bat).
::
:: Expected: every step prints STEP_VERDICT=OK, this file prints
:: PIPELINE_VERDICT=OK and exits 0. The recipe lives in test\README.md.

cd /d "%~dp0.."
set "ROOT=%cd%"
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCXML_CFG=" & set "OUT_CFG=" & set "EVAL_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
    if /i "%%a"=="EVAL_EXPR" set "EVAL_CFG=%%b"
)
set "CCXML=%CCXML_CFG%"
if "%CCXML%"=="" (
    echo PIPELINE_VERDICT=FAIL - CCXML not configured in ccs20_0_1.conf.
    exit /b 1
)
set "OUT=%OUT_CFG%"
if "%OUT%"=="" (
    echo PIPELINE_VERDICT=FAIL - OUT not configured in ccs20_0_1.conf.
    exit /b 1
)
:: 第三步的表达式来自 ccs20_0_1.conf 的 EVAL_EXPR（逗号列表取第一个）。
for /f "tokens=1 delims=," %%e in ("%EVAL_CFG%") do set "EXPR=%%e"
if "%EXPR%"=="" (
    echo PIPELINE_VERDICT=FAIL - EVAL_EXPR not configured in ccs20_0_1.conf.
    exit /b 1
)

:: ---- step list: one call per step, fail-fast ----
call examples\run_one_step.bat atomic\target\ccs20_0_1_check_connection.js "%CCXML%"
if errorlevel 1 goto :fail
ping -n 3 127.0.0.1 >nul
call examples\run_one_step.bat workflows\ccs20_0_1_load_run.js "%CCXML%" "%OUT%"
if errorlevel 1 goto :fail
ping -n 3 127.0.0.1 >nul
call examples\run_one_step.bat workflows\ccs20_0_1_load_run_read.js "%CCXML%" "%OUT%" 2000 "%EXPR%"
if errorlevel 1 goto :fail

echo PIPELINE_VERDICT=OK
exit /b 0

:fail
echo PIPELINE_VERDICT=FAIL (first failing step reported above)
exit /b 1