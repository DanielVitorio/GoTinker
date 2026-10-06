# Go Tinker

Go Tinker es un entorno de escritorio para Windows que ejecuta código PHP dentro de un proyecto Laravel. Incluye autocompletado contextual, snippets y colecciones, historial de ejecución, un terminal inspirado en Cmder y almacenamiento local SQLite.

## Compilar

Instala Go 1.23 o posterior y ejecuta `.uild.ps1` desde PowerShell. El ejecutable se crea en `dist/GoTinker.exe`.

## Uso

Selecciona un proyecto Laravel que contenga `artisan` y ejecuta el código con **Ctrl+Enter**. Si seleccionas un fragmento, solo se ejecutará esa selección. Los snippets admiten carpetas y anotaciones, e importación y exportación de colecciones Postman y archivos PHP. El terminal conserva varias sesiones de proyecto.

## Idiomas

Pulsa la bandera de la barra superior para elegir español, inglés, portugués de Brasil, japonés, ruso o chino simplificado. Los textos de la interfaz y los SVG de las banderas se guardan en `app/backend/web/lang/`, en un archivo JSON por idioma.
