# AGENTS.md

Desktop app (Electron) that uploads local music through ClubF5 API sessions to Huawei OBS. Vue 3 + TypeScript + Vite + Pinia + Tailwind.

## Package manager & toolchain

- Use **pnpm** (not npm/yarn). `package.json` pins pnpm 10; CI uses Node 24 and Electron 44.
- `.npmrc` sets `node-linker=hoisted` and `pnpm-workspace.yaml` uses `allowBuilds`. `esdk-obs-nodejs` was removed; never reintroduce client-side OBS AK/SK.
- `postinstall` runs `electron-builder install-app-deps`.

## Commands (README is stale — trust package.json)

Current scripts:

- `pnpm build` — `vue-tsc --noEmit && vite build && electron-builder` (full release artifacts into `release/`).
- `pnpm build:dir` — same but `electron-builder --dir` (unpacked build, no installers). Fastest way to verify before packaging.
- `pnpm dev` — literally `electron .` only. **No Vite dev server / no HMR.** It loads `dist/index.html`, so you must run `vite build` (or `pnpm build:dir`) first, or set `VITE_DEV_SERVER_URL` (see `src/main/index.ts`).
- `pnpm test` — Vitest; `pnpm typecheck` — Vue TypeScript checker.

There is **no** `build:win`/`build:mac`/`build:linux`/`build:all`, no `dev:hmr`, and no lint. For cross-platform targets use `electron-builder --win|--mac|--linux` directly.

Typecheck = `vue-tsc --noEmit` (already part of `build`).

## Architecture & boundaries

- `src/main/` — Electron main process. IPC handlers registered in `src/main/index.ts` (`registerHandlers`); `fileSystem`, `configService`, and `obsService` export `{ channel: handler }` maps. The API client and short-lived signed OBS PUTs stay in this process.
- `src/preload/index.ts` — `contextBridge.exposeInMainWorld('electronAPI', ...)`. The renderer calls `window.electronAPI.*` only.
- `src/renderer/` — Vue app. Path alias `@` → `src/renderer`, `@main` → `src/main` (see `tsconfig.json` paths and `vite.config.ts`).
- IPC contract types live in `src/types/global.d.ts`; keep them synchronized with `src/preload/index.ts`.

## Quirks & gotchas

- OBS is reached only with short-lived signed URLs from ClubF5. The app must never receive or store Huawei AK/SK. Refresh tokens are encrypted by Electron `safeStorage`; access JWTs are memory-only.
- `obsServicesApi.js` (repo root) is **legacy dead code** — it imports a non-existent `./api` and is not referenced by any build/source. Ignore it.
- Build output `dist/` and `dist-electron/` are gitignored; main loads `dist/index.html` in production.
- `electron-builder` config lives in `package.json` (`build` key). `productName` = "Clubf5 Tools OBScloud"; appId `com.github.baselweb-frios.sync-obs`; output `release/`.
- Icons: `public/icon.svg` → `public/icon.png` regenerated via `scripts/generate-icons.js` (uses `@resvg/resvg-js`); `electron-builder` derives `.ico`/`.icns`.
- Single-instance lock in `src/main/index.ts` — second launch focuses existing window.

## CI / release

`.github/workflows/release.yml` is manual from `main` and requires a version tag at that exact commit. Windows and signed/notarized macOS builds must both pass before a public release is created. See `docs/MAC-RELEASE.md`.
