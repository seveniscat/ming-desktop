# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

**Ming** (`ming-desktop`) is a single Electron desktop app (React + Vite renderer, Node main process, SQLite via `better-sqlite3`). There is no separate backend service or `docker-compose` stack in this repo.

### Dependency install

- Use **npm** with the lockfile at the repo root (`package-lock.json`).
- Plain `npm install` can fail on a peer dependency conflict between `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/sdk`. Use:

  ```bash
  npm install --legacy-peer-deps
  ```

- `postinstall` runs `electron-rebuild` for native modules (`better-sqlite3`). If install succeeds but the app crashes on DB access, re-run `npx electron-rebuild`.

### Dev server

- **Command:** `npm run dev` (electron-vite: builds main/preload, starts Vite + Electron).
- **Renderer URL:** `http://localhost:5188/` — in dev, Vite often binds to **IPv6 loopback only** (`::1`). Use `curl http://[::1]:5188/` if `127.0.0.1` fails.
- **GUI:** Electron needs a display (`DISPLAY` is usually set in Cloud Agent VMs). Expect harmless **D-Bus** and **GPU/WebGL** warnings in headless environments; the app can still run.
- **User data / SQLite:** `~/.config/ming-desktop/` on Linux (`ming-desktop.db` created on first launch).

### Other commands

| Command | Purpose |
|--------|---------|
| `npm run build` | Production build to `dist/` |
| `npm run type-check` | `tsc --noEmit` (may report existing TS errors) |
| `npm run lint` | ESLint — **no `.eslintrc` in repo**; lint fails until config is added |
| `npm test -- --run` | Vitest — **no test files** committed yet |
| `python3 scripts/generate_daily_report.py` | Core daily-report script; set `REPO_PATHS` (comma-separated git repo roots) |

### Daily report without the GUI

```bash
REPO_PATHS=/path/to/git/repo DAILY_REPORT_OUTPUT_DIR=/tmp/ming-reports \
  python3 scripts/generate_daily_report.py
```

Requires **Python 3** and **git**. Chat/LLM features need provider credentials configured in-app (not in repo env).

### Optional / external

- **LLM APIs** or local **Ollama** (`http://localhost:11434/v1`) for chat E2E.
- **MCP servers** (stdio via `npx`) when testing MCP integration.
- `install.sh` references `npm run build:main`, which is **not** in `package.json`; prefer `npm run dev` or `npm run build`.
