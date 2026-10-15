@echo off
setlocal

rem Run from the repository root: the .js scripts find session\session.js by walking up
rem from the process CWD, so a caller may start this pipeline from anywhere but the
rem child processes must not inherit that directory.
cd /d "%~dp0.."

:: Example: load -> set a variable -> run 2s -> read variables
:: Usage: load_set_run_read.bat [ccxml_path] [out_path]
:: If arguments are omitted, the defaults below are used.
:: To use another board/chip, pass your own ccxml and out file, e.g.:
::   load_set_run_read.bat <ccxml_path> <out_path>
::
:: WHY THE WORKFLOW: program variables do not survive a session boundary. The old chain
:: "write_expr writes 1 -> eval_expr reads it back" would read 0 in the later session,
:: because every script connects and resets the target. The single workflow does
:: load -> settle -> write -> run -> read inside ONE session.
:: --settle 500: writing right after load gets overwritten by startup initialization
:: (read back 0); letting the program run 500 ms first makes the same write survive
:: (read back 1). Four-cell controlled test: session/session.js (session boundary).
:: The assignment contains '=' and spaces, which dss.bat cannot carry as a positional
:: argument (measured: cmd-level "= was unexpected at this time."), so the expressions
:: travel in CCS_WRITE_EXPR / CCS_EVAL_EXPR -- the documented env channel
:: (see session/orch_driver.js and session/session.js).

:: Defaults come from ccs12_2_0.conf at the repository root (see ccs12_2_0.conf.example).
:: Precedence is PER KEY, not one merged order (see ccs12_2_0.conf.example):
::   ccxml    : %1, then CCS_CCXML, then ccs12_2_0.conf [ccxml], then FAIL (exit 1)
::   out      : %2, then CCS_OUT, then ccs12_2_0.conf [out], then FAIL (exit 1)
::   ccs_root : ccs12_2_0.conf [ccs_root], then CCS_ROOT, then FAIL (exit 1)
:: The .vbs launchers read CCS12_2_0_ROOT instead; setting that variable has no effect here.
:: No built-in defaults since (portability fix, same rule on both implementations).
:: The firmware recipe (eval_expr / write_expr / settle_ms) comes from ccs12_2_0.conf too -
:: changing firmware means editing the conf file, never this script.
set ROOT=%~dp0..
for /f "usebackq eol=; tokens=1* delims==" %%a in ("%~dp0..\ccs12_2_0.conf") do (
    if /i "%%a"=="ccs_root"   set "CCS_ROOT=%%b"
    if /i "%%a"=="ccxml"      set "CCXML_CFG=%%b"
    if /i "%%a"=="out"        set "OUT_CFG=%%b"
    if /i "%%a"=="eval_expr"  set "EVAL_CFG=%%b"
    if /i "%%a"=="write_expr" set "WRITE_CFG=%%b"
    if /i "%%a"=="settle_ms"  set "SETTLE_CFG=%%b"
)
if not defined CCS_ROOT (
    echo CCS12_2_0_RESULT=FAIL config: ccs_root not configured in ccs12_2_0.conf
    exit /b 1
)
set "DSS=%CCS_ROOT%\ccs\ccs_base\scripting\bin\dss.bat"
if not exist "%DSS%" (
    echo CCS12_2_0_RESULT=FAIL config: dss.bat not found: %DSS%
    exit /b 1
)

set "CCXML=%~1"
set "OUT=%~2"
if "%CCXML%"=="" set "CCXML=%CCS_CCXML%"
if "%CCXML%"=="" set "CCXML=%CCXML_CFG%"
if "%CCXML%"=="" (
    echo CCS12_2_0_RESULT=FAIL config: ccxml not configured in ccs12_2_0.conf
    exit /b 1
)
if "%OUT%"=="" set "OUT=%CCS_OUT%"
if "%OUT%"=="" set "OUT=%OUT_CFG%"
if "%OUT%"=="" (
    echo CCS12_2_0_RESULT=FAIL config: out not configured in ccs12_2_0.conf
    exit /b 1
)
if not defined WRITE_CFG (
    echo CCS12_2_0_RESULT=FAIL config: write_expr not configured in ccs12_2_0.conf
    exit /b 1
)
if not defined SETTLE_CFG (
    echo CCS12_2_0_RESULT=FAIL config: settle_ms not configured in ccs12_2_0.conf
    exit /b 1
)
:: eval_expr may be a comma list; this example reads back the first entry only.
for /f "tokens=1 delims=," %%e in ("%EVAL_CFG%") do set "EVAL_EXPR=%%e"
if not defined EVAL_EXPR (
    echo CCS12_2_0_RESULT=FAIL config: eval_expr not configured in ccs12_2_0.conf
    exit /b 1
)

:: dss.bat's own process exit code is 0 whatever the script does (measured with
:: System.exit(1), System.exit(7), a natural end and a nonexistent script path).
:: The cmd-level errorlevel does carry the JVM's code when it is read after the
:: call -- on a following line, or with delayed expansion on (cmd /v:on) -- but
:: without delayed expansion it is expanded before the call runs and is always 0
:: (a measurement artifact, measured for System.exit(7) as well). A natural end
:: and a nonexistent script path both read 0 too, so a 0 proves neither that the
:: script ran nor that it succeeded. Each step is therefore judged by the
:: CCS12_2_0_RESULT marker line in the log captured below, never by %errorlevel%.
set "LOG1=%TEMP%\ccs12_2_0_load_set_run_read_1.log"
set "CCS_WRITE_EXPR=%WRITE_CFG%"
set "CCS_EVAL_EXPR=%EVAL_EXPR%"
call "%DSS%" "%ROOT%\workflows\ccs12_2_0_load_write_run_read.js" "%CCXML%" "%OUT%" 2000 --settle %SETTLE_CFG% > "%LOG1%" 2>&1
set "CCS_WRITE_EXPR="
set "CCS_EVAL_EXPR="
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG1%" >nul
if errorlevel 1 (
    echo Load/set/run/read failed.
    call :show_failure "%LOG1%"
    del "%LOG1%" >nul 2>&1
    echo CCS12_2_0_RESULT=FAIL load_write_run_read
    exit /b 1
)

del "%LOG1%" >nul 2>&1
echo CCS12_2_0_RESULT=OK
exit /b 0

:: Show why a step failed. dss.bat hides the exit status, so the only reliable
:: evidence is the log captured above: print the CCS12_2_0_RESULT marker line (the
:: reason the step was judged failed) and then the captured output. The whole
:: log is printed rather than a fixed tail because batch has no tail primitive
:: that is both safe against output containing cmd metacharacters and free of
:: interactive paging.
:show_failure
echo --- CCS12_2_0_RESULT marker ---
findstr /c:"CCS12_2_0_RESULT=" "%~1"
if errorlevel 1 echo --- no CCS12_2_0_RESULT line was found in the log ---
echo --- captured output ---
type "%~1"
exit /b 0