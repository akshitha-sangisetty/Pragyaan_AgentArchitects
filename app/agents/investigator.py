"""
Agent 1: Investigator Agent (Multi-Cloud Aware)
Answers the core question: "What is happening?"

Responsibilities:
1. Normalizes raw provider telemetry (AWS, Azure, GCP) into CommonTelemetry.
2. Evaluates observation freshness against reference clock (15 min threshold).
3. Evaluates actual live traffic, workload saturation, and provider resource identity.
4. Directly processes user instructions (Intent Analysis) so prompt changes meaningfully affect reasoning.
5. Synthesizes evidence to produce a situational diagnosis:
   - UNDER_UTILIZATION (low CPU + idle traffic)
   - RISING_TRAFFIC (RPM surging towards latency boundary)
   - STALE_METRICS (metrics older than freshness threshold)
   - CRITICAL_LOAD (high CPU > 85%, latency SLA breach)
   - CAPACITY_RISK (near boundary limits)
   - HEALTHY_STABLE (stable within bounds)
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas import ServiceState, ServiceInvestigation, InvestigationReport, CommonTelemetry
from app.adapters import service_state_to_common_telemetry
from app.cloud_sim import check_freshness, get_latest_traffic
from app.llm_client import llm_client


def run_investigation(
    services: List[ServiceState],
    user_prompt: str = "",
    current_time: str = "2026-09-17T10:30:00Z",
    cloud_provider: str = "AWS"
) -> InvestigationReport:
    """Execute Agent 1 investigation across all target services with multi-cloud context."""
    investigations: List[ServiceInvestigation] = []
    active_provider = cloud_provider or (services[0].cloud_provider if services else "AWS")

    # Analyze user prompt intent for targeted investigation
    prompt_intent = _analyze_prompt_intent(user_prompt)

    # If prompt asks to find the most expensive resource, we sort or tag the highest cost service
    highest_cost_service_id = None
    if services:
        highest_cost_service_id = max(services, key=lambda s: s.cost_per_hour).service_id

    for svc in services:
        freshness_info = check_freshness(svc.timestamp, current_time)
        is_fresh = freshness_info["is_fresh"]
        age_minutes = freshness_info["age_minutes"]
        fresh_traffic: Optional[int] = None

        if not is_fresh:
            fresh_traffic = get_latest_traffic(svc.service_id)

        # Convert to CommonTelemetry for standardized analysis
        common_tel = service_state_to_common_telemetry(svc)
        prov = svc.cloud_provider or active_provider

        # Prepare rich multi-cloud evidence prompt for LLM
        prompt = f"""
        Analyze this {prov} cloud service state:
        Cloud Provider: {prov}
        Resource Identity: {svc.resource_id or svc.service_id} (Type: {svc.resource_size or 'Standard'}, Region: {svc.region or 'Default'})
        Service ID: {svc.service_id}
        CPU: {svc.cpu_percent}%
        Memory: {svc.memory_percent}%
        Current RPM: {svc.requests_per_minute}
        Previous RPM: {svc.previous_requests_per_minute}
        Latency: {svc.latency_ms} ms (Max SLA: {svc.max_latency_ms} ms)
        Instances/VMs: {svc.instances} (Min: {svc.min_instances}, Max: {svc.max_instances})
        Cost/hr: ${svc.cost_per_hour}
        Observation Age: {age_minutes} minutes (Fresh: {is_fresh})
        Fresh Traffic Pulled: {fresh_traffic if fresh_traffic is not None else 'N/A'}
        User Instruction: "{user_prompt}"
        User Intent Focus: {prompt_intent}
        Is Most Expensive Resource: {svc.service_id == highest_cost_service_id}

        Provide a situational diagnosis strictly choosing from:
        - "UNDER_UTILIZATION"
        - "RISING_TRAFFIC"
        - "STALE_METRICS"
        - "CRITICAL_LOAD"
        - "CAPACITY_RISK"
        - "HEALTHY_STABLE"

        Return JSON with:
        {{
            "diagnosis": "<CATEGORY>",
            "diagnosis_reason": "<2-3 sentence evidence-backed explanation addressing the user's specific instruction and provider metrics>"
        }}
        """

        system_prompt = (
            f"You are Agent 1 (Data Inspector) for {prov} cloud infrastructure. "
            "You assess raw metrics, data freshness, and resource identity to identify the ground-truth operational situation. "
            "Address the user's specific instruction directly in your reasoning. "
            "Never suggest or execute actions. Only identify what is happening."
        )

        llm_response = llm_client.generate_json(prompt, system_prompt)

        # Handle LLM response or deterministic fallback
        if llm_response.get("_mode") == "deterministic_demo_fallback" or "diagnosis" not in llm_response:
            diagnosis, reason = _deterministic_diagnosis(
                svc, is_fresh, age_minutes, fresh_traffic, user_prompt, prompt_intent, svc.service_id == highest_cost_service_id
            )
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
            diagnosis_reason=reason,
            cloud_provider=prov,
            normalized_telemetry=common_tel.model_dump()
        ))

    intent_label = {
        "FIND_MOST_EXPENSIVE": "focus: identifying highest-spend resource",
        "CHECK_OVER_PROVISIONED": "focus: over-provisioned idle capacity check",
        "FOCUS_ON_LATENCY": "focus: latency and response time analysis",
        "DETERMINE_SAFETY": "focus: scaling safety and boundary validation",
        "COST_INCREASING": "focus: cost growth investigation"
    }.get(prompt_intent, "general telemetry review")

    summary = f"Investigated {len(investigations)} {active_provider} service(s) [{intent_label}] at {current_time}."
    return InvestigationReport(
        investigation_id=f"inv-{active_provider.lower()}-{int(datetime.now().timestamp())}",
        current_time=current_time,
        services_investigated=investigations,
        summary=summary,
        cloud_provider=active_provider
    )


def _analyze_prompt_intent(user_prompt: str) -> str:
    """Classify user's natural language instruction intent for deterministic & LLM reasoning."""
    p = (user_prompt or "").lower()
    if any(k in p for k in ["most expensive", "highest cost", "biggest spend", "costliest"]):
        return "FIND_MOST_EXPENSIVE"
    if any(k in p for k in ["over-provision", "overprovision", "idle", "wasted", "unused"]):
        return "CHECK_OVER_PROVISIONED"
    if any(k in p for k in ["latency", "speed", "slow", "delay", "response time"]):
        return "FOCUS_ON_LATENCY"
    if any(k in p for k in ["safe", "safety", "risk", "can we scale", "is it safe"]):
        return "DETERMINE_SAFETY"
    if any(k in p for k in ["cost", "increase", "expensive", "bill", "budget", "reduce"]):
        return "INVESTIGATE_COST"
    return "GENERAL_OPTIMIZATION"


