Cloud Guardian: Autonomous Cloud Cost Optimization System

1. Team Details

Team Name / ID: AgentArchitects

Team Lead: Samanvi Chidambaram

Team Members:
Samanvi Chidambaram | System Architecture, Agent Design & AI Integration
Sangi Setty Akshitha | System Architecture, AI Design & UI/UX
Burugula Saigeethika | Deployment & Backend Integration
Rachakonda Joshitha | Backend Development & Agent Integration
Palla Hari Priya | Cloud Simulation, Safety & Testing

Repo Link (Optional): https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects.git

Demo Link (Optional): https://pragyaan-agent-architects.vercel.app

2. Problem Statement

The Cloud Bill That Wouldn't Stop Growing

Context
It is Monday morning; your team receives an alert:
"Cloud spending is 37% higher than expected."
Nobody knows why. Your company operates several backend services. Each service exposes information such as:
* CPU utilization
* Memory utilization
* Request count
* Response latency
* Number of running instances
* Current hourly cost
* Recent traffic
* Availability

The Challenge
Build an autonomous cloud cost-optimization agent that monitors a simulated cloud environment, investigates unexpected spending, chooses safe actions, executes them through APIs, and verifies whether the action actually improved the situation.
The agent receives natural-language requests and structured cloud state. AI must play a meaningful role in deciding what to investigate and what action to take; deterministic backend code must enforce safety constraints.

Core Requirements
* Accept a natural-language request together with the supplied service/environment data.
* Inspect service metrics, traffic, health, instance counts, pricing, constraints, and recent events through APIs/tools.
* Choose among available actions such as scale up, scale down, resize, stop an idle service, delay a batch workload, or take no action.
* Respect minimum/maximum capacity, latency, availability, and health constraints.
* Handle stale observations, changing conditions, failed actions, and post-action verification.
* Return a final response explaining the observed problem, action taken or not taken, and verification result.

Test Input A — Cost Optimization Request
User prompt:
"Review the current services and reduce unnecessary cost without breaking the latency or availability requirements."

services.json:
[
  {
    "service_id": "orders-api",
    "cpu_percent": 22,
    "memory_percent": 41,
    "requests_per_minute": 1200,
    "latency_ms": 180,
    "instances": 6,
    "cost_per_hour": 18.50,
    "min_instances": 2,
    "max_instances": 8,
    "max_latency_ms": 300,
    "healthy": true,
    "timestamp": "2026-09-17T10:30:00Z"
  },
  {
    "service_id": "reports-worker",
    "cpu_percent": 9,
    "memory_percent": 15,
    "requests_per_minute": 0,
    "latency_ms": 0,
    "instances": 4,
    "cost_per_hour": 11.00,
    "min_instances": 1,
    "max_instances": 6,
    "max_latency_ms": 900,
    "healthy": true,
    "timestamp": "2026-09-17T10:30:00Z"
  }
]

Test Input B — Rising Traffic
User prompt:
"Orders traffic is increasing. Keep the service within its latency target."

service.json:
{
  "service_id": "orders-api",
  "cpu_percent": 28,
  "memory_percent": 48,
  "requests_per_minute": 4200,
  "previous_requests_per_minute": 2100,
  "latency_ms": 260,
  "instances": 4,
  "cost_per_hour": 18.50,
  "min_instances": 2,
  "max_instances": 8,
  "max_latency_ms": 300,
  "healthy": true,
  "timestamp": "2026-09-17T10:30:00Z"
}

Test Input C — Stale Observation
User prompt:
"Reduce cost if it is safe."

metric.json:
{
  "service_id": "checkout-api",
  "cpu_percent": 24,
  "memory_percent": 39,
  "requests_per_minute": 900,
  "latency_ms": 170,
  "instances": 5,
  "cost_per_hour": 20.00,
  "min_instances": 2,
  "max_instances": 8,
  "max_latency_ms": 250,
  "healthy": true,
  "timestamp": "2026-09-17T08:00:00Z"
}

latest_traffic.json:
{
  "service_id": "checkout-api",
  "requests_per_minute": 5200,
  "timestamp": "2026-09-17T10:30:00Z"
}

