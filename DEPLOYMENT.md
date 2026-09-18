# Cloud Guardian — Deployment & CI/CD Guide

This guide walks you through deploying **Cloud Guardian (Autonomous Cloud Cost Optimization Engine)**:
- **Backend**: Hosted on [Render](https://render.com) (Python FastAPI Web Service)
- **Frontend**: Hosted on [Vercel](https://vercel.com) (High-performance global edge CDN)
- **CI/CD**: Every push to the `main` branch on GitHub automatically builds and deploys both services!

---

## Architecture Overview

```
                        +------------------------------+
                        ¦        GitHub Repo           ¦
                        ¦  (akshitha-sangisetty/...)   ¦
                        +------------------------------+
                                       ¦
                      git push origin main (Auto Trigger)
                                       ¦
              +-------------------------------------------------+
              ?                                                 ?
   +----------------------+                          +----------------------+
   ¦    Render Backend    ¦                          ¦    Vercel Frontend   ¦
   ¦  (Python 3.11/FastAPI¦                          ¦ (Static Edge Hosting)¦
   ¦   + Groq/Gemini LLM) ¦                          ¦                      ¦
   ¦  https://...onrender ¦                          ¦  https://...vercel   ¦
   +----------?-----------+                          +----------------------+
              ¦                                                 ¦
              +-------------- REST API / CORS ------------------+
```

---

## Part 1: Deploy Backend to Render

### Method A: 1-Click Blueprint (Recommended)
Because this repository contains [`render.yaml`](./render.yaml), Render can automatically configure the service:

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right, then select **Blueprint**.
3. Connect your GitHub account and select this repository: `akshitha-sangisetty/Pragyaan_AgentArchitects`.
4. Render will read `render.yaml` and prompt you for the environment variables:
   - `GROQ_API_KEY`: Enter your free Groq API key from [Groq Console](https://console.groq.com).
   - `GEMINI_API_KEY`: (Optional) Your Google Gemini API key.
5. Click **Apply**.
6. Render will build and deploy your backend. Once deployed, copy your backend URL (e.g., `https://pragyaan-agent-backend.onrender.com`).

---

### Method B: Manual Web Service Setup
If you prefer creating the Web Service manually:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository `Pragyaan_AgentArchitects`.
3. Fill in the following configuration:
   - **Name**: `pragyaan-agent-backend`
   - **Region**: Oregon or Frankfurt
   - **Branch**: `main`
   - **Root Directory**: `.` (leave blank)
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
4. Under **Advanced**, add the following **Environment Variables**:
   | Variable | Value | Notes |
   |---|---|---|
   | `PYTHON_VERSION` | `3.11.9` | Matches `runtime.txt` |
   | `LLM_PROVIDER` | `groq` | Options: `groq`, `gemini`, or `demo` |
   | `GROQ_API_KEY` | `gsk_...` | From https://console.groq.com |
   | `GROQ_MODEL` | `qwen-2.5-32b` | Default primary model |
   | `GEMINI_API_KEY` | `AIza...` | (Optional backup) |
   | `GEMINI_MODEL` | `gemini-2.0-flash` | (Optional backup) |
5. Under **Health Check Path**, enter: `/health`.
6. Ensure **Auto-Deploy** is set to **Yes**.
7. Click **Create Web Service**.
8. Copy your Render service URL (e.g., `https://pragyaan-agent-backend.onrender.com`).

---

## Part 2: Deploy Frontend to Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository: `akshitha-sangisetty/Pragyaan_AgentArchitects`.
4. In the configuration screen:
   - **Project Name**: `pragyaan-agentarchitects` (or any name you prefer)
   - **Framework Preset**: `Other`
   - **Root Directory**: Click **Edit** and choose `frontend` (or keep `./`, as both [`vercel.json`](./vercel.json) and [`frontend/vercel.json`](./frontend/vercel.json) are provided).
5. Click **Deploy**.
6. Vercel will complete the deployment in ~15 seconds and provide your live URL (e.g. `https://pragyaan-agentarchitects.vercel.app`).

---

## Part 3: Connect Frontend to Your Render Backend

You can connect the frontend to the backend in **either** of two ways:

### Option A: In the UI (Instant — No Git Commit Needed)
1. Open your live Vercel URL in your browser.
2. In the top navigation bar, click the **`API: Direct`** button (or ?? button).
3. In the modal that appears, paste your Render URL:
   `https://pragyaan-agent-backend.onrender.com`
4. Click **Save & Connect**.
5. The status badge will turn **green** (?? Connected) and immediately load the cloud telemetry!
*(This setting is saved in your browser's localStorage).*

### Option B: In Code (Permanent for all visitors)
1. Open [`frontend/config.js`](./frontend/config.js).
2. Set your Render URL:
   ```javascript
   window.API_BASE_URL = "https://pragyaan-agent-backend.onrender.com";
   ```
3. Commit and push to GitHub:
   ```bash
   git add frontend/config.js
   git commit -m "Configure live Render backend URL"
   git push origin main
   ```
4. Vercel will automatically redeploy the frontend with the live backend URL configured for everyone!

---

## Part 4: How Automatic GitHub Deployment (CI/CD) Works

Both Render and Vercel are now connected to your GitHub repository:

1. **Whenever you push to GitHub**:
   ```bash
   git add .
   git commit -m "Your new feature or update"
   git push origin main
   ```
2. **Render**:
   - Detects the new commit on `main`.
   - Automatically runs `pip install -r requirements.txt`.
   - Starts the updated server and verifies the `/health` endpoint.
   - Switches traffic with zero downtime.
3. **Vercel**:
   - Detects the new commit on `main`.
   - Automatically re-publishes static assets across Vercel’s global Edge CDN.
   - New changes are live globally in seconds.

---

## Part 5: Verification & Testing Checklist

- [ ] **Backend Health Check**:
  Visit `https://<YOUR-RENDER-APP>.onrender.com/health` in your browser.
  It should return:
  ```json
  {"status":"ok","service":"pragyaan-agent-backend"}
  ```
- [ ] **Frontend Live View**:
  Visit your Vercel URL `https://<YOUR-VERCEL-APP>.vercel.app`.
  The top status bar should show **API: [Your-Backend]** with a green pulse dot.
- [ ] **Test Autonomous Optimization**:
  Click the **Recommend** button in the dashboard to verify that Agent 1 (Investigator), Agent 2 (Optimizer), and Safety Engine execute properly.
- [ ] **Test Auto-Deploy**:
  Make a small commit (e.g. edit a comment or text), run `git push origin main`, and watch both the Render and Vercel dashboards trigger builds automatically.

---

## Troubleshooting

- **Cold Starts on Render Free Tier**:
  Render free tier services spin down after 15 minutes of inactivity. The first request after a period of inactivity may take 30–50 seconds while the instance spins up. The frontend automatically displays a status dot to indicate connection state.
- **CORS Issues**:
  CORS is enabled for all origins (`allow_origins=["*"]`) in `app/main.py`. If you change domains, requests will continue to work without CORS errors.
- **LLM Fallback**:
  If no `GROQ_API_KEY` is provided, the backend transparently falls back to deterministic simulation mode so the application never crashes during live presentations.