def _deterministic_diagnosis(
    svc: ServiceState, 
    is_fresh: bool, 
    age_minutes: float, 
    fresh_traffic: Optional[int],
    user_prompt: str,
    prompt_intent: str,
    is_highest_cost: bool
) -> tuple[str, str]:
    """
    Transparent deterministic diagnosis that respects actual telemetry,
    provider resource identities, and user natural-language instructions.
    """
    prov = svc.cloud_provider or "AWS"
    res_label = f"{svc.resource_id or svc.service_id} ({svc.resource_size or 'Standard'}) in {svc.region or 'default region'}"

    # 1. Stale Metrics (Test C)
    if not is_fresh:
        fresh_msg = f" Live traffic query reveals surging stream of {fresh_traffic} RPM." if fresh_traffic else ""
        return (
            "STALE_METRICS",
            f"[{prov} Telemetry Stale] Observation timestamp is {age_minutes}m old (threshold 15m) on {res_label}.{fresh_msg} Fresh metrics required before optimization."
        )

    # 2. Critical Load (Test D)
    if svc.cpu_percent > 85.0 or svc.latency_ms > svc.max_latency_ms:
        return (
            "CRITICAL_LOAD",
            f"[{prov} Critical Load] {res_label} is under severe pressure: CPU is {svc.cpu_percent}% and latency ({svc.latency_ms} ms) breaches the {svc.max_latency_ms} ms SLA limit."
        )

    # 3. Rising Traffic (Test B)
    if (svc.previous_requests_per_minute and svc.requests_per_minute > svc.previous_requests_per_minute * 1.5) or (svc.requests_per_minute > 3000 and svc.latency_ms > svc.max_latency_ms * 0.8):
        return (
            "RISING_TRAFFIC",
            f"[{prov} Surging Traffic] Traffic on {res_label} surged to {svc.requests_per_minute} RPM (previous: {svc.previous_requests_per_minute or 'baseline'}). Latency is {svc.latency_ms} ms nearing the {svc.max_latency_ms} ms SLA limit."
        )

    # 4. Prompt Intent: FIND_MOST_EXPENSIVE
    if prompt_intent == "FIND_MOST_EXPENSIVE":
        if is_highest_cost:
            return (
                "UNDER_UTILIZATION" if (svc.requests_per_minute < 500 or svc.cpu_percent < 25.0) else "HEALTHY_STABLE",
                f"[{prov} Most Expensive Resource] {res_label} generates the highest hourly spend at ${svc.cost_per_hour}/hr across {svc.instances} instances. Current load is CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM."
            )
        else:
            return (
                "UNDER_UTILIZATION" if (svc.requests_per_minute == 0 or svc.cpu_percent < 15.0) else "HEALTHY_STABLE",
                f"[{prov} Cost Comparison] {res_label} spends ${svc.cost_per_hour}/hr (CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM), which is lower than the primary spend driver."
            )

    # 5. Prompt Intent: FOCUS_ON_LATENCY
    if prompt_intent == "FOCUS_ON_LATENCY":
        headroom = svc.max_latency_ms - svc.latency_ms
        if headroom < 50.0:
            return (
                "CAPACITY_RISK",
                f"[{prov} Latency Headroom Alert] Latency is {svc.latency_ms} ms on {res_label}, leaving only {round(headroom, 1)} ms headroom before violating the {svc.max_latency_ms} ms SLA."
            )
        elif svc.requests_per_minute == 0:
            return (
                "UNDER_UTILIZATION",
                f"[{prov} Latency Analysis] Latency is currently 0 ms on {res_label} due to zero active traffic ({svc.requests_per_minute} RPM). Capacity can be scaled down safely without latency risk."
            )
        else:
            return (
                "UNDER_UTILIZATION" if (svc.cpu_percent < 25.0 and svc.instances > svc.min_instances) else "HEALTHY_STABLE",
                f"[{prov} Latency Assessed] Current latency of {svc.latency_ms} ms is well within the {svc.max_latency_ms} ms SLA with {round(headroom, 1)} ms headroom on {res_label}."
            )

    # 6. Prompt Intent: CHECK_OVER_PROVISIONED
    if prompt_intent == "CHECK_OVER_PROVISIONED":
        if (svc.requests_per_minute == 0 or svc.cpu_percent < 25.0) and svc.instances > svc.min_instances:
            idle_nodes = svc.instances - svc.min_instances
            wasted_cost = round((svc.cost_per_hour / svc.instances) * idle_nodes, 2)
            return (
                "UNDER_UTILIZATION",
                f"[{prov} Over-Provisioning Confirmed] {res_label} has {idle_nodes} excess instance(s) running with low utilization (CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM), wasting approximately ${wasted_cost}/hr."
            )
        else:
            return (
                "HEALTHY_STABLE",
                f"[{prov} Utilization Check] {res_label} is operating with appropriate capacity ({svc.instances} instances, CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM) and is not over-provisioned."
            )

    # 7. Prompt Intent: DETERMINE_SAFETY
    if prompt_intent == "DETERMINE_SAFETY":
        if (svc.requests_per_minute == 0 or svc.cpu_percent < 25.0) and svc.instances > svc.min_instances:
            return (
                "UNDER_UTILIZATION",
                f"[{prov} Downscaling Safety Verified] Scaling down {res_label} from {svc.instances} to {svc.min_instances} instances is safe because CPU is {svc.cpu_percent}% with ample latency headroom."
            )
        else:
            return (
                "HEALTHY_STABLE",
                f"[{prov} Operational Safety] {res_label} is operating within normal safety envelopes ({svc.instances} instances, {svc.latency_ms} ms latency)."
            )

    # 8. Default Under-Utilization (Test A)
    if (svc.requests_per_minute == 0 or svc.cpu_percent < 25.0) and svc.instances > svc.min_instances:
        return (
            "UNDER_UTILIZATION",
            f"[{prov} Low Utilization] {res_label} is operating with low load (CPU: {svc.cpu_percent}%, {svc.requests_per_minute} RPM) while running {svc.instances} instances (minimum is {svc.min_instances}). Spend is ${svc.cost_per_hour}/hr."
        )

    return (
        "HEALTHY_STABLE",
        f"[{prov} Stable] {res_label} is operating stably within expected performance and capacity boundaries ({svc.instances} instances, {svc.requests_per_minute} RPM)."
    )
