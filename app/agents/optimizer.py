"""
Agent 2: Optimizer / Decision Agent (Multi-Cloud Aware)
Answers the core question: "What should we do?"

Responsibilities:
1. Path A (Autonomous): Recommends optimal action based on Agent 1 investigation, multi-cloud context, and user prompt.
2. Path B (Manual Evaluation): Evaluates developer-proposed slider changes against safety rules and operational context.
3. Memory Integration (Step 9): Queries SQLite optimization_history before recommending aggressive downscaling.
4. Natural Language Reasoning: Tailors recommendation strategies based on user prompt intent.
"""

from typing import List, Dict, Any, Optional
from app.schemas import (
    ServiceInvestigation, 
    ActionProposal, 
    ManualProposalEvaluation,
    SafetyCheckResult
)
from app.safety_engine import validate_proposed_action
from app.database import get_optimization_history
from app.llm_client import llm_client


def recommend_action(
    investigation: ServiceInvestigation,
    user_prompt: str = ""
) -> ActionProposal:
    """
    Path A: Autonomous decision making with multi-cloud context and user instruction reasoning.
    """
    svc = investigation.current_state
    prov = svc.cloud_provider or investigation.cloud_provider or "AWS"

    # Query historical memory (Step 9) for this service
    past_history = get_optimization_history(service_id=svc.service_id, limit=3)
    memory_note = None
    if past_history:
        recent = past_history[0]
        memory_note = f"Previous action on {svc.service_id} ({prov}): {recent['action_type']} ({recent['instances_before']} -> {recent['instances_after']}), Outcome: {recent['status']}."

    prompt_intent = _analyze_prompt_intent(user_prompt)

    prompt = f"""
    You are Agent 2 (Cost Saver) for {prov} cloud infrastructure. Recommend an action for this service.
    
    Cloud Provider: {prov}
    Resource: {svc.resource_id or svc.service_id} ({svc.resource_size or 'Standard'}, Region: {svc.region or 'Default'})
    Service ID: {svc.service_id}
    Diagnosis: {investigation.diagnosis}
    Diagnosis Reason: {investigation.diagnosis_reason}
    Current Instances: {svc.instances} (Min: {svc.min_instances}, Max: {svc.max_instances})
    Current CPU: {svc.cpu_percent}%
    Current RPM: {svc.requests_per_minute}
    Latency: {svc.latency_ms} ms (Max SLA: {svc.max_latency_ms} ms)
    Cost/hour: ${svc.cost_per_hour}
    Is Fresh Data: {investigation.is_fresh}
    Fresh Traffic Available: {investigation.fresh_traffic_pulled}
    Historical Memory: {memory_note or 'No prior records'}
    User Prompt: "{user_prompt}"
    User Intent: {prompt_intent}

    Allowed action types:
    - "scale_down"
    - "scale_up"
    - "resize"
    - "stop_idle_service"
    - "no_action"

    Return JSON with:
    {{
        "action_type": "<ACTION_TYPE>",
        "target_instances": <INT>,
        "reason": "<Plain-language justification tailored to user prompt and {prov} metrics>",
        "projected_cost_delta_per_hr": <FLOAT (negative for savings)>,
        "projected_latency_impact": "<e.g. Negligible / Safe within SLA / Headroom preserved>",
        "risk_level": "<low|medium|high>"
    }}
    """

    system_prompt = (
        f"You are Agent 2 (Cost Saver) for {prov} infrastructure. "
        "Recommend safe, cost-effective infrastructure adjustments that directly answer the user prompt. "
        "Never scale down services experiencing rising traffic or stale metrics. "
        "Respect SLA limits strictly. "
        "For idle services, scale down to min_instances. Never propose target_instances below min_instances."
    )

    llm_response = llm_client.generate_json(prompt, system_prompt)

    if llm_response.get("_mode") == "deterministic_demo_fallback" or "action_type" not in llm_response:
        return _deterministic_recommendation(investigation, memory_note, user_prompt, prompt_intent)

    target_instances = int(llm_response.get("target_instances", svc.instances))
    action_type = str(llm_response.get("action_type", "no_action"))

    if target_instances < svc.min_instances:
        target_instances = svc.min_instances
        if action_type in ["stop_idle_service", "scale_down"] and target_instances > 0:
            action_type = "scale_down"

    return ActionProposal(
        service_id=svc.service_id,
        action_type=action_type,
        current_instances=svc.instances,
        target_instances=target_instances,
        reason=llm_response["reason"],
        projected_cost_delta_per_hr=float(llm_response.get("projected_cost_delta_per_hr", 0.0)),
        projected_latency_impact=str(llm_response.get("projected_latency_impact", "None")),
        risk_level=llm_response.get("risk_level", "low"),
        memory_referenced=memory_note,
        cloud_provider=prov
    )


