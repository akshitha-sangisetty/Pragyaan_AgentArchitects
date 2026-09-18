"""
Automated Test Suite for Autonomous Cloud Cost Optimization System.
Validates the official Hackathon Test Scenarios A, B, C, D and Safety Engine Boundaries.
"""

import pytest
from app.database import load_scenario, get_all_services, get_optimization_history
from app.cloud_sim import get_service_state, execute_cloud_action
from app.workflow import WorkflowOrchestrator
from app.safety_engine import validate_proposed_action
from app.agents.verifier import verify_action_outcome


def test_scenario_a_overprovisioned_optimization():
    """
    Test A: Cost optimization request.
    Verifies that reports-worker (idle, 4 instances, min 1) is safely scaled down to 1,
    cutting spend by 75% while keeping latency safe and verified.
    """
    load_scenario("test_a")
    
    # Run autonomous recommendation pipeline
    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Review the current services and reduce unnecessary cost without breaking the latency or availability requirements.",
        auto_apply=True
    )

    assert result["status"] == "completed"
    proposals = {p["service_id"]: p for p in result["proposals"]}
    
    # Check reports-worker
    assert "reports-worker" in proposals
    rw_prop = proposals["reports-worker"]
    assert rw_prop["investigation"]["diagnosis"] == "UNDER_UTILIZATION"
    assert rw_prop["proposal"]["action_type"] == "scale_down"
    assert rw_prop["proposal"]["target_instances"] == 1
    assert rw_prop["safety"]["approved"] is True

    # Check verification report
    assert "verification" in rw_prop
    ver = rw_prop["verification"]
    assert ver["status"] == "SUCCESS"
    assert ver["cost_reduced"] is True
    assert ver["sla_maintained"] is True

    # Verify state in database updated
    rw_updated = get_service_state("reports-worker")
    assert rw_updated.instances == 1
    assert rw_updated.cost_per_hour < 15.0


def test_scenario_b_rising_traffic_safety():
    """
    Test B: Rising traffic trap.
    Traffic doubled from 2100 to 4200 RPM, latency at 260ms (close to 300ms SLA).
    Verifies that the agent refuses naive downscaling and protects the SLA.
    """
    load_scenario("test_b")

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Orders traffic is increasing. Keep the service within its latency target."
    )

    proposals = {p["service_id"]: p for p in result["proposals"]}
    orders = proposals["orders-api"]

    # Diagnosis should catch traffic surge
    assert orders["investigation"]["diagnosis"] == "RISING_TRAFFIC"
    
    # Optimizer should NOT downscale
    assert orders["proposal"]["action_type"] in ["no_action", "scale_up"]
    assert orders["proposal"]["target_instances"] >= 4

    # Test Path B manual slider: If developer attempts to dangerously downscale to 2 instances
    eval_result = WorkflowOrchestrator.evaluate_manual_change("orders-api", 2)
    assert eval_result["recommendation"] in ["NOT_RECOMMENDED", "UNSAFE_BLOCKED"]
    assert "traffic" in eval_result["reason"].lower() or "latency" in eval_result["reason"].lower()


def test_scenario_c_stale_metrics_detection():
    """
    Test C: Stale observation handling.
    Metrics are from 08:00 while reference clock is 10:30 (150 min old).
    Verifies that system detects stale observation, pulls fresh 10:30 traffic (5200 RPM),
    and halts unsafe cost cutting.
    """
    load_scenario("test_c")

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Reduce cost if it is safe."
    )

    proposals = {p["service_id"]: p for p in result["proposals"]}
    checkout = proposals["checkout-api"]

    # Must flag observation as NOT fresh
    assert checkout["investigation"]["is_fresh"] is False
    assert checkout["investigation"]["age_minutes"] > 15.0
    assert checkout["investigation"]["fresh_traffic_pulled"] == 5200
    assert checkout["investigation"]["diagnosis"] == "STALE_METRICS"

    # Must withhold scale-down
    assert checkout["proposal"]["action_type"] == "no_action"


