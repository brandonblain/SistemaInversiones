@echo off
REM Inicia el portal completo (pagina web + portal + administracion) en http://localhost:8787
REM Doble clic para ejecutar. Cierre esta ventana para detenerlo.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm run setup
)
echo.
echo  Abriendo http://localhost:8787 ...
echo  Usuarios de prueba (contrasena Ficticio123!):
echo    admin@ficticio.test             Administracion
echo    hector.galeana@ficticio.test    Inversionista
echo.
start "" http://localhost:8787
call npm start
