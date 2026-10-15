@echo off
setlocal

rem Run from the repository root: the .js scripts find session\session.js by walking up
rem from the process CWD, so a caller may start this pipeline from anywhere but the
rem child processes must not inherit that directory.
cd /d "%~dp0.."

:: Example: run to main, step, then watch a write -- three single-session workflows.
:: Each step is ONE DSS session and sets up what it needs itself (see the WHY ONE SESSION comments
:: below): breakpoints and single-stepping are session state, so a chain of separate .js calls
:: cannot carry them from one step to the next.
:: Usage: breakpoint_step.bat [ccxml_path] [out_path]
:: If arguments are omitted, the defaults below are used.
:: To use another board/chip, pass your own ccxml and out file, e.g.:
::   breakpoint_step.bat <ccxml_path> <out_path>

:: Defaults come from ccs12_2_0.conf at the repository root (see ccs12_2_0.conf.example).
:: Precedence is PER KEY, not one merged order (see ccs12_2_0.conf.example):
::   ccxml    : %1, then CCS_CCXML, then ccs12_2_0.conf [ccxml], then FAIL (exit 1)
::   out      : %2, then CCS_OUT, then ccs12_2_0.conf [out], then FAIL (exit 1)
::   ccs_root : ccs12_2_0.conf [ccs_root], then CCS_ROOT, then FAIL (exit 1)
:: The .vbs launchers read CCS12_2_0_ROOT instead; setting that variable has no effect here.
:: No built-in defaults since (portability fix, same rule on both implementations).
:: The watch address (watch_addr recipe key) comes from ccs12_2_0.conf too.
set ROOT=%~dp0..
for /f "usebackq eol=; tokens=1* delims==" %%a in ("%~dp0..\ccs12_2_0.conf") do (
    if /i "%%a"=="ccs_root"  set "CCS_ROOT=%%b"
    if /i "%%a"=="ccxml"     set "CCXML_CFG=%%b"
    if /i "%%a"=="out"       set "OUT_CFG=%%b"
    if /i "%%a"=="watch_addr" set "WATCH_CFG=%%b"
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
if not defined WATCH_CFG (
    echo CCS12_2_0_RESULT=FAIL config: watch_addr not configured in ccs12_2_0.conf
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
rem --- Step 1: load the program, set a breakpoint at main, run to it -- ONE session.
rem WHY ONE SESSION: breakpoints are session state (DebugServer.terminate() drops them), so a
rem chain like "bp_set.js then target_run.js" cannot work -- the breakpoint dies when the
rem first session closes and the run is free. Every step below is therefore a
rem self-contained single-session workflow; a breakpoint/step sequence that must share
rem state is written as one workflows\ script and called once.
set "LOG1=%TEMP%\ccs12_2_0_breakpoint_step_1.log"
call "%DSS%" "%ROOT%\workflows\ccs12_2_0_run_to_bp.js" "%CCXML%" "%OUT%" main > "%LOG1%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG1%" >nul
if errorlevel 1 (
    echo Run to breakpoint failed.
    call :show_failure "%LOG1%"
    del "%LOG1%" >nul 2>&1
    echo CCS12_2_0_RESULT=FAIL run_to_bp
    exit /b 1
)

rem 2 s settle wait. timeout aborts when stdin is not a console (measured), so it would not wait when the output is captured; ping always waits.
ping -n 3 127.0.0.1 >nul
rem --- Step 2: two single steps at main -- again ONE session (it sets its own breakpoint).
set "LOG2=%TEMP%\ccs12_2_0_breakpoint_step_2.log"
call "%DSS%" "%ROOT%\workflows\ccs12_2_0_step.js" "%CCXML%" "%OUT%" 2 --from main --kind into > "%LOG2%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG2%" >nul
if errorlevel 1 (
    echo Step twice failed.
    call :show_failure "%LOG2%"
    del "%LOG1%" "%LOG2%" >nul 2>&1
    echo CCS12_2_0_RESULT=FAIL step
    exit /b 1
)

rem 2 s settle wait. timeout aborts when stdin is not a console (measured), so it would not wait when the output is captured; ping always waits.
ping -n 3 127.0.0.1 >nul
rem --- Step 3: watch a write to %WATCH_CFG% -- ONE session (watchpoints are session state too).
set "LOG3=%TEMP%\ccs12_2_0_breakpoint_step_3.log"
call "%DSS%" "%ROOT%\workflows\ccs12_2_0_watch_write.js" "%CCXML%" "%OUT%" %WATCH_CFG% > "%LOG3%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG3%" >nul
if errorlevel 1 (
    echo Watchpoint did not trigger.
    call :show_failure "%LOG3%"
    del "%LOG1%" "%LOG2%" "%LOG3%" >nul 2>&1
    echo CCS12_2_0_RESULT=FAIL watch_write
    exit /b 1
)

del "%LOG1%" "%LOG2%" "%LOG3%" >nul 2>&1
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