def evaluate_manual_proposal(
    svc_investigation: ServiceInvestigation,
    proposed_instances: int,
    user_goals: Optional[Dict[str, Any]] = None
) -> ManualProposalEvaluation:
    """
    Path B: Evaluates a manual slider adjustment proposed by the developer.
    Runs deterministic safety checks first, then AI operational risk assessment.
    """
    svc = svc_investigation.current_state
    action_type = "scale_down" if proposed_instances < svc.instances else ("scale_up" if proposed_instances > svc.instances else "no_action")
    
    # 1. Deterministic Safety Engine Pre-Flight Check
    effective_rpm = svc_investigation.fresh_traffic_pulled if svc_investigation.fresh_traffic_pulled else svc.requests_per_minute
    safety = validate_proposed_action(
        service=svc,
        action_type=action_type,
        target_instances=proposed_instances,
        is_fresh=svc_investigation.is_fresh,
        current_rpm=effective_rpm,
        user_goals=user_goals
    )

    # If Safety Engine blocks it, mark UNSAFE_BLOCKED immediately
    if not safety.approved:
        return ManualProposalEvaluation(
            service_id=svc.service_id,
            proposed_instances=proposed_instances,
            recommendation="UNSAFE_BLOCKED",
            safety=safety,
            reason=f"Blocked by Safety Engine: {safety.reason}",
            projected_impact={"cost_delta": 0.0, "latency_risk": "High / Violation"}
        )

    # 2. Operational context assessment (Test B rising traffic scenario)
    if svc_investigation.diagnosis == "RISING_TRAFFIC" and proposed_instances < svc.instances:
        return ManualProposalEvaluation(
            service_id=svc.service_id,
            proposed_instances=proposed_instances,
            recommendation="NOT_RECOMMENDED",
            safety=safety,
            reason=f"Not recommended: Traffic surged to {svc.requests_per_minute} RPM. Reducing instances from {svc.instances} to {proposed_instances} risks breaching the {svc.max_latency_ms} ms SLA.",
            projected_impact={
                "cost_delta": round((svc.cost_per_hour / max(1, svc.instances)) * (proposed_instances - svc.instances), 2),
                "latency_risk": "Medium-High (Headroom reduction under rising load)"
            }
        )

    # Test C stale data scenario
    if svc_investigation.diagnosis == "STALE_METRICS" and proposed_instances < svc.instances:
        return ManualProposalEvaluation(
            service_id=svc.service_id,
            proposed_instances=proposed_instances,
            recommendation="NOT_RECOMMENDED",
            safety=safety,
            reason=f"Not recommended: Observation metrics are stale. Live traffic indicates {svc_investigation.fresh_traffic_pulled} RPM.",
            projected_impact={"cost_delta": 0.0, "latency_risk": "Unknown / High"}
        )

    # Safe recommended change
    cost_per_unit = svc.cost_per_hour / max(1, svc.instances)
    cost_delta = round(cost_per_unit * (proposed_instances - svc.instances), 2)
    return ManualProposalEvaluation(
        service_id=svc.service_id,
        proposed_instances=proposed_instances,
        recommendation="RECOMMENDED",
        safety=safety,
        reason=f"Proposed adjustment ({svc.instances} -> {proposed_instances} instances) on {svc.cloud_provider or 'AWS'} is safe and within all capacity and latency parameters.",
        projected_impact={
            "cost_delta": cost_delta,
            "latency_risk": "Safe within SLA headroom"
        }
    )


def _analyze_prompt_intent(user_prompt: str) -> str:
    """Classify user prompt intent."""
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


