@echo off
setlocal
cd /d "%~dp0"
if not exist build mkdir build
if not exist dist mkdir dist
dir /s /b src\*.java > build\sources.list
javac --release 17 -encoding UTF-8 -d build @build\sources.list
if errorlevel 1 exit /b 1
jar --create --file dist\lark.jar --main-class lark.Lark -C build . -C . web
echo Wrote dist\lark.jar
echo Run it with: java -jar dist\lark.jar
