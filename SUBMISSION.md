# Hackathon Submission: Cloud Guardian
## Autonomous Closed-Loop Cloud Cost Optimization & Safety Gateway
**Problem Statement 3 — Pragyaan Hackathon**  
**Team Repository:** [https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects](https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects)

---

## 1. Executive Summary

Cloud spending is notoriously volatile. When alerts spike by 37%, engineering teams face an impossible dilemma:
1. **Traditional Auto-scalers (e.g. Kubernetes HPA / AWS Alarms):** Blindly react to raw threshold numbers (e.g., CPU > 70%). They cannot reason through multi-service dependencies, ignore metric freshness, and cause cascading outages under traffic shifts.
2. **Raw Generative AI:** Hallucinates unsafe configurations, deletes active production instances, and cannot guarantee deterministic compliance with SLA boundaries.

**Cloud Guardian** bridges this divide with an architectural mandate:  
> **AI reasons, diagnoses, and recommends — deterministic code validates, executes, and controls.**

Cloud Guardian is a multi-agent closed-loop optimization system powered by **3 genuine AI agents**, a **deterministic Python Safety Engine**, **real-time telemetry monitoring**, and **Step 9 historical memory**, all accessible via an interactive dark-mode Mission Control web dashboard.

---

## 2. Core Architecture

```
                           LIVE CLOUD STATE
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   MONITORING    │  (Live telemetry & metrics)
                         └────────┬────────┘
                                  │
                   User clicks [ Recommend ] 
                   OR moves [ Manual Slider ]
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ AGENT 1 (AI)    │
                         │ INVESTIGATOR    │  "What is happening?"
                         │                 │  • Fact collection & freshness check
                         │                 │  • Situational context & diagnosis
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ AGENT 2 (AI)    │
                         │ OPTIMIZER       │  "What should we do?"
                         │                 │  • Action recommendation with reasoning
                         │                 │  • Evaluates manual change proposals
                         │                 │  • Queries past optimization memory
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ SAFETY ENGINE   │  [DETERMINISTIC GATEWAY]
                         │ (Python Code)   │  • Min/Max instances, Latency SLA
                         │                 │  • Service health, Cooldown, Budget cap
                         └────────┬────────┘
                                  │
                  ┌───────────────┴───────────────┐
          [If Approved]                   [If Rejected / Unsafe]
                  │                                       │
                  ▼                                       ▼
       ┌─────────────────┐                     ┌─────────────────┐
       │ APPLY ACTION    │                     │ Block & Explain │
       │ (Simulated API) │                     │ Exact Reason    │
       └────────┬────────┘                     └─────────────────┘
                │
                ▼
       ┌─────────────────┐
       │ AGENT 3 (AI)    │
       │ VERIFIER        │  "Did it actually work?"
       │                 │  • Before vs After diff
       │                 │  • Detects SLA breaches / degradation
       └────────┬────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
   [SUCCESS]         [DEGRADED / FAILURE]
       │                 │
       ▼                 ▼
  Save to Memory    Recommend Rollback / Recovery
```

---

## 3. The 3 Specialized AI Agents

### Agent 1: Investigator Agent — *"What is happening?"*
- **Role:** Observes raw telemetry, evaluates observation timestamps against the real-time reference clock, and synthesizes root-cause diagnoses.
- **Key Intelligence:** Detects **stale telemetry** (e.g. 08:00 metrics when the clock is 10:30) and autonomously pulls fresh live traffic streams before allowing any downstream actions.
- **Categorical Diagnoses:** `UNDER_UTILIZATION`, `RISING_TRAFFIC`, `STALE_METRICS`, `CRITICAL_LOAD`, `HEALTHY_STABLE`.

### Agent 2: Optimizer Agent — *"What should we do?"*
- **Role:** Evaluates rightsizing options and trade-offs.
- **Dual Paths:**
  - **Path A (Autonomous):** Proposes action (`scale_down`, `scale_up`, `no_action`) with plain-language justification, projected cost delta, and expected latency impact.
  - **Path B (Manual "What-If" Sliders):** Evaluates developer-proposed slider adjustments in real-time (`RECOMMENDED`, `NOT_RECOMMENDED`, `UNSAFE_BLOCKED`).
- **Memory Integration:** Queries SQLite `optimization_history` before acting to ensure it never repeats an aggressive downscale that previously caused latency spikes.