Test Input D — Failed Action
User prompt:
"Scale the payment service only if the current state requires it."

service.json:
{
  "service_id": "payment-api",
  "cpu_percent": 91,
  "memory_percent": 82,
  "requests_per_minute": 6400,
  "latency_ms": 410,
  "instances": 3,
  "cost_per_hour": 22.00,
  "min_instances": 2,
  "max_instances": 8,
  "max_latency_ms": 300,
  "healthy": true,
  "timestamp": "2026-09-17T10:30:00Z"
}

action_result.json:
{
  "action_id": "act-784",
  "action": "scale_up",
  "requested_instances": 5,
  "status": "failed",
  "error": "capacity_unavailable"
}

3. TL;DR

Problem: Conventional scaling optimizes single metrics without considering broader cost, traffic, latency, or safety rules.
Solution: Cloud Guardian uses 3 AI agents for analysis, deterministic safety rules for execution, and closed-loop verification.
Who benefits: DevOps, SRE, and FinOps teams reduce cloud waste safely without production downtime, alert fatigue, or manual toil.

4. Scope of the Project

What are you building?
An autonomous cloud cost optimization system with 3 cooperating AI agents (Investigator, Optimizer, Verifier), a deterministic Python safety gateway, a simulated cloud environment, persistent SQLite memory, and an interactive Mission Control dashboard. It monitors telemetry, rightsizes services contextually, blocks unsafe actions, executes safe scaling, and verifies outcomes closed-loop.

How does it solve the problem statement?
It replaces rigid rules with contextual AI trade-off reasoning while guaranteeing safety: the Investigator detects issues, the Optimizer plans rightsizing, deterministic code strictly validates constraints, the Verifier audits diffs, and the orchestrator handles recovery.

Key features you're building for this hackathon:
3-Agent closed loop: Investigator analyzes, Optimizer plans, Verifier audits outcomes.
Deterministic Python safety gateway enforcing instance bounds, latency SLAs, budget, and cooldown.
Mission Control UI with real-time Chart.js telemetry, what-if sliders, and CSV/JSON audit exports.
Persistent SQLite memory tracking past optimizations to inform future scaling decisions.
Closed-loop verification comparing before-and-after state with guided one-click rollback.

What are you deliberately NOT doing? (Optional)
Direct write access to live production cloud providers (AWS/GCP/K8s) and predictive multi-region spot instance bidding, keeping the hackathon focus on safe closed-loop decision making.

5. Why an Agentic Approach?

What does your agent decide or do on its own?
Our agents autonomously diagnose conditions (under-utilization vs traffic surge), check telemetry freshness (<15m) and fetch live data if stale, reason over cost-performance trade-offs to propose rightsizing actions, detect post-action execution failures or SLA regressions during verification, and signal the orchestrator to trigger rollback recovery or record learned outcomes to SQLite memory.

Why wouldn't a fixed script, if-else rules, or a simple chatbot be enough?
Static scripts scale on single metrics, blindly cutting capacity during silent traffic surges or stalling on stale data. Chatbots only offer passive text without execution or verification. Cloud Guardian pairs flexible AI contextual reasoning with deterministic safety gates and closed-loop verification, ensuring decisions adapt to complex multi-dimensional telemetry while remaining safe.

6. Who It's For & What Changes

Who or what is this for?
DevOps, SRE, and FinOps teams managing cloud microservices who need contextual cost optimization without risking production downtime or SLA breaches.

The world today, without your solution:
SREs battle unexpected cloud bills while fearing outages. To stay safe, teams overprovision capacity by 30-50%. Meanwhile, rigid autoscaling policies react blindly to single-metric blips, scaling down into silent traffic surges. Engineers spend hours on manual rightsizing audits, yet still suffer budget overruns and alert fatigue when cloud costs surge unexpectedly.

The world with your solution, fully built and scaled to production:
Cloud infrastructure rightsizes contextually around the clock. The system can autonomously identify cost-saving opportunities while enforcing configured latency, capacity, budget, freshness, and cooldown constraints. Optimization memory provides continuous learning across multi-service fleets, replacing manual rightsizing audits with verified automation.

