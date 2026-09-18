"""
Deterministic Safety Engine for Cloud Optimization.
Enforces non-negotiable infrastructure constraints:
- Instance capacity limits (min_instances, max_instances)
- Latency SLA boundaries (max_latency_ms)
- Service health gates
- Observation freshness requirements
- Extreme step reduction limits
"""

from typing import Dict, Any, List, Optional
from app.schemas import ServiceState, SafetyCheckResult, ActionProposal


def validate_proposed_action(
    service: ServiceState,
    action_type: str,
    target_instances: int,
    is_fresh: bool = True,
    current_rpm: Optional[int] = None
) -> SafetyCheckResult:
    """
    Deterministic safety validator.
    Returns SafetyCheckResult with approved=True/False and exact reason/violations.
    """
    violations: List[str] = []

    # 1. Freshness check: Cannot optimize on stale observation
    if not is_fresh:
        violations.append("Observation data is stale (>15 minutes old). Fresh telemetry required before changes.")

    # 2. Service health check: Do not scale down unhealthy services
    if not service.healthy and action_type in ["scale_down", "stop_idle_service"]:
        violations.append("Service is currently unhealthy. Remediation required before cost optimization.")

    # 3. Min instances check
    if action_type == "scale_down":
        if target_instances < service.min_instances:
            violations.append(
                f"Requested instances ({target_instances}) is below configured minimum capacity ({service.min_instances})."
            )

    # 4. Max instances check
    if action_type == "scale_up":
        if target_instances > service.max_instances:
            violations.append(
                f"Requested instances ({target_instances}) exceeds maximum capacity limit ({service.max_instances})."
            )

    # 5. Latency SLA projection check for scale down
    if action_type == "scale_down" and service.instances > 0 and target_instances > 0:
        effective_rpm = current_rpm if current_rpm is not None else service.requests_per_minute
        ratio = service.instances / target_instances
        
        # Latency impact estimate
        projected_latency = service.latency_ms + ((ratio - 1.0) * 15.0)
        
        # If traffic has doubled or high, latency projection increases more sharply
        if effective_rpm > service.requests_per_minute * 1.5:
            projected_latency += 50.0

        if projected_latency >= service.max_latency_ms:
            violations.append(
                f"Projected latency ({round(projected_latency, 1)} ms) threatens max latency SLA ({service.max_latency_ms} ms)."
            )

    # 6. Aggressive downscaling check (safety brake for live traffic)
    if action_type == "scale_down" and service.requests_per_minute > 500:
        reduction_ratio = (service.instances - target_instances) / service.instances
        if reduction_ratio > 0.60:
            violations.append(
                f"Cannot reduce capacity by {round(reduction_ratio * 100)}% in a single step while serving active traffic ({service.requests_per_minute} RPM)."
            )

    approved = len(violations) == 0
    if approved:
        reason = f"Action '{action_type}' to {target_instances} instances satisfies all deterministic safety constraints."
    else:
        reason = "; ".join(violations)

    return SafetyCheckResult(
        approved=approved,
        reason=reason,
        violated_rules=violations,
        action_type=action_type,
        target_instances=target_instances
    )
