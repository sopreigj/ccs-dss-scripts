@echo off
setlocal

:: pipeline_template.bat - the common pipeline BODY (phase D).
:: Copy this file, keep the skeleton, replace the step list.
::
:: Every step goes through run_one_step.bat, which owns the verdict contract:
:: STEP_VERDICT=OK exit 0 / STEP_VERDICT=FAIL exit 1. The skeleton
:: below - fail-fast, reconnect delay, one verdict at the end - is the reusable part,
:: and only the step list changes. run_one_step.bat isolates what "the step succeeded"
:: means for this stack: here it is the step's own exit code.
::
:: Rules kept from examples\load_and_run.bat:
::   - call, not bare invocation: without call the batch ends silently after the
::     first step while the exit code still says 0.
::   - ping for delays: timeout aborts when stdin is not a console.

cd /d "%~dp0.."
set "ROOT=%cd%"
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCXML_CFG=" & set "OUT_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCXML" set "CCXML_CFG=%%b"
    if /i "%%a"=="OUT" set "OUT_CFG=%%b"
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

:: ---- step list: one call per step, fail-fast ----
:: Example block (uncomment and adapt; delays between steps use ping, never timeout):
::   call examples\run_one_step.bat workflows\ccs20_0_1_load_run.js "%CCXML%" "%OUT%"
::   if errorlevel 1 goto :fail
::   ping -n 3 127.0.0.1 >nul
::   call examples\run_one_step.bat workflows\ccs20_0_1_load_run_read.js "%CCXML%" "%OUT%" 2000 your_symbol.Var
::   if errorlevel 1 goto :fail

echo PIPELINE_VERDICT=OK
exit /b 0

:fail
echo PIPELINE_VERDICT=FAIL (first failing step reported above)
exit /b 1