def test_scenario_d_action_failure_and_recovery():
    """
    Test D: Failed action handling.
    Payment service at 91% CPU requests scale up, but cloud API returns capacity_unavailable.
    Verifies that Verifier catches failure, flags recovery recommendation, and logs failure.
    """
    load_scenario("test_d")

    svc = get_service_state("payment-api")
    assert svc.cpu_percent == 91.0

    # Simulate cloud action execution that fails with capacity_unavailable
    action_res = execute_cloud_action("payment-api", "scale_up", 5, simulate_failure=True)
    assert action_res.status == "failed"
    assert action_res.error == "capacity_unavailable"

    # Run Verifier
    ver_report = verify_action_outcome(svc, action_res)
    assert ver_report.status == "FAILED"
    assert ver_report.recovery_recommended is True
    assert "capacity_unavailable" in ver_report.summary or "failed" in ver_report.summary.lower()

    # Verify history recorded the failure for Step 9 memory
    history = get_optimization_history("payment-api", limit=1)
    assert len(history) > 0
    assert history[0]["status"] == "FAILED"


def test_deterministic_safety_engine_boundaries():
    """
    Directly tests Deterministic Safety Engine boundary enforcement.
    """
    load_scenario("test_a")
    svc = get_service_state("reports-worker")

    # 1. Target below min_instances (min is 1, target 0)
    res_below_min = validate_proposed_action(svc, "scale_down", 0)
    assert res_below_min.approved is False
    assert any("below configured minimum" in rule for rule in res_below_min.violated_rules)

    # 2. Target above max_instances (max is 6, target 9)
    res_above_max = validate_proposed_action(svc, "scale_up", 9)
    assert res_above_max.approved is False
    assert any("exceeds maximum capacity" in rule for rule in res_above_max.violated_rules)

    # 3. Unhealthy service downscaling
    svc_unhealthy = svc.model_copy(update={"healthy": False})
    res_unhealthy = validate_proposed_action(svc_unhealthy, "scale_down", 2)
    assert res_unhealthy.approved is False
    assert any("unhealthy" in rule for rule in res_unhealthy.violated_rules)


def test_user_goals_and_budget_cap_enforcement():
    """
    Tests developer-configured goals from Step 1 of P3:
    1. Budget cap enforcement ($/hr) blocks excessive scale up.
    2. Strict developer latency limit tighter than service default.
    """
    load_scenario("test_a")
    svc = get_service_state("orders-api")  # 6 instances, $18.50/hr -> $3.08/instance

    # Strict budget cap of $20/hr when scaling to 8 instances ($24.67/hr)
    strict_budget_goals = {
        "max_hourly_budget": 20.0,
        "max_acceptable_latency_ms": 300.0
    }
    budget_check = validate_proposed_action(
        svc, "scale_up", 8, user_goals=strict_budget_goals
    )
    assert budget_check.approved is False
    assert any("budget cap" in rule for rule in budget_check.violated_rules)

    # Tight latency threshold of 185ms (service default is 300ms, current latency is 180ms)
    strict_latency_goals = {
        "max_hourly_budget": 100.0,
        "max_acceptable_latency_ms": 185.0
    }
    # Scaling down from 6 to 3 will push latency ~195ms, breaching the 185ms boundary!
    latency_check = validate_proposed_action(
        svc, "scale_down", 3, user_goals=strict_latency_goals
    )
    assert latency_check.approved is False
    assert any("latency SLA boundary" in rule for rule in latency_check.violated_rules)


def test_cooldown_anti_thrashing_guard():
    """
    Tests anti-thrashing cooldown protection:
    If a service was modified recently, subsequent scale actions are guarded.
    """
    from datetime import datetime, timezone
    load_scenario("test_a")
    svc = get_service_state("reports-worker")

    # Simulate recent action 30 seconds ago
    recent_timestamp = datetime.now(timezone.utc).isoformat()
    
    cooldown_check = validate_proposed_action(
        service=svc,
        action_type="scale_down",
        target_instances=1,
        last_action_time=recent_timestamp,
        cooldown_seconds=180
    )
    assert cooldown_check.approved is False
    assert any("cooldown guard" in rule for rule in cooldown_check.violated_rules)


def test_health_check():
    """Verify the /health endpoint used by Render uptime monitor."""
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data



