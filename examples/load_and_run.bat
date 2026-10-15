@echo off
setlocal

rem Run from the repository root: the .js scripts find session\session.js by walking up
rem from the process CWD, so a caller may start this pipeline from anywhere but the
rem child processes must not inherit that directory.
cd /d "%~dp0.."

:: Example: load program and run
:: Usage: load_and_run.bat [ccxml_path] [out_path]
:: If arguments are omitted, the defaults below are used.
:: To use another board/chip, pass your own ccxml and out file, e.g.:
::   load_and_run.bat <ccxml_path> <out_path>
::
:: WHY ONE WORKFLOW, not "load_program then target_run": every atomic script opens its own
:: debug session, and a session boundary destroys everything the previous one established --
:: the symbol table, the breakpoints, and the fact that the program had been loaded. So
:: chaining the two apart gives "loaded in one session, run in another", which is not the
:: same thing as "loaded and then run".
:: Session-boundary evidence: session/session.js (measuring note on reset behaviour there).

:: Defaults come from ccs12_2_0.conf at the repository root (see ccs12_2_0.conf.example).
:: Precedence is PER KEY, not one merged order (see ccs12_2_0.conf.example):
::   ccxml    : %1, then CCS_CCXML, then ccs12_2_0.conf [ccxml], then FAIL (exit 1)
::   out      : %2, then CCS_OUT, then ccs12_2_0.conf [out], then FAIL (exit 1)
::   ccs_root : ccs12_2_0.conf [ccs_root], then CCS_ROOT, then FAIL (exit 1)
:: The .vbs launchers read CCS12_2_0_ROOT instead; setting that variable has no effect here.
:: No built-in defaults since (portability fix, same rule on both implementations).
set ROOT=%~dp0..
for /f "usebackq eol=; tokens=1* delims==" %%a in ("%~dp0..\ccs12_2_0.conf") do (
    if /i "%%a"=="ccs_root" set "CCS_ROOT=%%b"
    if /i "%%a"=="ccxml"    set "CCXML_CFG=%%b"
    if /i "%%a"=="out"      set "OUT_CFG=%%b"
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

:: dss.bat's own process exit code is 0 whatever the script does (measured with
:: System.exit(1), System.exit(7), a natural end and a nonexistent script path).
:: The cmd-level errorlevel does carry the JVM's code when it is read after the
:: call -- on a following line, or with delayed expansion on (cmd /v:on) -- but
:: without delayed expansion it is expanded before the call runs and is always 0
:: (a measurement artifact, measured for System.exit(7) as well). A natural end
:: and a nonexistent script path both read 0 too, so a 0 proves neither that the
:: script ran nor that it succeeded. Each step is therefore judged by the
:: CCS12_2_0_RESULT marker line in the log captured below, never by %errorlevel%.
set "LOG1=%TEMP%\ccs12_2_0_load_and_run_1.log"
call "%DSS%" "%ROOT%\workflows\ccs12_2_0_load_run.js" "%CCXML%" "%OUT%" > "%LOG1%" 2>&1
findstr /b /c:"CCS12_2_0_RESULT=OK" "%LOG1%" >nul
if errorlevel 1 (
    echo Load+run failed.
    call :show_failure "%LOG1%"
    del "%LOG1%" >nul 2>&1
    echo CCS12_2_0_RESULT=FAIL load_run
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