# ClubF5 Cargador OBS

Aplicación de escritorio para cargar música OGG desde una computadora a Huawei OBS de forma controlada.

## Contrato de seguridad

- Solo carga desde la PC hacia OBS.
- Solo permite las carpetas musicales asignadas al operador dentro de `Music/online/`.
- Los destinos se consultan a ClubF5 y se eligen desde una lista: no se pueden escribir rutas ni crear carpetas desde la aplicación.
- Compara contenido mediante SHA-256/MD5; no usa fecha ni tamaño como prueba de igualdad.
- Si un nombre ya existe con otro contenido, conserva OBS hasta que el operador elija **Reemplazar**.
- Antes de reemplazar, copia el objeto anterior a `_clubf5-backups/`.
- No expone operaciones para descargar o eliminar objetos remotos.
- Valida cabecera OGG, decodificación en Chromium y contenido publicado.
- La aplicación nunca recibe Access Key ni Secret Key de OBS. El operador ingresa con su usuario de ClubF5; el JWT queda en memoria y solo el refresh rotativo se cifra con `safeStorage` (DPAPI en Windows y Keychain en macOS).
- Cada parte se envía directamente a OBS con una URL firmada de 15 minutos y `Content-MD5`. La sesión de carga se renueva al usarla y permite continuar las partes pendientes tras reabrir la aplicación.

## Flujo del operador

1. Iniciar sesión con la cuenta de cargador de música creada por el administrador.
2. Elegir una carpeta local y el destino autorizado.
3. Comparar el contenido.
4. Resolver manualmente los conflictos.
5. Confirmar la carga.
6. Guardar el informe o reintentar únicamente los fallos.

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:dir
```

`pnpm build` genera instalador, portable y ZIP en `release/`.

## Publicación

Los tags `v*.*.*` ejecutan pruebas, compilan y publican los binarios con GitHub Actions. No se debe crear un tag si la revisión del cambio tiene hallazgos abiertos. Esta versión requiere las rutas `/api/music-uploader/*` de ClubF5 y una prueba real de SQL Server + OBS antes de su publicación; las pruebas simuladas no sustituyen esa validación.
