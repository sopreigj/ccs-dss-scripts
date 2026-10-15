@echo off
setlocal enabledelayedexpansion

:: run_one_step.bat - the "run one step, report the verdict" primitive (phase D).
:: Usage: run_one_step.bat <script.js> [args...]
:: Contract:
::   prints  STEP_VERDICT=OK   and exits 0  when the step succeeded,
::   prints  STEP_VERDICT=FAIL and exits 1  otherwise.
:: The verdict IS the step's exit code: scripts follow the 0/1 contract
:: (README, 参数与退出码约定), so nothing has to be parsed from output.

set "ROOT=%~dp0.."
set "CONFIG=%ROOT%\ccs20_0_1.conf"

set "CCS_ROOT_CFG="
if exist "%CONFIG%" for /f "usebackq tokens=1* delims== eol=#" %%a in ("%CONFIG%") do (
    if /i "%%a"=="CCS_ROOT" set "CCS_ROOT_CFG=%%b"
)

set "RUN=%CCS20_0_1_ROOT%"
if "%RUN%"=="" set "RUN=%CCS_ROOT_CFG%"
if "%RUN%"=="" (
    echo STEP_VERDICT=FAIL CCS_ROOT not configured - set env CCS20_0_1_ROOT or set CCS_ROOT in ccs20_0_1.conf.
    exit /b 1
)
set "RUN=%RUN%\ccs\scripting\run.bat"
if not exist "%RUN%" (
    echo STEP_VERDICT=FAIL run.bat not found: %RUN%
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

call "%RUN%" %*
if errorlevel 1 (
    echo STEP_VERDICT=FAIL %~nx1
    exit /b 1
)
echo STEP_VERDICT=OK %~nx1
exit /b 0