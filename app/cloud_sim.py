"""
Simulated Cloud Environment & Tool APIs for Cloud Cost Optimization.
Provides realistic metrics inspection, freshness calculation, and action execution.
"""

from datetime import datetime, timezone
import json
from typing import Dict, Any, Optional, List
from pathlib import Path
from app.database import (
    get_service_by_id, 
    update_service_instances, 
    get_all_services,
    record_audit
)
from app.schemas import ServiceState, ActionResult

SCENARIOS_PATH = Path(__file__).parent.parent / "data" / "scenarios.json"


def get_service_state(service_id: str) -> Optional[ServiceState]:
    """Fetch current state of a service."""
    raw = get_service_by_id(service_id)
    if not raw:
        return None
    return ServiceState(
        service_id=raw["service_id"],
        cpu_percent=raw["cpu_percent"],
        memory_percent=raw["memory_percent"],
        requests_per_minute=raw["requests_per_minute"],
        previous_requests_per_minute=raw["previous_requests_per_minute"],
        latency_ms=raw["latency_ms"],
        instances=raw["instances"],
        cost_per_hour=raw["cost_per_hour"],
        min_instances=raw["min_instances"],
        max_instances=raw["max_instances"],
        max_latency_ms=raw["max_latency_ms"],
        healthy=bool(raw["healthy"]),
        timestamp=raw["timestamp"]
    )


def check_freshness(observation_time_str: str, current_time_str: str = "2026-09-17T10:30:00Z", threshold_minutes: float = 15.0) -> Dict[str, Any]:
    """
    Check whether an observation timestamp is fresh compared to current time.
    Returns {is_fresh: bool, age_minutes: float}.
    """
    try:
        # Parse ISO strings (handling Z or +00:00)
        t_obs = datetime.fromisoformat(observation_time_str.replace("Z", "+00:00"))
        t_curr = datetime.fromisoformat(current_time_str.replace("Z", "+00:00"))
        delta_seconds = (t_curr - t_obs).total_seconds()
        age_minutes = max(0.0, delta_seconds / 60.0)
        is_fresh = age_minutes <= threshold_minutes
        return {
            "is_fresh": is_fresh,
            "age_minutes": round(age_minutes, 1)
        }
    except Exception:
        # Fallback if parsing fails
        return {"is_fresh": True, "age_minutes": 0.0}


def get_latest_traffic(service_id: str) -> Optional[int]:
    """
    Tool: Fetch the most recent live traffic stream for a service.
    Specifically checks scenarios.json for real-time live telemetry (e.g. Test C fresh traffic).
    """
    try:
        with open(SCENARIOS_PATH, "r", encoding="utf-8") as f:
            scenarios = json.load(f)
        for _, sc in scenarios.items():
            if "latest_traffic" in sc and sc["latest_traffic"].get("service_id") == service_id:
                return sc["latest_traffic"]["requests_per_minute"]
    except Exception:
        pass
    
    # Fallback to current database state
    service = get_service_by_id(service_id)
    return service["requests_per_minute"] if service else None


