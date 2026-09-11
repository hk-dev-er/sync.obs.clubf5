# Sync OBS

Aplicación de escritorio multiplataforma para sincronizar archivos locales con Huawei Object Storage Service (OBS).

## Características

- 🔄 **Sincronización**: Comparar y sincronizar carpetas
- 👁️ **Watch automático**: Detectar cambios en tiempo real
- 🎯 **Filtros**: Patrones de exclusión configurables
- 🌙 **Tema oscuro**: Soporte para tema claro/oscuro

## Requisitos

- Node.js 18+
- pnpm (recomendado), npm o yarn

## Instalación

```bash
# Instalar pnpm (si no lo tienes)
npm install -g pnpm

# Instalar dependencias
pnpm install

# Ejecutar en modo desarrollo
pnpm dev
```

## Compilación para Producción

El proyecto está configurado para compilar en múltiples plataformas y arquitecturas.

### Compilar para tu plataforma actual

```bash
pnpm build
```

### Compilar para plataformas específicas

```bash
# Windows (NSIS installer, portable, zip)
# Genera: x64, ia32
pnpm build:win

# macOS (DMG, zip)
# Genera: x64, arm64, universal
pnpm build:mac

# Linux (AppImage, deb, rpm, tar.gz)
# Genera: x64, arm64
pnpm build:linux
```

### Compilar para todas las plataformas

```bash
pnpm build:all
```

### Salida de compilación

Los archivos compilados se generarán en la carpeta `release/`:

**Windows:**
- `Sync OBS-1.0.0-win-x64.exe` - Instalador NSIS 64-bit
- `Sync OBS-1.0.0-win-ia32.exe` - Instalador NSIS 32-bit
- `Sync OBS-1.0.0-portable.exe` - Versión portable
- `Sync OBS-1.0.0-win-x64.zip` - Versión comprimida

**macOS:**
- `Sync OBS-1.0.0-mac-x64.dmg` - Intel Macs
- `Sync OBS-1.0.0-mac-arm64.dmg` - Apple Silicon (M1/M2/M3)
- `Sync OBS-1.0.0-mac-universal.dmg` - Universal (Intel + Apple Silicon)
- Versiones zip correspondientes

**Linux:**
- `Sync OBS-1.0.0-linux-x64.AppImage` - AppImage 64-bit
- `Sync OBS-1.0.0-linux-arm64.AppImage` - AppImage ARM64
- `Sync OBS-1.0.0-linux-x64.deb` - Paquete Debian/Ubuntu
- `Sync OBS-1.0.0-linux-x64.rpm` - Paquete RedHat/Fedora
- `Sync OBS-1.0.0-linux-x64.tar.gz` - Archivo comprimido

### Notas sobre compilación cruzada

**Limitaciones importantes:**

- **Desde Linux (tu plataforma actual)**:
  ```bash
  pnpm build:linux  # ✅ Funciona perfectamente
  pnpm build:win    # ✅ Funciona (requiere wine para firmar, opcional)
  pnpm build:mac    # ⚠️ Genera archivos pero sin firma ni optimizaciones
  ```

- **Desde Windows**: Puedes compilar para Windows y Linux
- **Desde macOS**: Puedes compilar para todas las plataformas con firma completa

**Recomendación:** Para producción, compila para macOS solo desde una Mac real o usa servicios de CI/CD como GitHub Actions que tienen runners para cada plataforma.

### Compilación en Linux (Recomendado)

Si estás en Linux, lo mejor es compilar solo para Linux:

```bash
# Solo para tu plataforma actual
pnpm build:linux
```

Los archivos generados estarán en `release/`

## Configuración

1. Abre la aplicación
2. Ve a Configuración (⚙️)
3. Ingresa tus credenciales de Huawei Cloud OBS:
   - **Access Key ID**: Tu AK
   - **Secret Access Key**: Tu SK
   - **Endpoint**: URL del servicio OBS (ej: `https://obs.la-south-2.myhuaweicloud.com`)
   - **Bucket**: Nombre del bucket

## Atajos de teclado

| Atajo | Acción |
|-------|--------|
| F2 | Actualizar |
| F5 | Copiar |
| F6 | Mover |
| F7 | Nueva carpeta |
| Del | Eliminar |
| Ctrl+Click | Selección múltiple |

## Estructura del proyecto

```
src/
├── main/           # Proceso principal Electron
│   ├── index.ts    # Entry point
│   ├── fileSystem.ts   # APIs del sistema de archivos
│   ├── watchService.ts # Monitor de cambios
│   └── configService.ts # Almacenamiento de configuración
├── preload/        # Script de preload
│   └── index.ts    # Bridge electron-renderer
└── renderer/       # Aplicación Vue
    ├── App.vue
    ├── main.ts
    ├── components/
    ├── services/
    ├── stores/
    └── styles/
```

## Tecnologías

- **Electron** - Framework de aplicación de escritorio
- **Vue 3** - Framework de UI
- **TypeScript** - Tipado estático
- **Vite** - Build tool
- **Pinia** - State management
- **Tailwind CSS** - Estilos
- **esdk-obs-browserjs** - SDK oficial de Huawei OBS
- **chokidar** - Watch de archivos

## Licencia

MIT