### Agent 3: Verifier Agent — *"Did it actually work?"*
- **Role:** Inspects the live environment **after** an action executes.
- **Key Intelligence:** Does not assume success just because an API returned 200.
- **Outcome Assessment:**
  - **SUCCESS:** Cost decreased, health preserved, SLA maintained $\rightarrow$ commits record to memory.
  - **DEGRADED / FAILED:** If latency breaches SLA or the cloud API returns `capacity_unavailable`, it catches the regression, warns the operator, and surfaces a 1-click **Rollback to Safe State**.

---

## 4. Why Safety Engine is NOT an AI Agent

In enterprise infrastructure, **non-negotiable constraints must never hallucinate**. The Safety Engine is written in pure, deterministic Python code enforcing:
1. **Instance Boundaries:** `min_instances <= target <= max_instances`.
2. **Latency SLA Boundaries:** Blocks any scale-down that would breach `max_latency_ms`.
3. **Observation Freshness:** Rejects optimization on telemetry older than 15 minutes.
4. **Health Gates:** Prohibits downscaling unhealthy services.
5. **Anti-Thrashing Cooldown Guard:** Prevents rapid back-to-back capacity changes within the cooldown window.
6. **Hourly Budget Cap:** Blocks scale-up actions that exceed the developer's configured hourly cloud budget.

---

## 5. Demonstration Scenarios (Official Problem Cases)

| Scenario | Situation | Agent Behavior | Verification Outcome |
| :--- | :--- | :--- | :--- |
| **Test A: Cost Optimization** | `reports-worker` idle (0 RPM, 9% CPU, 4 instances). | Agent 1: `UNDER_UTILIZATION` $\rightarrow$ Agent 2 proposes 4 $\rightarrow$ 1 instances. | **SUCCESS:** Spend cut 75% (\$44 $\rightarrow$ \$11/hr); latency preserved at 0ms. |
| **Test B: Rising Traffic Trap** | `orders-api` traffic doubled (2100 $\rightarrow$ 4200 RPM); latency at 260ms (SLA 300ms). | Agent 1 flags `RISING_TRAFFIC` $\rightarrow$ Agent 2 refuses downscaling to defend SLA. | **SLA DEFENDED:** Dangerous scale-downs halted; manual slider attempt marked `NOT_RECOMMENDED`. |
| **Test C: Stale Telemetry** | `checkout-api` metrics from 08:00 (age 150m); reference clock 10:30. | Agent 1 detects stale timestamp $\rightarrow$ fetches fresh 10:30 traffic (5200 RPM) $\rightarrow$ halts scale down. | **OUTAGE PREVENTED:** Action blocked until fresh telemetry verified. |
| **Test D: Action Failure** | `payment-api` under critical load (91% CPU); cloud API returns `capacity_unavailable`. | Verifier detects failed execution $\rightarrow$ logs failure to memory $\rightarrow$ recommends fallback. | **RECOVERY TRIGGERED:** System halts gracefully and logs failure for future avoidance. |

---

## 6. Technical Stack

- **LLM Reasoning Engine:** Qwen 2.5 (`qwen-2.5-32b`) hosted on **Groq LPUs** (sub-second inference at ~500 tokens/sec), with Google Gemini 2.0 Flash backup and deterministic demo scenario fallback.
- **Backend & APIs:** Python 3.11, FastAPI, Uvicorn, Pydantic V2.
- **Database & Storage:** SQLite (`cloud_optimizer.db`) with 4 tables: `services`, `user_goals`, `audit_log`, `optimization_history`.
- **Frontend / Mission Control:** HTML5, CSS3 (glassmorphic dark console aesthetic), JavaScript (Vanilla), Chart.js (real-time telemetry graphs).
- **Validation:** Automated test suite with **7 passing tests in 0.27s**.

---

## 7. Innovation & Differentiation (Why This Wins)

1. **Beyond Static Chat:** Replaces text-only chatbots with an interactive **Mission Control Canvas** featuring live telemetry, interactive What-If sliders, and Before vs. After diff cards.
2. **Closed-Loop Verification:** Checks actual post-action reality instead of blind tool execution.
3. **Step 9 Memory / Continuous Learning:** Remembers past failures so subsequent agent runs avoid repeating costly mistakes.
4. **Sub-Second Execution:** Powered by Groq LPU inference, running the complete 3-agent pipeline in **under 2 seconds**.
5. **1-Click Stakeholder Reports:** Generates exportable JSON/CSV compliance audit trails instantly.

---

## 8. Quickstart & Verification

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run automated test suite
python -m pytest tests/test_scenarios.py -v

# 3. Launch Mission Control Web Console
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open **`http://localhost:8000`** in any browser.