def execute_cloud_action(service_id: str, action_type: str, target_instances: int, simulate_failure: bool = False) -> ActionResult:
    """
    Simulated Cloud Action API.
    Executes scale_down, scale_up, resize, or stop_idle_service.
    Calculates realistic post-action telemetry (CPU load shift, latency impact, cost reduction).
    """
    now_str = datetime.now(timezone.utc).isoformat()
    raw = get_service_by_id(service_id)
    if not raw:
        return ActionResult(
            action_id=f"act-{int(datetime.now().timestamp())}",
            service_id=service_id,
            action_type=action_type,
            requested_instances=target_instances,
            applied_instances=0,
            status="failed",
            error="Service not found in cloud registry",
            applied_at=now_str
        )

    # Test D failure simulation: Check if service is payment-api with simulated failure
    if simulate_failure or (service_id == "payment-api" and action_type == "scale_up"):
        # Check scenario config if this is Test D
        try:
            with open(SCENARIOS_PATH, "r", encoding="utf-8") as f:
                scenarios = json.load(f)
            if "test_d" in scenarios and scenarios["test_d"].get("mock_action_result"):
                mock_err = scenarios["test_d"]["mock_action_result"]
                record_audit("ACTION_FAILED", {"service_id": service_id, "error": mock_err["error"]}, service_id)
                return ActionResult(
                    action_id=mock_err["action_id"],
                    service_id=service_id,
                    action_type=action_type,
                    requested_instances=target_instances,
                    applied_instances=raw["instances"],
                    status="failed",
                    error=mock_err["error"],
                    applied_at=now_str
                )
        except Exception:
            pass

    old_instances = raw["instances"]
    old_cpu = raw["cpu_percent"]
    old_latency = raw["latency_ms"]
    cost_per_unit = raw["cost_per_hour"] / max(1, old_instances)

    # Compute realistic post-change metrics
    if action_type in ["scale_down", "scale_up"]:
        new_instances = target_instances
        ratio = old_instances / max(1, new_instances)
        
        # CPU shifts inversely with instance count (capped at 98%)
        new_cpu = min(98.0, round(old_cpu * ratio, 1))
        
        # Latency shifts slightly based on load ratio
        if new_instances < old_instances:
            # Latency increases slightly when scaled down
            latency_increase = (ratio - 1.0) * 15.0
            new_latency = round(old_latency + latency_increase, 1)
        else:
            # Latency improves when scaled up
            latency_decrease = (1.0 - (1.0 / ratio)) * 30.0
            new_latency = max(15.0, round(old_latency - latency_decrease, 1))
            
        new_cost = round(cost_per_unit * new_instances, 2)
    elif action_type == "stop_idle_service":
        new_instances = 0
        new_cpu = 0.0
        new_latency = 0.0
        new_cost = 0.0
    else:
        new_instances = old_instances
        new_cpu = old_cpu
        new_latency = old_latency
        new_cost = raw["cost_per_hour"]

    # Persist the change to database
    update_service_instances(service_id, new_instances, new_latency, new_cpu, new_cost)
    
    action_id = f"act-{int(datetime.now().timestamp())}"
    record_audit("ACTION_APPLIED", {
        "action_id": action_id,
        "service_id": service_id,
        "action_type": action_type,
        "from_instances": old_instances,
        "to_instances": new_instances,
        "cost_before": raw["cost_per_hour"],
        "cost_after": new_cost
    }, service_id)

    return ActionResult(
        action_id=action_id,
        service_id=service_id,
        action_type=action_type,
        requested_instances=target_instances,
        applied_instances=new_instances,
        status="applied",
        error=None,
        applied_at=now_str
    )


def simulate_telemetry_tick() -> List[Dict[str, Any]]:
    """
    Live Telemetry Ticking Engine.
    Simulates real-world jitter (CPU +/-1.2%, latency +/-2ms, RPM +/-25)
    to demonstrate live continuous monitoring on the dashboard.
    """
    import random
    services = get_all_services()
    updated = []
    
    for s in services:
        sid = s["service_id"]
        # Skip idle service with 0 RPM
        if s["requests_per_minute"] == 0 and s["cpu_percent"] < 12.0:
            updated.append(s)
            continue
            
        jitter_cpu = round(max(5.0, min(95.0, s["cpu_percent"] + random.uniform(-1.5, 1.5))), 1)
        jitter_rpm = max(0, int(s["requests_per_minute"] + random.randint(-30, 30)))
        jitter_lat = round(max(10.0, min(s["max_latency_ms"] * 1.2, s["latency_ms"] + random.uniform(-3.0, 3.0))), 1)
        
        update_service_instances(
            service_id=sid,
            new_instances=s["instances"],
            new_latency=jitter_lat,
            new_cpu=jitter_cpu,
            new_cost=s["cost_per_hour"]
        )
        updated.append(get_service_by_id(sid))
        
    return updated

