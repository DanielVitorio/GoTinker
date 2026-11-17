# Go Tinker

Go Tinker es una aplicación de escritorio para Windows que ejecuta código PHP dentro de proyectos Laravel. Reúne un editor de código con autocompletado basado en el proyecto, collections de requests guardadas, environments con variables, historial de ejecuciones, terminal Cmder integrado y almacenamiento local en SQLite.

## Compilar

Cmder es un submódulo de Git en `submodules\cmder`, así que clona con el parámetro `--recurse-submodules`:

```powershell
git clone --recurse-submodules <url-del-repositorio>
```

Si ya clonaste sin él, ejecuta `git submodule update --init --recursive`. Después instala Go 1.23 o superior y 7-Zip, y ejecuta `.\build.ps1` en PowerShell. El resultado es `dist\GoTinker.exe` junto con la carpeta `dist\cmder`.

## Usar

Selecciona un proyecto Laravel que contenga `artisan` y ejecuta el código con **Ctrl+Enter**; selecciona un fragmento antes para ejecutar solo esa selección. Guarda requests en collections con **Ctrl+S**, añade variables en la pestaña **Variables** (la clave `userId` se convierte en `$userId`) y usa valores del environment en el código como `{{nombre}}`. Cada ejecución queda guardada en el **Historial**. Las collections y los environments se pueden importar y exportar en JSON, y se pueden importar archivos `.php`.

Tus datos se guardan en `%APPDATA%\GoTinker\gotinker.sqlite`.

## Idiomas

Abre **Configuración** (icono de engranaje en la esquina superior derecha) para elegir entre portugués de Brasil, inglés, español, japonés, ruso y chino simplificado. Las traducciones están en `app/backend/web/lang/`, un archivo JSON por idioma.

Consulta el [README principal](../README.md) para la guía completa.
