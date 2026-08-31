# AGENTS.md

Desktop app (Electron) that syncs local files with Huawei OBS. Vue 3 + TypeScript + Vite + Pinia + Tailwind.

## Package manager & toolchain

- Use **pnpm** (not npm/yarn). CI pins pnpm 9, Node 24, Electron 33.
- `.npmrc` sets `node-linker=hoisted` and `pnpm-workspace.yaml` uses `allowBuilds` (pnpm 10). Native deps include `esdk-obs-nodejs`, `electron`, `chokidar`, `sharp` — approval/rebuilt handling matters on install.
- `postinstall` runs `electron-builder install-app-deps`.

## Commands (README is stale — trust package.json)

Only three scripts exist, despite what README claims:

- `pnpm build` — `vue-tsc --noEmit && vite build && electron-builder` (full release artifacts into `release/`).
- `pnpm build:dir` — same but `electron-builder --dir` (unpacked build, no installers). Fastest way to verify before packaging.
- `pnpm dev` — literally `electron .` only. **No Vite dev server / no HMR.** It loads `dist/index.html`, so you must run `vite build` (or `pnpm build:dir`) first, or set `VITE_DEV_SERVER_URL` (see `src/main/index.ts`).

There is **no** `build:win`/`build:mac`/`build:linux`/`build:all`, no `dev:hmr`, no lint, and no test script. For cross-platform targets use `electron-builder --win|--mac|--linux` directly.

Typecheck = `vue-tsc --noEmit` (already part of `build`).

## Architecture & boundaries

- `src/main/` — Electron main process. IPC handlers registered in `src/main/index.ts` (`registerHandlers`); each domain (`fileSystem`, `watchService`, `configService`, `obsService`) exports a `{ channel: handler }` map. Add new IPC by following this pattern.
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('electronAPI', ...)`. The renderer calls `window.electronAPI.*` only.
- `src/renderer/` — Vue app. Path alias `@` → `src/renderer`, `@main` → `src/main` (see `tsconfig.json` paths and `vite.config.ts`).
- IPC contract types live in two places that must stay in sync: `electron.d.ts` (root) and `src/types/electron.d.ts`. `electronAPI` method names in preload map to channels like `fs:readDirectory`, `config:get`, `obs:listObjects`.

## Quirks & gotchas

- OBS uses the **Node** SDK `esdk-obs-nodejs` in the main process (avoids CORS in renderer). `src/main/obsService.ts` is `@ts-nocheck`; hand-written types for the SDK are in `src/types/esdk-obs-nodejs.d.ts`.
- `obsServicesApi.js` (repo root) is **legacy dead code** — it imports a non-existent `./api` and is not referenced by any build/source. Ignore it.
- Build output `dist/` and `dist-electron/` are gitignored; main loads `dist/index.html` in production.
- `electron-builder` config lives in `package.json` (`build` key). `productName` = "Clubf5 Tools OBScloud"; appId `com.github.baselweb-frios.sync-obs`; output `release/`.
- Icons: `public/icon.svg` → `public/icon.png` regenerated via `scripts/generate-icons.js` (uses `@resvg/resvg-js`); `electron-builder` derives `.ico`/`.icns`.
- Single-instance lock in `src/main/index.ts` — second launch focuses existing window.

## CI / release

`.github/workflows/release.yml` triggers on git tags `v*.*.*`, builds a matrix of win/mac/linux, and publishes (`--publish always`) using `GH_TOKEN` (auto-update via `electron-updater`). `fail-fast: false`, 30-min timeout.
