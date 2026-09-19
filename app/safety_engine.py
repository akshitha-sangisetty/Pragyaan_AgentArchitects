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
    current_rpm: Optional[int] = None,
    user_goals: Optional[Dict[str, Any]] = None,
    last_action_time: Optional[str] = None,
    cooldown_seconds: int = 0
) -> SafetyCheckResult:
    """
    Deterministic safety validator.
    Enforces service bounds + developer-configured goals (Step 1 of P3) + cooldown protection.
    """
    violations: List[str] = []
    
    # Effective latency SLA from service and user goals
    effective_max_latency = service.max_latency_ms
    if user_goals and "max_acceptable_latency_ms" in user_goals:
        effective_max_latency = min(service.max_latency_ms, float(user_goals["max_acceptable_latency_ms"]))

    # 1. Cooldown Check (Anti-Thrashing)
    if last_action_time and cooldown_seconds > 0 and action_type not in ["no_action"]:
        try:
            from datetime import datetime, timezone
            t_last = datetime.fromisoformat(last_action_time.replace("Z", "+00:00"))
            t_now = datetime.now(timezone.utc)
            elapsed = (t_now - t_last).total_seconds()
            if elapsed < cooldown_seconds:
                violations.append(
                    f"Action blocked by cooldown guard: Service was modified {int(elapsed)}s ago (cooldown is {cooldown_seconds}s)."
                )
        except Exception:
            pass

    # 2. Freshness check: Cannot optimize on stale observation
    if not is_fresh:
        violations.append("Observation data is stale (>15 minutes old). Fresh telemetry required before changes.")

    # 3. Service health check: Do not scale down unhealthy services
    if not service.healthy and action_type in ["scale_down", "stop_idle_service"]:
        violations.append("Service is currently unhealthy. Remediation required before cost optimization.")

    # 3. Min instances check
    if action_type in ["scale_down", "stop_idle_service"]:
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

    # 5. Budget Cap Check (Step 1 of P3)
    if action_type == "scale_up" and user_goals and "max_hourly_budget" in user_goals:
        cost_per_unit = service.cost_per_hour / max(1, service.instances)
        projected_service_cost = cost_per_unit * target_instances
        if projected_service_cost > float(user_goals["max_hourly_budget"]):
            violations.append(
                f"Projected cost (${round(projected_service_cost, 2)}/hr) exceeds developer budget cap (${user_goals['max_hourly_budget']}/hr)."
            )

    # 6. Latency SLA projection check for scale down
    if action_type == "scale_down" and service.instances > 0 and target_instances > 0:
        effective_rpm = current_rpm if current_rpm is not None else service.requests_per_minute
        ratio = service.instances / target_instances
        
        # Latency impact estimate
        projected_latency = service.latency_ms + ((ratio - 1.0) * 15.0)
        
        # If traffic has doubled or high, latency projection increases more sharply
        if effective_rpm > service.requests_per_minute * 1.5:
            projected_latency += 50.0

        if projected_latency >= effective_max_latency:
            violations.append(
                f"Projected latency ({round(projected_latency, 1)} ms) threatens max latency SLA boundary ({effective_max_latency} ms)."
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
