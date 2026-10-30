@echo off
chcp 65001 >nul
echo ============================================
echo   SuperExport by Edgar Quintero - Instalador
echo ============================================
echo.
echo Cierra Illustrator antes de continuar.
pause

REM Permite que Illustrator cargue paneles propios (CEP 9 a 12)
for %%v in (9 10 11 12) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

set "EXT=%APPDATA%\Adobe\CEP\extensions"
if not exist "%EXT%" mkdir "%EXT%"
REM Version anterior (LogoPack)
if exist "%EXT%\com.estudio03.logopack" rmdir /s /q "%EXT%\com.estudio03.logopack"
if exist "%EXT%\com.superexport" rmdir /s /q "%EXT%\com.superexport"
xcopy "%~dp0com.superexport" "%EXT%\com.superexport\" /e /i /y /q >nul

echo.
echo Listo. Abre Illustrator y ve a:
echo   Ventana ^> Extensiones ^> Super Export
echo.
pause
