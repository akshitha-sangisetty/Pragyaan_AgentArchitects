# Cloud Guardian — Autonomous Cloud Cost Optimization System
> **Pragyaan Hackathon — Problem Statement 3**  
> *A closed-loop, multi-agent cloud cost optimization platform with deterministic safety gates, real-time telemetry, and memory.*

---

## 1. System Architecture

Cloud Guardian enforces a strict operational principle: **AI reasons and recommends, deterministic code controls and validates.**

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
                         │                 │  • Service health & cooldowns
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

## 2. Core Capabilities & Product Flow

### Dual-Path Operation
1. **Path A: Autonomous "Recommend"**
   - Developer submits a natural-language goal (e.g., *"Reduce unnecessary cost without breaking latency"*).
   - **Agent 1 (Investigator)** queries telemetry, checks timestamp freshness, and classifies the condition (`UNDER_UTILIZATION`, `RISING_TRAFFIC`, `STALE_METRICS`, etc.).
   - **Agent 2 (Optimizer)** proposes a right-sizing action (`scale_down`, `scale_up`, `no_action`) informed by past memory.
   - **Safety Engine** validates bounds and latency headroom deterministically.
   - **Agent 3 (Verifier)** observes the real cloud change and renders a **Before vs After** comparison table.
2. **Path B: Manual "What-If" Sliders**
   - Developer adjusts instance capacity directly on an interactive slider.
   - Instant pre-flight validation calculates whether the adjustment is **RECOMMENDED**, **NOT RECOMMENDED**, or **UNSAFE / BLOCKED** with clear justifications.

### Closed-Loop Verification & Step 9 Memory
- **Before vs After Verification:** The system does not assume success. It verifies that cost decreased and that latency/health SLAs were preserved.
- **Self-Healing & Rollback:** If performance degrades or an infrastructure error occurs (`capacity_unavailable`), the system alerts the developer and provides a 1-click rollback.
- **Optimization Memory:** Past outcomes are stored in SQLite (`optimization_history`) so Agent 2 remembers past latency spikes and avoids repeating mistakes.

---

## 3. Official Test Scenarios Handled

| Scenario | Situation | Agent Behavior | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **Test A: Cost Optimization** | `reports-worker` idle (0 RPM, 9% CPU, 4 instances). | Agent 1 diagnoses `UNDER_UTILIZATION` $\rightarrow$ Agent 2 proposes scale to 1 instance. | Spend cut by 75% (\$44 $\rightarrow$ \$11/hr); latency safe; Verifier confirms `SUCCESS`. |
| **Test B: Rising Traffic Trap** | `orders-api` traffic doubled (2100 $\rightarrow$ 4200 RPM); latency at 260ms (close to 300ms SLA). | Agent 1 diagnoses `RISING_TRAFFIC` $\rightarrow$ Agent 2 halts scale-down. | SLA protected; dangerous manual downscale attempts blocked. |
| **Test C: Stale Telemetry** | `checkout-api` metrics from 08:00 (age 150m); current time 10:30. | Agent 1 detects stale timestamp $\rightarrow$ pulls fresh live traffic (5200 RPM) $\rightarrow$ avoids downscaling. | Outage prevented; Safety Engine rejects actions on stale metrics. |
| **Test D: Failed Action** | `payment-api` at 91% CPU requests scale up $\rightarrow$ cloud API returns `capacity_unavailable`. | Verifier detects failed execution $\rightarrow$ logs failure to memory $\rightarrow$ flags recovery recommendation. | Error caught; system prompts fallback strategy instead of hanging. |

---

## 4. Quickstart Guide

### Prerequisites
- Python 3.10 or 3.11
- (Optional) Free Groq API key from [console.groq.com](https://console.groq.com) for live Qwen 2.5 inference. (A deterministic scenario fallback is built-in if no key is supplied).

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects.git
   cd Pragyaan_AgentArchitects
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment (Optional):**
   ```bash
   cp .env.example .env
   # Add your GROQ_API_KEY in .env if using live Qwen 2.5
   ```

4. **Run the Mission Control Server:**
   ```bash
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   Open your browser at **`http://localhost:8000`**.

5. **Run the Automated Test Suite:**
   ```bash
   python -m pytest tests/test_scenarios.py -v
   ```

---

## 5. Team Responsibilities & How to Improve

Now that the complete working foundation is implemented and verified, here is how each team member can contribute:

### **Member 1 (Workflow & Orchestration Lead)**
* **Focus:** Enhance `app/workflow.py` and API endpoints.
* **Next Steps:**
  - Add WebSocket/SSE streaming endpoints if desired for animated token-by-token streaming.
  - Implement multi-service batch optimization queues.

### **Member 2 (Simulation & Safety Lead)**
* **Focus:** Deepen `app/cloud_sim.py` and `app/safety_engine.py`.
* **Next Steps:**
  - Add more edge cases: cooldown timers (prevent scaling within 5 mins of previous action).
  - Add multi-zone capacity simulations (e.g. AWS `us-east-1a` vs `us-east-1b`).

### **Member 3 (Investigator AI Lead)**
* **Focus:** Tune `app/agents/investigator.py`.
* **Next Steps:**
  - Refine prompt engineering for complex metric correlations (e.g., memory leak detection where CPU is low but memory creeps to 95%).

### **Member 4 (Optimizer & Memory AI Lead)**
* **Focus:** Tune `app/agents/optimizer.py`, `app/agents/verifier.py`, and `app/database.py`.
* **Next Steps:**
  - Enhance SQLite memory querying (e.g., query similar time-of-day traffic patterns).
  - Add automated negotiation/discounting recommendations for reserved instances.

### **Member 5 (Mission Control UI/UX Lead)**
* **Focus:** Polish `frontend/index.html`, `frontend/styles.css`, `frontend/app.js`.
* **Next Steps:**
  - Add chart visualizations (e.g., Chart.js for real-time CPU/RPM time-series graphs).
  - Add exportable PDF/JSON audit reports for executive stakeholders.

---

## 6. The Winning Hackathon Pitch (3-Minute Script)

1. **The Hook (30s):**
   *"Cloud cost tools either do dumb alerts or blindly downscale services and cause outages. Pure LLMs hallucinate and delete production instances. Cloud Guardian solves this with a clear rule: **AI reasons and recommends, deterministic code controls and validates.**"*
2. **The Demo (90s):**
   - Click **Test A**: Click *Recommend* on `reports-worker`. Show the agent safely slashing cost by 75% and Agent 3 verifying Before vs After.
   - Click **Test B**: Show the agent refusing to downscale `orders-api` because traffic surged.
   - Click **Test C**: Show the agent detecting that metrics are from 08:00, pulling live 10:30 traffic, and refusing to make an uninformed change.
   - Switch to **Path B (Manual Slider)**: Show the instant pre-flight red badge when sliding instances below SLA boundaries.
3. **The Conclusion (30s):**
   *"With closed-loop verification and historical memory, Cloud Guardian ensures every dollar saved never compromises system uptime."*
