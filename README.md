# ClubF5 Cargador OBS

Aplicación de escritorio para cargar música OGG desde una computadora a Huawei OBS de forma controlada.

## Contrato de seguridad

- Solo carga desde la PC hacia OBS.
- Solo permite carpetas musicales ya existentes directamente dentro de `Music/online/`.
- Los destinos se consultan a OBS y se eligen desde una lista: no se pueden escribir rutas ni crear carpetas desde la aplicación.
- Compara contenido mediante SHA-256/MD5; no usa fecha ni tamaño como prueba de igualdad.
- Si un nombre ya existe con otro contenido, conserva OBS hasta que el operador elija **Reemplazar**.
- Antes de reemplazar, copia el objeto anterior a `_clubf5-backups/`.
- No expone operaciones para descargar o eliminar objetos remotos.
- Valida cabecera OGG, decodificación en Chromium y contenido publicado.
- Las credenciales se cifran con `safeStorage` (DPAPI en Windows).

## Flujo del operador

1. Configurar y verificar la conexión OBS.
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

Los tags `v*.*.*` ejecutan pruebas, compilan y publican los binarios con GitHub Actions. No se debe crear un tag si la revisión del cambio tiene hallazgos abiertos.
