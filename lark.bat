@echo off
setlocal
cd /d "%~dp0"
if not exist build mkdir build
dir /s /b src\*.java > build\sources.list
javac --release 17 -encoding UTF-8 -d build @build\sources.list
if errorlevel 1 exit /b 1
java -cp build lark.Lark %*
