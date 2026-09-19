# Cloud Guardian — Deployment Journey & Architecture Flow

> **Autonomous Cloud Cost Optimization Engine**  
> Complete technical analysis and chronological workflow of the full-stack deployment on **Render (Backend)** and **Vercel (Frontend)** with **Zero-Touch GitHub CI/CD**.

---

## 1. Executive Summary

- **Frontend Production URL**: [https://pragyaan-agent-architects.vercel.app](https://pragyaan-agent-architects.vercel.app)
- **Backend API URL**: [https://pragyaan-agent-backend.onrender.com](https://pragyaan-agent-backend.onrender.com)
- **GitHub Repositories**:
  - Upstream: `akshitha-sangisetty/Pragyaan_AgentArchitects`
  - Fork: `burugulasaigeethika/Pragyaan_AgentArchitects`
- **Continuous Deployment**: Configured via dual-push remotes. Every `git push origin main` triggers parallel zero-downtime redeployments on both Render and Vercel.

---

## 2. System Architecture Flow

```
                                  +-------------------------------+
                                  ¦       Local Development       ¦
                                  ¦      (VS Code / Terminal)     ¦
                                  +-------------------------------+
                                                  ¦
                                        git push origin main
                                        (Dual-Push Configured)
                                                  ¦
                    +-----------------------------------------------------------+
                    ?                                                           ?
    +-------------------------------+                           +-------------------------------+
    ¦     Upstream GitHub Repo      ¦                           ¦       Fork GitHub Repo        ¦
    ¦  (akshitha-sangisetty/...)    ¦                           ¦    (burugulasaigeethika/...)  ¦
    +-------------------------------+                           +-------------------------------+
                    ¦ Webhook                                                   ¦ Webhook
                    ?                                                           ?
    +-------------------------------+                           +-------------------------------+
    ¦        Render Backend         ¦                           ¦        Vercel Frontend        ¦
    ¦   - Python 3.11.9 runtime     ¦                           ¦   - Pure Static (HTML/CSS/JS) ¦
    ¦   - FastAPI + Uvicorn server  ¦                           ¦   - Root Directory: frontend/ ¦
    ¦   - SQLite state & audit db   ¦                           ¦   - Global Edge CDN           ¦
    ¦   - Groq LPUs (Qwen 2.5)      ¦                           ¦   - Baked config.js API URL   ¦
    ¦   - Health check: /health     ¦                           ¦   - Dynamic Status Indicator  ¦
    +---------------?---------------+                           +-------------------------------+
                    ¦                                                           ¦
                    +------------ Encrypted HTTPS REST Calls -------------------+
                                (CORS Enabled: allow_origins=["*"])
```

---

## 3. Chronological Step-by-Step Implementation

### Phase 1: Local Codebase Adaptation & Cloud Decoupling
1. **Render Infrastructure as Code (`render.yaml`)**:
   - Created a declarative Blueprint specifying the web service, Python runtime, build command (`pip install -r requirements.txt`), start command (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`), and environment variable bindings.
   - Pinned the Python version to `3.11.9` in `runtime.txt`.
2. **Backend Health & Routing (`app/main.py`)**:
   - Added a dedicated `/health` endpoint returning `{"status": "ok", "service": "pragyaan-agent-backend"}` for automated Render uptime probes.
   - Mounted root-level static fallbacks for seamless local development.
3. **Frontend Dynamic API Resolver (`frontend/app.js` & `frontend/config.js`)**:
   - Built a centralized `apiUrl(path)` helper.
   - Decoupled hardcoded relative paths (`/api/...`) so all 11+ endpoints (`/health`, `/api/goals`, `/api/telemetry/tick`, `/api/scenario/load`, `/api/services`, `/api/recommend`, `/api/apply-action`, `/api/rollback`, `/api/evaluate-manual`, `/api/history`) automatically target the remote Render backend.
   - Added real-time health checks every 30 seconds to update the header status badge (`?? API: Live` vs `?? Offline`).
4. **Header Status & Settings Modal (`frontend/index.html` & `frontend/styles.css`)**:
   - Replaced `/static/` prefixes with relative asset paths.
   - Added a interactive modal allowing runtime switching or testing of the backend URL without code changes.
5. **Testing & Validation**:
   - Created `pytest.ini` with `pythonpath = .`.
   - Added `test_health_check` to `tests/test_scenarios.py` (all 8 tests passing locally).

---

### Phase 2: Git Synchronization & Merge Conflict Resolution
During the first push, two obstacles were diagnosed and resolved:
1. **GitHub 403 Permission Denied**:
   - *Cause*: Windows Credential Manager had cached credentials for `ramagoud830`, attempting to push to `akshitha-sangisetty`'s repository.
   - *Solution*: Added collaborator permissions / authenticated the authorized account.
2. **Divergent Remote Commits & 3-Way Merge**:
   - *Cause*: Remote had independent commits adding `Phase 1-5 enhancements` (live chart, goals bar, cooldown guard, audit exports).
   - *Solution*: Performed a clean merge, resolved conflicts in `frontend/app.js`, `frontend/index.html`, and `tests/test_scenarios.py` ensuring zero features from either branch were lost, and verified that all 8 automated tests passed.

---

### Phase 3: Vercel Static Hosting & Framework Diagnostics
Upon the initial Vercel deployment, two specific platform errors occurred:
1. **Error: `500 FUNCTION_INVOCATION_FAILED` & `No FastAPI entrypoint found`**:
   - *Cause*: Vercel scanned the project root, detected `app/` and `requirements.txt` (FastAPI), and activated its Python Serverless / Next.js App Router preset instead of serving static files.
   - *Solution*:
     - Created `.vercelignore` to exclude `app/`, `*.py`, `requirements.txt`, and database files.
     - Added `"framework": null` in `vercel.json`.
     - Configured **Root Directory** to `frontend` under Vercel's **Settings > Build and Deployment**.
2. **Fork Desynchronization**:
   - *Cause*: Vercel was linked to the personal fork `burugulasaigeethika/Pragyaan_AgentArchitects`, which was behind the upstream repository.
   - *Solution*:
     - Pushed the latest commits directly to the fork.
     - Configured Git dual-push remotes so `git push origin main` pushes simultaneously to both `akshitha-sangisetty` and `burugulasaigeethika`.

---

### Phase 4: Zero-Touch Global Access & Uptime Verification
1. **Cold-Start Handling**:
   - Woke up the Render free-tier container via HTTP health probe (`200 OK`).
2. **Universal Team Access**:
   - Set `window.API_BASE_URL = "https://pragyaan-agent-backend.onrender.com"` in `frontend/config.js`.
   - Pushed commit `21afbe0` to GitHub.
   - Now, any user who opens `https://pragyaan-agent-architects.vercel.app` on any device is instantly connected to the Render backend with full live telemetry.

---

## 4. Troubleshooting & Verification Reference Table

| Component | Test / Inspection Command | Expected Result | Status |
|---|---|---|:---:|
| **Backend Health** | `curl -s https://pragyaan-agent-backend.onrender.com/health` | `{"status":"ok","service":"pragyaan-agent-backend"}` | ? PASS |
| **Telemetry API** | `curl -s https://pragyaan-agent-backend.onrender.com/api/services` | JSON array of 2 services | ? PASS |
| **Unit Tests** | `pytest` | `8 passed in 0.34s` | ? PASS |
| **Frontend CDN** | `curl -I https://pragyaan-agent-architects.vercel.app` | `HTTP/2 200` | ? PASS |
| **CI/CD Pipeline** | `git push origin main` | Pushes to both repos; triggers auto-deploy | ? PASS |

---

## 5. Summary of Files Created & Modified

| File | Purpose |
|---|---|
| [`render.yaml`](./render.yaml) | Render Blueprint configuration (Python 3.11, build/start commands, env vars) |
| [`runtime.txt`](./runtime.txt) | Explicit Python version pinning for cloud containers (`python-3.11.9`) |
| [`vercel.json`](./vercel.json) | Vercel static routing, framework nullification, and asset rewrites |
| [`.vercelignore`](./.vercelignore) | Prevents Vercel from mistaking backend Python code for serverless functions |
| [`frontend/config.js`](./frontend/config.js) | Centralized live Render backend URL for universal zero-config access |
| [`frontend/app.js`](./frontend/app.js) | Dynamic API resolver (`apiUrl`), health monitoring, and UI modals |
| [`frontend/index.html`](./frontend/index.html) | Relative asset paths, backend status indicator button, and config modal |
| [`frontend/styles.css`](./frontend/styles.css) | Modern dark-mode styling for status pills, dots, and settings modal |
| [`app/main.py`](./app/main.py) | Added `/health` endpoint for Render uptime probes |
| [`tests/test_scenarios.py`](./tests/test_scenarios.py) | Added automated test for `/health` endpoint |
| [`pytest.ini`](./pytest.ini) | Terminal configuration for seamless test execution |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Operations manual and deployment guide |
