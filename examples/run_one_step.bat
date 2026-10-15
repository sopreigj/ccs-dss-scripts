@echo off
setlocal enabledelayedexpansion

:: run_one_step.bat - the 12.2.0 "run one step, report the verdict" primitive (phase D).
:: Usage: run_one_step.bat <script.js> [args...]
:: Contract (identical on both implementations so one pipeline body serves both):
::   prints  STEP_VERDICT=OK   and exits 0  when the step succeeded,
::   prints  STEP_VERDICT=FAIL and exits 1  otherwise.
:: On 12.2.0 dss.bat's own exit code is 0 whatever the script does (measured, four
:: probes - the launcher verdict contract in session/session.js), so the verdict is translated HERE from
:: the CCS12_2_0_RESULT=OK marker line in the captured log. That translation is the
:: whole point of this wrapper: pipelines judge steps by exit code on both implementations.

cd /d "%~dp0.."
set "ROOT=%cd%"

set "CCS_ROOT="
for /f "usebackq eol=; tokens=1* delims==" %%a in ("%ROOT%\ccs12_2_0.conf") do (
    if /i "%%a"=="ccs_root" set "CCS_ROOT=%%b"
)
if not defined CCS_ROOT (
    echo STEP_VERDICT=FAIL config: ccs_root not configured in ccs12_2_0.conf
    exit /b 1
)
set "DSS=%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat"
if not exist "%DSS%" (
    echo STEP_VERDICT=FAIL config: dss.bat not found: %DSS%
    exit /b 1
)

if "%~1"=="" (
    echo STEP_VERDICT=FAIL usage: run_one_step.bat ^<script.js^> [args...]
    exit /b 1
)
if not exist "%~1" (
    echo STEP_VERDICT=FAIL script not found: %~1
    exit /b 1
)

set "LOG=%TEMP%\ccs12_2_0_run_one_step_%RANDOM%.log"
call "%DSS%" %* > "%LOG%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG%" >nul
if errorlevel 1 (
    echo STEP_VERDICT=FAIL %~nx1
    echo --- CCS12_2_0_RESULT marker ---
    findstr /c:"CCS12_2_0_RESULT=" "%LOG%"
    if errorlevel 1 echo --- no CCS12_2_0_RESULT line was found in the log ---
    echo --- captured output ---
    type "%LOG%"
    del "%LOG%" >nul 2>&1
    exit /b 1
)
del "%LOG%" >nul 2>&1
echo STEP_VERDICT=OK %~nx1
exit /b 0