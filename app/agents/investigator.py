"""
Agent 1: Investigator Agent
Answers the core question: "What is happening?"

Responsibilities:
1. Gathers facts from tools: metrics, traffic, health, latency, instances, cost.
2. Evaluates observation freshness against the reference clock (15 min threshold).
3. If stale data is detected, queries fresh live traffic before proceeding.
4. Synthesizes evidence to produce a situational diagnosis:
   - UNDER_UTILIZATION (e.g. low CPU + idle traffic)
   - RISING_TRAFFIC (e.g. RPM surging towards latency boundary)
   - STALE_METRICS (e.g. metrics from 08:00 when time is 10:30)
   - CRITICAL_LOAD (e.g. high CPU > 85%, latency breach)
   - HEALTHY_STABLE
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas import ServiceState, ServiceInvestigation, InvestigationReport
from app.cloud_sim import get_service_state, check_freshness, get_latest_traffic
from app.llm_client import llm_client


def run_investigation(
    services: List[ServiceState],
    user_prompt: str = "",
    current_time: str = "2026-09-17T10:30:00Z"
) -> InvestigationReport:
    """Execute Agent 1 investigation across all target services."""
    investigations: List[ServiceInvestigation] = []

    for svc in services:
        freshness_info = check_freshness(svc.timestamp, current_time)
        is_fresh = freshness_info["is_fresh"]
        age_minutes = freshness_info["age_minutes"]
        fresh_traffic: Optional[int] = None

        # Freshness Check logic (Test C handling)
        if not is_fresh:
            fresh_traffic = get_latest_traffic(svc.service_id)

        # Prepare evidence prompt for LLM or deterministic evaluation
        prompt = f"""
        Analyze this cloud service state:
        Service: {svc.service_id}
        CPU: {svc.cpu_percent}%
        Memory: {svc.memory_percent}%
        Current RPM: {svc.requests_per_minute}
        Previous RPM: {svc.previous_requests_per_minute}
        Latency: {svc.latency_ms} ms (Max allowed: {svc.max_latency_ms} ms)
        Instances: {svc.instances} (Min: {svc.min_instances}, Max: {svc.max_instances})
        Cost/hr: ${svc.cost_per_hour}
        Observation Age: {age_minutes} minutes (Fresh: {is_fresh})
        Fresh Traffic Pulled: {fresh_traffic if fresh_traffic is not None else 'N/A'}
        User Request: "{user_prompt}"

        Provide a diagnosis strictly choosing from:
        - "UNDER_UTILIZATION"
        - "RISING_TRAFFIC"
        - "STALE_METRICS"
        - "CRITICAL_LOAD"
        - "CAPACITY_RISK"
        - "HEALTHY_STABLE"

        Return JSON with:
        {{
            "diagnosis": "<CATEGORY>",
            "diagnosis_reason": "<1-2 sentence evidence-backed explanation>"
        }}
        """

        system_prompt = (
            "You are the Investigator Agent for cloud infrastructure. "
            "You assess raw metrics and data freshness to identify the ground-truth operational situation. "
            "Never suggest or execute actions. Only identify what is happening."
        )

        llm_response = llm_client.generate_json(prompt, system_prompt)

        # Handle LLM response or deterministic fallback for transparency
        if llm_response.get("_mode") == "deterministic_demo_fallback" or "diagnosis" not in llm_response:
            diagnosis, reason = _deterministic_diagnosis(svc, is_fresh, age_minutes, fresh_traffic)
        else:
            diagnosis = llm_response["diagnosis"]
            reason = llm_response["diagnosis_reason"]

        investigations.append(ServiceInvestigation(
            service_id=svc.service_id,
            current_state=svc,
            is_fresh=is_fresh,
            age_minutes=age_minutes,
            fresh_traffic_pulled=fresh_traffic,
            diagnosis=diagnosis,
            diagnosis_reason=reason
        ))

    summary = f"Investigated {len(investigations)} service(s) at {current_time}."
    return InvestigationReport(
        investigation_id=f"inv-{int(datetime.now().timestamp())}",
        current_time=current_time,
        services_investigated=investigations,
        summary=summary
    )


def _deterministic_diagnosis(
    svc: ServiceState, 
    is_fresh: bool, 
    age_minutes: float, 
    fresh_traffic: Optional[int]
) -> tuple[str, str]:
    """Transparent deterministic diagnosis when in scenario demo mode."""
    # Test C: Stale metrics
    if not is_fresh:
        fresh_msg = f" Fresh traffic stream pulled: {fresh_traffic} RPM." if fresh_traffic else ""
        return (
            "STALE_METRICS",
            f"Observation is {age_minutes} minutes old (threshold: 15 min). Telemetry is stale.{fresh_msg}"
        )

    # Test D: Critical Load
    if svc.cpu_percent > 85.0 or svc.latency_ms > svc.max_latency_ms:
        return (
            "CRITICAL_LOAD",
            f"CPU utilization is critical at {svc.cpu_percent}% and latency ({svc.latency_ms} ms) breaches SLA threshold ({svc.max_latency_ms} ms)."
        )

    # Test B: Rising Traffic
    if (svc.previous_requests_per_minute and svc.requests_per_minute > svc.previous_requests_per_minute * 1.5) or (svc.requests_per_minute > 3000 and svc.latency_ms > svc.max_latency_ms * 0.8):
        return (
            "RISING_TRAFFIC",
            f"Traffic surged from {svc.previous_requests_per_minute or 'baseline'} to {svc.requests_per_minute} RPM with latency ({svc.latency_ms} ms) nearing maximum limit ({svc.max_latency_ms} ms)."
        )

    # Test A: Under-utilization
    if (svc.requests_per_minute == 0 or svc.cpu_percent < 15.0) and svc.instances > svc.min_instances:
        return (
            "UNDER_UTILIZATION",
            f"Service is operating with low load (CPU: {svc.cpu_percent}%, RPM: {svc.requests_per_minute}) while running {svc.instances} instances (minimum is {svc.min_instances})."
        )

    return (
        "HEALTHY_STABLE",
        f"Service is operating stably within expected performance and capacity boundaries."
    )
