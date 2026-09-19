# Complete Deployment Process Guide

This document details the exact, step-by-step process we used to deploy **Cloud Guardian** to **Render** (Backend) and **Vercel** (Frontend) with automated GitHub CI/CD.

---

## Stage 1: Preparing the Codebase for Cloud Deployment

### 1. Configure the Backend for Render
1. **Created `render.yaml`** (Infrastructure as Code):
   - **Type**: Web Service
   - **Runtime**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `true`
2. **Created `runtime.txt`**:
   - Pinned `python-3.11.9` for container consistency.
3. **Added Health Probe Endpoint in `app/main.py`**:
   ```python
   @app.get("/health")
   def health_check():
       return {"status": "ok", "service": "pragyaan-agent-backend"}
   ```

### 2. Configure the Frontend for Vercel
1. **Decoupled API Endpoints in `frontend/app.js`**:
   - Built a dynamic URL resolver `apiUrl(endpoint)` that prepends `window.API_BASE_URL` or `localStorage` to all API calls.
   - Converted all 11+ fetch calls from relative `/api/...` to `apiUrl('/api/...')`.
2. **Created `frontend/config.js`**:
   - Centralized the backend URL so all team members connect automatically:
     ```javascript
     window.API_BASE_URL = "https://pragyaan-agent-backend.onrender.com";
     ```
3. **Configured `vercel.json` & `.vercelignore`**:
   - Excluded backend files (`app/`, `*.py`, `requirements.txt`) so Vercel does not try to run Python serverless functions.
   - Set `"framework": null` and `"outputDirectory": "frontend"`.
4. **Updated `frontend/index.html`**:
   - Changed asset links to relative paths (`styles.css`, `app.js`, `config.js`).
   - Added a live backend connection status indicator and settings modal in the header.

---

## Stage 2: Deploying the Backend on Render

1. **Logged in to Render** ([dashboard.render.com](https://dashboard.render.com)).
2. **Created the Service**:
   - Clicked **New +** > **Blueprint** (or **Web Service**).
   - Connected the GitHub repository `Pragyaan_AgentArchitects`.
   - Name: `pragyaan-backend` (or `pragyaan-agent-backend`).
   - Branch: `main`.
3. **Set Environment Variables**:
   - `LLM_PROVIDER`: `groq`
   - `GROQ_MODEL`: `qwen-2.5-32b`
   - `GROQ_API_KEY`: *(entered free key from console.groq.com)*
   - `PYTHON_VERSION`: `3.11.9`
4. **Deployed**:
   - Clicked **Apply / Deploy**.
   - Render ran `pip install -r requirements.txt` and started `uvicorn`.
   - Verified the status turned green (**Live**) and copied the backend URL:
     `https://pragyaan-agent-backend.onrender.com`

---

## Stage 3: Deploying the Frontend on Vercel

1. **Logged in to Vercel** ([vercel.com](https://vercel.com)).
2. **Imported the Project**:
   - Clicked **Add New...** > **Project**.
   - Selected repository: `Pragyaan_AgentArchitects`.
3. **Configured Build & Deployment Settings**:
   - **Root Directory**: Set to **`frontend`** *(Critical step: prevents Vercel from mistaking the project for a Python backend)*.
   - **Framework Preset**: Set to **`Other`**.
4. **Deployed**:
   - Clicked **Deploy**.
   - Vercel deployed the static HTML/CSS/JS to its global Edge CDN in ~10 seconds.
   - Primary domain generated: `https://pragyaan-agent-architects.vercel.app`

---

## Stage 4: Connecting Frontend to Backend

1. **Baked in the URL**:
   - Set `window.API_BASE_URL = "https://pragyaan-agent-backend.onrender.com"` in `frontend/config.js`.
2. **In-App Dynamic Override**:
   - Added an interactive modal in `frontend/index.html` accessible by clicking the **`API: Direct`** button in the header.
   - Allows anyone to test or update the backend URL directly in the browser.

---

## Stage 5: Configuring Automated CI/CD (Dual-Push)

To ensure that every Git push automatically updates both repositories (the upstream repo and your fork):

1. **Configured Dual-Push Remotes**:
   ```bash
   git remote set-url --add --push origin https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects.git
   git remote set-url --add --push origin https://github.com/burugulasaigeethika/Pragyaan_AgentArchitects.git
   ```
2. **How Automatic Deployment Works Now**:
   Whenever you run:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
   - **Git** pushes simultaneously to both GitHub repositories.
   - **Render** detects the push on `main` and automatically redeploys the backend.
   - **Vercel** detects the push on `main` and automatically redeploys the frontend.
   - **Zero manual steps required.**
