"""
Agent 3: Verifier Agent
Answers the core question: "Did the change actually work?"

Responsibilities:
1. Compares Before vs After telemetry metrics.
2. Checks whether cost decreased and whether performance/health SLAs were maintained.
3. Detects action failures or performance degradation.
4. Initiates recovery / rollback recommendation if an SLA breach occurs.
5. Emits records to be remembered in Step 9 optimization history.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas import (
    ServiceState, 
    ActionResult, 
    VerificationReport, 
    MetricComparison
)
from app.cloud_sim import get_service_state
from app.database import save_optimization_history
from app.llm_client import llm_client


def verify_action_outcome(
    before_state: ServiceState,
    action_result: ActionResult,
    objective: str = "Reduce cost without breaking performance or SLA"
) -> VerificationReport:
    """Execute Agent 3 verification comparing before vs after state."""
    service_id = before_state.service_id
    now_id = f"ver-{int(datetime.now().timestamp())}"

    # Handle Case 1: The cloud action failed to apply (Test D)
    if action_result.status == "failed":
        summary = f"Action '{action_result.action_type}' failed to execute: {action_result.error}."
        save_optimization_history(
            service_id=service_id,
            action_type=action_result.action_type,
            instances_before=before_state.instances,
            instances_after=before_state.instances,
            cost_before=before_state.cost_per_hour,
            cost_after=before_state.cost_per_hour,
            latency_before=before_state.latency_ms,
            latency_after=before_state.latency_ms,
            status="FAILED",
            notes=f"Failed due to error: {action_result.error}"
        )
        return VerificationReport(
            verification_id=now_id,
            service_id=service_id,
            status="FAILED",
            sla_maintained=before_state.latency_ms <= before_state.max_latency_ms,
            cost_reduced=False,
            comparisons=[],
            summary=summary,
            recovery_recommended=True,
            recovery_action="Fallback to alternative scaling strategy or request capacity in alternate availability zone."
        )

    # Case 2: Fetch fresh post-action state from the cloud environment
    after_state = get_service_state(service_id)
    if not after_state:
        after_state = before_state

    # Compute metric comparisons
    comparisons: List[MetricComparison] = [
        MetricComparison(
            metric_name="Instances",
            before=float(before_state.instances),
            after=float(after_state.instances),
            unit="nodes",
            change_percent=round(((after_state.instances - before_state.instances) / max(1, before_state.instances)) * 100, 1),
            improved=after_state.instances <= before_state.instances
        ),
        MetricComparison(
            metric_name="Cost",
            before=before_state.cost_per_hour,
            after=after_state.cost_per_hour,
            unit="$/hr",
            change_percent=round(((after_state.cost_per_hour - before_state.cost_per_hour) / max(0.01, before_state.cost_per_hour)) * 100, 1),
            improved=after_state.cost_per_hour <= before_state.cost_per_hour
        ),
        MetricComparison(
            metric_name="Latency",
            before=before_state.latency_ms,
            after=after_state.latency_ms,
            unit="ms",
            change_percent=round(((after_state.latency_ms - before_state.latency_ms) / max(1.0, before_state.latency_ms)) * 100, 1),
            improved=after_state.latency_ms <= before_state.max_latency_ms
        ),
        MetricComparison(
            metric_name="CPU",
            before=before_state.cpu_percent,
            after=after_state.cpu_percent,
            unit="%",
            change_percent=round(((after_state.cpu_percent - before_state.cpu_percent) / max(1.0, before_state.cpu_percent)) * 100, 1),
            improved=after_state.cpu_percent <= 80.0
        ),
        MetricComparison(
            metric_name="Errors",
            before=before_state.error_rate_percent,
            after=after_state.error_rate_percent,
            unit="%",
            change_percent=round(((after_state.error_rate_percent - before_state.error_rate_percent) / max(0.01, before_state.error_rate_percent)) * 100, 1),
            improved=after_state.error_rate_percent <= 1.0
        )
    ]

    sla_maintained = after_state.latency_ms <= after_state.max_latency_ms and after_state.healthy
    cost_reduced = after_state.cost_per_hour < before_state.cost_per_hour

    # Evaluate Degradation / Rollback Trigger
    if not sla_maintained or after_state.latency_ms > after_state.max_latency_ms:
        status = "DEGRADED"
        summary = (
            f"Optimization caused performance degradation! Latency increased to {after_state.latency_ms} ms, "
            f"breaching the {after_state.max_latency_ms} ms SLA limit. Immediate rollback recommended."
        )
        recovery_rec = True
        recovery_act = f"Rollback instances from {after_state.instances} back to {before_state.instances}."
    elif cost_reduced:
        status = "SUCCESS"
        savings = round(before_state.cost_per_hour - after_state.cost_per_hour, 2)
        summary = (
            f"Optimization successful. Reduced hourly spend by ${savings}/hr "
            f"while preserving latency ({after_state.latency_ms} ms <= {after_state.max_latency_ms} ms SLA) and service health."
        )
        recovery_rec = False
        recovery_act = None
    else:
        status = "SUCCESS"
        summary = f"Capacity adjusted from {before_state.instances} to {after_state.instances} instances with performance stable."
        recovery_rec = False
        recovery_act = None

    # Save to SQLite optimization history (Step 9 memory)
    save_optimization_history(
        service_id=service_id,
        action_type=action_result.action_type,
        instances_before=before_state.instances,
        instances_after=after_state.instances,
        cost_before=before_state.cost_per_hour,
        cost_after=after_state.cost_per_hour,
        latency_before=before_state.latency_ms,
        latency_after=after_state.latency_ms,
        status=status,
        notes=summary
    )

    return VerificationReport(
        verification_id=now_id,
        service_id=service_id,
        status=status,
        sla_maintained=sla_maintained,
        cost_reduced=cost_reduced,
        comparisons=comparisons,
        summary=summary,
        recovery_recommended=recovery_rec,
        recovery_action=recovery_act
    )