What your hackathon build actually delivers today:
A functional closed-loop system: 3 cooperating AI agents, a deterministic safety gateway, SQLite memory, and an interactive Mission Control dashboard. It reliably handles all 4 hackathon scenarios: idle service downscaling (Test A), rising traffic protection (Test B), stale telemetry recovery (Test C), and API capacity failure handling (Test D).

Before vs. After

What Changes | Today | With Our Current Build | At Production Scale
Cloud Cost Rightsizing | Manual audits; 30-50% overprovisioning waste | Contextual rightsizing cuts idle costs safely | Continuous zero-touch optimization across multi-cloud
Outage Risk from Scaling | Single-metric rules scale into traffic spikes | Unsafe actions are blocked by deterministic safety rules | Continuous closed-loop governance with guided rollbacks
Handling Stale Telemetry | Ignored; systems scale on outdated metrics | Investigator flags stale data and pulls live traffic | Distributed telemetry mesh with autonomous freshness checks
Post-Action Verification | Delayed alerts or user complaints after outages | Verifier audits health diffs and prompts recovery | Real-time closed-loop monitoring with automated self-healing

7. Architecture & Agents

How is your system put together?
Mission Control sends telemetry to the Investigator ('What is happening?'). The Optimizer ('What should we do?') evaluates goals and memory. The Deterministic Safety Gateway ('Is this allowed?') validates constraints. Approved actions execute via Cloud Simulator API. The Verifier ('Did it work?') detects outcome status, and the orchestrator handles recovery or records success to memory.

7.1 Agents
Investigator Agent: Diagnoses state and checks data freshness (<15m). Inputs: CPU, memory, RPM, latency, health. Outputs: situation diagnosis and evidence. Uses Qwen on Groq for fast inference.
Optimizer Agent: Formulates rightsizing plans balancing cost vs risk. Inputs: investigation, goals, memory. Outputs: recommended action, target, reasoning. Uses Qwen on Groq for trade-off reasoning.
Verifier Agent: Audits post-action state, detects API failures or SLA regressions, and provides the result to the workflow recovery mechanism for rollback or re-planning. Uses Qwen on Groq.

7.2 Services, APIs, Databases & Memory
Deterministic Safety Gateway (Python): Validates instance bounds, latency SLAs, budget caps, and cooldowns. Used by Optimizer.
Cloud Simulator API (mocked cloud provider): Simulates container scaling, latency load curves, and capacity failures. Used by all agents.
SQLite Database (storage): Stores live service state, audit logs, developer goals, and optimization history. Used by agents and backend.
Mission Control (Web UI): Dark-mode console with live Chart.js graphs, audit logs, and interactive what-if sliders. Used by developers.

How does your system remember things (memory & state)?
Past actions and verification outcomes persist in SQLite optimization_history. The Optimizer queries this memory before acting and uses previous optimization outcomes as additional context for future decisions.

Diagram Link (Optional): https://github.com/akshitha-sangisetty/Pragyaan_AgentArchitects#1-system-architecture

7.3 Example Walkthrough

Example input: User prompt: "Review current services and reduce unnecessary cost without breaking latency" on reports-worker (0 RPM, 4 nodes, $11/hr).
1. [Mission Control] Passes optimization request and live service telemetry to Investigator Agent. (uses: FastAPI backend)
2. [Investigator Agent] Validates data freshness, diagnoses UNDER_UTILIZATION (0 RPM, 9% CPU), and passes context to Optimizer.
3. [Optimizer Agent] Queries previous runs (uses: SQLite memory) and formulates action to scale from 4 to 1 instances, saving $8.25/hr.
4. [Safety Gateway] Verifies target (1) >= min_instances (1) and projected latency stays well within 900ms SLA.
5. [Orchestrator] Executes approved scaling action on infrastructure. (uses: Cloud Simulator API)
6. [Verifier Agent] Inspects fresh post-action state, verifies latency remains 0ms and health is green, and records success to DB.
7. [Mission Control] Displays Before vs After diff table (4 to 1 nodes, $11 to $2.75/hr) and marks status verified.
Final output: reports-worker safely scaled from 4 to 1 instance, saving $8.25/hr with verified 0ms latency, SLA compliance, and updated memory.