def _deterministic_recommendation(
    investigation: ServiceInvestigation,
    memory_note: Optional[str],
    user_prompt: str,
    prompt_intent: str
) -> ActionProposal:
    """
    Transparent deterministic action proposal for scenario demonstration with multi-cloud context
    and explicit responsiveness to user instructions.
    """
    svc = investigation.current_state
    prov = svc.cloud_provider or investigation.cloud_provider or "AWS"

    # Test C: Stale Metrics
    if investigation.diagnosis == "STALE_METRICS":
        if investigation.fresh_traffic_pulled and investigation.fresh_traffic_pulled > 3000:
            return ActionProposal(
                service_id=svc.service_id,
                action_type="no_action",
                current_instances=svc.instances,
                target_instances=svc.instances,
                reason=f"[{prov}] Stale observation detected. Fresh live telemetry reveals surging stream of {investigation.fresh_traffic_pulled} RPM. Scaling down would compromise {svc.max_latency_ms} ms SLA.",
                projected_cost_delta_per_hr=0.0,
                projected_latency_impact="Latency SLA preserved by withholding unsafe scale-down",
                risk_level="high",
                memory_referenced=memory_note,
                cloud_provider=prov
            )

    # Test B: Rising Traffic
    if investigation.diagnosis == "RISING_TRAFFIC":
        return ActionProposal(
            service_id=svc.service_id,
            action_type="no_action",
            current_instances=svc.instances,
            target_instances=svc.instances,
            reason=f"[{prov}] Traffic surging at {svc.requests_per_minute} RPM with latency at {svc.latency_ms} ms. Maintaining {svc.instances} instances to defend the {svc.max_latency_ms} ms SLA.",
            projected_cost_delta_per_hr=0.0,
            projected_latency_impact="Protected from latency breach under rising load",
            risk_level="low",
            memory_referenced=memory_note,
            cloud_provider=prov
        )

    # Test D: Critical Load
    if investigation.diagnosis == "CRITICAL_LOAD":
        target = min(svc.max_instances, 5)
        cost_unit = svc.cost_per_hour / max(1, svc.instances)
        delta = round(cost_unit * (target - svc.instances), 2)
        return ActionProposal(
            service_id=svc.service_id,
            action_type="scale_up",
            current_instances=svc.instances,
            target_instances=target,
            reason=f"[{prov}] Service under critical load (CPU {svc.cpu_percent}%, Latency {svc.latency_ms} ms). Proposing scale-up from {svc.instances} to {target} instances to restore SLA health.",
            projected_cost_delta_per_hr=delta,
            projected_latency_impact="Significant latency improvement expected",
            risk_level="low",
            memory_referenced=memory_note,
            cloud_provider=prov
        )

    # User Instruction Specific Handling:
    # 1. "Focus on latency before recommending any scaling action"
    if prompt_intent == "FOCUS_ON_LATENCY":
        if svc.requests_per_minute > 0 and svc.latency_ms > svc.max_latency_ms * 0.5:
            # Conservative rightsizing
            target = max(svc.min_instances, svc.instances - 1)
            cost_unit = svc.cost_per_hour / max(1, svc.instances)
            delta = round(cost_unit * (target - svc.instances), 2)
            return ActionProposal(
                service_id=svc.service_id,
                action_type="scale_down" if target < svc.instances else "no_action",
                current_instances=svc.instances,
                target_instances=target,
                reason=f"[{prov}] Latency-first policy: Evaluated latency headroom ({svc.latency_ms} ms vs {svc.max_latency_ms} ms max). Applied conservative adjustment from {svc.instances} to {target} instances to ensure response speed remains protected.",
                projected_cost_delta_per_hr=delta,
                projected_latency_impact="Minimal latency change within safe SLA envelope",
                risk_level="low",
                memory_referenced=memory_note,
                cloud_provider=prov
            )

    # 2. "Check whether the service is over-provisioned" or "Investigate why the cloud cost is increasing" or Test A
    if investigation.diagnosis == "UNDER_UTILIZATION":
        target = svc.min_instances
        cost_unit = svc.cost_per_hour / max(1, svc.instances)
        delta = round(cost_unit * (target - svc.instances), 2)
        
        reason_text = f"[{prov}] Service is operating with low utilization (CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM). Safely downscaling from {svc.instances} to {target} instances saves ${abs(delta)}/hr while respecting minimum bounds."
        if prompt_intent == "CHECK_OVER_PROVISIONED":
            reason_text = f"[{prov}] Over-provisioning confirmed: {svc.instances - target} idle instance(s) detected. Downscaling to minimum capacity ({target} instances) eliminates ${abs(delta)}/hr in wasted spend."
        elif prompt_intent == "FIND_MOST_EXPENSIVE":
            reason_text = f"[{prov}] Cost reduction on high-spend resource: Rightsizing {svc.resource_id or svc.service_id} to {target} instances immediately recovers ${abs(delta)}/hr in excess infrastructure cost."
        elif prompt_intent == "DETERMINE_SAFETY":
            reason_text = f"[{prov}] Downscaling verified safe: Zero/low traffic load allows scaling down from {svc.instances} to {target} instances without any SLA violation risk."

        return ActionProposal(
            service_id=svc.service_id,
            action_type="scale_down",
            current_instances=svc.instances,
            target_instances=target,
            reason=reason_text,
            projected_cost_delta_per_hr=delta,
            projected_latency_impact="Negligible impact expected due to low traffic load",
            risk_level="low",
            memory_referenced=memory_note,
            cloud_provider=prov
        )

    return ActionProposal(
        service_id=svc.service_id,
        action_type="no_action",
        current_instances=svc.instances,
        target_instances=svc.instances,
        reason=f"[{prov}] Service is operating stably within operational boundaries. No adjustment needed.",
        projected_cost_delta_per_hr=0.0,
        projected_latency_impact="Stable",
        risk_level="low",
        memory_referenced=memory_note,
        cloud_provider=prov
    )
