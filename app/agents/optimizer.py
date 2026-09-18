"""
Agent 2: Optimizer / Decision Agent
Answers the core question: "What should we do?"

Responsibilities:
1. Path A (Autonomous): Recommends optimal action based on Agent 1 investigation and historical memory.
2. Path B (Manual Evaluation): Evaluates developer-proposed slider changes against safety rules and operational context.
3. Memory Integration (Step 9): Queries SQLite optimization_history before recommending aggressive downscaling.
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
    Path A: Autonomous decision making.
    Determines whether to scale_down, scale_up, stop, or take no action.
    """
    svc = investigation.current_state

    # Query historical memory (Step 9) for this service
    past_history = get_optimization_history(service_id=svc.service_id, limit=3)
    memory_note = None
    if past_history:
        recent = past_history[0]
        memory_note = f"Previous action on {svc.service_id}: {recent['action_type']} ({recent['instances_before']} -> {recent['instances_after']}), Outcome: {recent['status']}."

    prompt = f"""
    You are the Optimizer Agent. Recommend an action for this service.
    
    Service ID: {svc.service_id}
    Diagnosis: {investigation.diagnosis}
    Diagnosis Reason: {investigation.diagnosis_reason}
    Current Instances: {svc.instances} (Min: {svc.min_instances}, Max: {svc.max_instances})
    Current CPU: {svc.cpu_percent}%
    Current RPM: {svc.requests_per_minute}
    Latency: {svc.latency_ms} ms (SLA: {svc.max_latency_ms} ms)
    Cost/hour: ${svc.cost_per_hour}
    Is Fresh Data: {investigation.is_fresh}
    Fresh Traffic Available: {investigation.fresh_traffic_pulled}
    Historical Memory: {memory_note or 'No prior records'}
    User Prompt: "{user_prompt}"

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
        "reason": "<Plain-language justification>",
        "projected_cost_delta_per_hr": <FLOAT (negative for savings)>,
        "projected_latency_impact": "<e.g. None / Negligible / Safe within SLA>",
        "risk_level": "<low|medium|high>"
    }}
    """

    system_prompt = (
        "You are the Optimizer Agent for cloud infrastructure. "
        "Recommend safe, cost-effective infrastructure adjustments. "
        "Never scale down services experiencing rising traffic or stale metrics. "
        "Respect SLA limits strictly."
    )

    llm_response = llm_client.generate_json(prompt, system_prompt)

    if llm_response.get("_mode") == "deterministic_demo_fallback" or "action_type" not in llm_response:
        return _deterministic_recommendation(investigation, memory_note)

    return ActionProposal(
        service_id=svc.service_id,
        action_type=llm_response["action_type"],
        current_instances=svc.instances,
        target_instances=llm_response["target_instances"],
        reason=llm_response["reason"],
        projected_cost_delta_per_hr=float(llm_response.get("projected_cost_delta_per_hr", 0.0)),
        projected_latency_impact=str(llm_response.get("projected_latency_impact", "None")),
        risk_level=llm_response.get("risk_level", "low"),
        memory_referenced=memory_note
    )


def evaluate_manual_proposal(
    svc_investigation: ServiceInvestigation,
    proposed_instances: int
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
        current_rpm=effective_rpm
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
                "cost_delta": round((svc.cost_per_hour / svc.instances) * (proposed_instances - svc.instances), 2),
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
        reason=f"Proposed adjustment ({svc.instances} -> {proposed_instances} instances) is safe and within all capacity and latency parameters.",
        projected_impact={
            "cost_delta": cost_delta,
            "latency_risk": "Safe within SLA headroom"
        }
    )


def _deterministic_recommendation(
    investigation: ServiceInvestigation,
    memory_note: Optional[str]
) -> ActionProposal:
    """Transparent deterministic action proposal for scenario demonstration."""
    svc = investigation.current_state

    # Test C: Stale Metrics
    if investigation.diagnosis == "STALE_METRICS":
        # Check fresh traffic (e.g. 5200 RPM)
        if investigation.fresh_traffic_pulled and investigation.fresh_traffic_pulled > 3000:
            return ActionProposal(
                service_id=svc.service_id,
                action_type="no_action",
                current_instances=svc.instances,
                target_instances=svc.instances,
                reason=f"Stale metrics detected (08:00 vs 10:30). Fresh telemetry reveals surging traffic ({investigation.fresh_traffic_pulled} RPM). Scaling down would breach SLA.",
                projected_cost_delta_per_hr=0.0,
                projected_latency_impact="Latency preserved by withholding unsafe scale-down",
                risk_level="high",
                memory_referenced=memory_note
            )

    # Test B: Rising Traffic
    if investigation.diagnosis == "RISING_TRAFFIC":
        return ActionProposal(
            service_id=svc.service_id,
            action_type="no_action",
            current_instances=svc.instances,
            target_instances=svc.instances,
            reason=f"Orders traffic doubled to {svc.requests_per_minute} RPM with latency at {svc.latency_ms} ms. Maintaining {svc.instances} instances to defend the {svc.max_latency_ms} ms latency SLA.",
            projected_cost_delta_per_hr=0.0,
            projected_latency_impact="Protected from latency spike under rising load",
            risk_level="low",
            memory_referenced=memory_note
        )

    # Test D: Critical Load
    if investigation.diagnosis == "CRITICAL_LOAD":
        return ActionProposal(
            service_id=svc.service_id,
            action_type="scale_up",
            current_instances=svc.instances,
            target_instances=min(svc.max_instances, 5),
            reason=f"Service under critical load (CPU {svc.cpu_percent}%, Latency {svc.latency_ms} ms). Proposing scale up to recover service health.",
            projected_cost_delta_per_hr=round((svc.cost_per_hour / svc.instances) * (5 - svc.instances), 2),
            projected_latency_impact="Significant latency improvement expected",
            risk_level="low",
            memory_referenced=memory_note
        )

    # Test A: Under-utilization
    if investigation.diagnosis == "UNDER_UTILIZATION":
        target = svc.min_instances
        cost_unit = svc.cost_per_hour / max(1, svc.instances)
        delta = round(cost_unit * (target - svc.instances), 2)
        return ActionProposal(
            service_id=svc.service_id,
            action_type="scale_down",
            current_instances=svc.instances,
            target_instances=target,
            reason=f"Service is idle (CPU {svc.cpu_percent}%, {svc.requests_per_minute} RPM). Safely scaling down from {svc.instances} to minimum capacity ({target}) reduces unnecessary spend.",
            projected_cost_delta_per_hr=delta,
            projected_latency_impact="Negligible impact expected due to zero traffic",
            risk_level="low",
            memory_referenced=memory_note
        )

    return ActionProposal(
        service_id=svc.service_id,
        action_type="no_action",
        current_instances=svc.instances,
        target_instances=svc.instances,
        reason="Service is operating comfortably within operational boundaries. No adjustment needed.",
        projected_cost_delta_per_hr=0.0,
        projected_latency_impact="Stable",
        risk_level="low",
        memory_referenced=memory_note
    )