Anything special about how your workflow runs? (Optional)
The Verifier detects failed or degraded outcomes, while the deterministic orchestrator performs recovery. In Test D, when Cloud API returns capacity_unavailable, the Verifier catches that the action failed to produce the intended state, records the failure in memory to provide context for future decisions, and prompts a one-click rollback.

8. Tech Stack

Layer | Technology
Frontend / Interface | Vanilla JS, HTML5, CSS3 Glassmorphism, Chart.js
Backend | Python 3.11, FastAPI, Uvicorn, Pydantic V2
Agent Framework | Custom Python multi-agent closed-loop orchestrator
Database / Storage | SQLite (services, audit_log, optimization_history)
Hosting | Localhost / Render (Backend) & Vercel (Frontend)
Other | Groq LPUs (Qwen), Google Gemini 2.0 Flash

9. What to Expect From Our Current Build

Working:
3-Agent closed loop (Investigator, Optimizer, Verifier) powered by Groq-hosted Qwen inference with Gemini fallback.
Deterministic Python Safety Gateway strictly enforcing instance bounds, latency SLAs, budget caps, and cooldowns.
Mission Control console with real-time Chart.js telemetry, interactive what-if sliders, and CSV/JSON audit exports.
Step 9 persistent memory in SQLite providing previous outcomes as additional context when making new decisions.
Closed-loop verification comparing before-vs-after metrics with guided one-click rollback recovery.

Partly working, mocked, or hard-coded:
Cloud environment is simulated (cloud_sim.py) with realistic load and latency curves rather than live AWS billing.
Telemetry generates bounded natural jitter and scenario data rather than an external Prometheus/Datadog agent.

Not working or not built yet:
Direct production API write credentials for live AWS EC2, ECS, or Kubernetes cluster auto-scalers.
Multi-region automated spot instance bidding and predictive load-forecasting models.

What we'd most like to be judged on:
Our architectural balance: AI agents handle contextual reasoning and trade-offs, while a deterministic safety gateway enforces configured constraints, backed by closed-loop verification where the Verifier detects issues and the orchestrator performs recovery.

10. Future Scope

Idea 1
Name: Live Kubernetes & AWS CloudWatch Connector
What it is: A production connector streaming live CloudWatch metrics and applying scaling directly to Kubernetes Horizontal Pod Autoscalers.
Why it matters: Extends the prototype toward production cloud environments, enabling native scaling on enterprise Kubernetes clusters.
How we'd build it: Use boto3 and kubernetes-client Python libraries to ingest live metrics and patch deployment replica counts safely.
Done when: Agent observes live metrics on a real EKS or minikube cluster and adjusts pod counts within SLA limits.

Idea 2
Name: Predictive Forecasting & Spot Bidding
What it is: An intelligence agent forecasting traffic surges 30 minutes in advance and opportunistically acquiring AWS Spot instances.
Why it matters: Eliminates reactive scaling lag before traffic spikes hit and optimizes compute spend using AWS Spot instance pricing.
How we'd build it: Integrate Prophet/ARIMA time-series models with AWS EC2 Spot pricing APIs to automate instance lifecycle transitions.
Done when: Preemptively scales capacity before a simulated flash sale surge and switches to spot nodes without downtime.

Idea 3 (Optional)
Name: Slack Bot & Human Approval Workflows
What it is: A human-in-the-loop Slack integration notifying SREs of high-impact scaling proposals and handling 1-click approvals.
Why it matters: Gives engineering leadership full governance and compliance visibility before changes touch Tier-1 production services.
How we'd build it: Build a webhook listener using Slack Bolt for Python to dispatch interactive approval cards and post verification diffs.
Done when: An SRE clicks Approve in Slack, triggering safe execution and returning an instant verification report.

11. Additional Notes (Optional)
Cloud Guardian creates a closed loop: Investigate → Decide → Validate → Execute → Verify → Recover/Learn. Verified across all 4 hackathon scenarios: under-utilization (Test A, saving up to 75% on idle workers), rising traffic defense (Test B), stale telemetry recovery (Test C), and action failure recovery (Test D). A 7/7 test suite confirms safety gates. Groq-hosted Qwen inference, Gemini backup, and an offline mode ensure reliable evaluation under all network conditions.
