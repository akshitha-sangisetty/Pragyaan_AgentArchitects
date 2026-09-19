"""
Automated Test Suite for Multi-Cloud Support in Cloud Guardian.
Validates:
1. AWS, Azure, GCP Provider Models & Schema Validation (Parts E, F, G)
2. Normalization Layer & Adapters (Part H)
3. End-to-End Pipeline for AWS, Azure, and GCP (Parts J, K, L, M, N, O)
4. AI Agent Natural-Language Prompt Intent & Reasoning (Part Q)
5. Multi-Cloud API Endpoints (Part P)
6. SQLite Multi-Cloud Persistence & History (Part S)
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas import (
    AWSProviderInput,
    AzureProviderInput,
    GCPProviderInput,
    CommonTelemetry,
    ServiceState
)
from app.adapters import (
    AWSAdapter,
    AzureAdapter,
    GCPAdapter,
    normalize_provider_data,
    service_state_to_common_telemetry
)
from app.database import (
    load_scenario,
    get_all_services,
    get_active_provider,
    set_active_provider,
    get_optimization_history
)
from app.workflow import WorkflowOrchestrator
from app.cloud_sim import get_service_state, execute_cloud_action
from app.agents.investigator import run_investigation
from app.agents.optimizer import recommend_action
from app.agents.verifier import verify_action_outcome
from app.safety_engine import validate_proposed_action


client = TestClient(app)


# ==============================================================================
# 1. PROVIDER SCHEMAS & ADAPTER NORMALIZATION TESTS
# ==============================================================================

def test_aws_input_model_and_normalization():
    """Validates AWS provider schema and adapter normalization into CommonTelemetry."""
    aws_payload = {
        "cloud_provider": "AWS",
        "region": "ap-south-1",
        "account_id": "123456789012",
        "instance_id": "i-0abc123456",
        "instance_type": "t3.medium",
        "instance_state": "running",
        "cpu_utilization": 32.5,
        "memory_utilization": 61.2,
        "network_in_gb": 2.4,
        "network_out_gb": 1.8,
        "request_count": 8500,
        "latency_ms": 180.0,
        "error_rate": 0.8,
        "availability": 99.95,
        "running_instances": 5,
        "min_instances": 2,
        "max_instances": 10,
        "hourly_cost": 4.20,
        "service_name": "api-service"
    }

    # 1. Validate AWS Pydantic model
    aws_model = AWSProviderInput(**aws_payload)
    assert aws_model.cloud_provider == "AWS"
    assert aws_model.instance_id == "i-0abc123456"
    assert aws_model.instance_type == "t3.medium"

    # 2. Normalize via AWSAdapter
    telemetry = AWSAdapter.normalize(aws_model)
    assert isinstance(telemetry, CommonTelemetry)
    assert telemetry.cloud_provider == "AWS"
    assert telemetry.service_name == "api-service"
    assert telemetry.resource_id == "i-0abc123456"
    assert telemetry.resource_type == "t3.medium"
    assert telemetry.cpu_utilization == 32.5
    assert telemetry.hourly_cost == 4.20
    assert telemetry.provider_metadata["account_id"] == "123456789012"


def test_azure_input_model_and_normalization():
    """Validates Azure provider schema and adapter normalization into CommonTelemetry."""
    azure_payload = {
        "cloud_provider": "Azure",
        "subscription_id": "sub-demo-001",
        "resource_group": "cloudguardian-rg",
        "region": "Central India",
        "vm_name": "api-server-01",
        "vm_size": "Standard_D2s_v5",
        "vm_status": "running",
        "cpu_utilization": 29.8,
        "memory_utilization": 58.7,
        "network_in_gb": 1.9,
        "network_out_gb": 1.4,
        "request_count": 7900,
        "latency_ms": 165.0,
        "failed_requests": 40,
        "error_rate": 0.5,
        "availability": 99.97,
        "running_instances": 4,
        "min_instances": 2,
        "max_instances": 8,
        "hourly_cost": 3.90,
        "service_name": "api-service"
    }

    # 1. Validate Azure Pydantic model
    azure_model = AzureProviderInput(**azure_payload)
    assert azure_model.cloud_provider == "Azure"
    assert azure_model.vm_name == "api-server-01"
    assert azure_model.vm_size == "Standard_D2s_v5"

    # 2. Normalize via AzureAdapter
    telemetry = AzureAdapter.normalize(azure_model)
    assert isinstance(telemetry, CommonTelemetry)
    assert telemetry.cloud_provider == "Azure"
    assert telemetry.resource_id == "api-server-01"
    assert telemetry.resource_type == "Standard_D2s_v5"
    assert telemetry.provider_metadata["resource_group"] == "cloudguardian-rg"


def test_gcp_input_model_and_normalization():
    """Validates GCP provider schema and adapter normalization into CommonTelemetry."""
    gcp_payload = {
        "cloud_provider": "GCP",
        "project_id": "cloudguardian-demo",
        "zone": "asia-south1-a",
        "instance_name": "api-instance-01",
        "machine_type": "e2-medium",
        "instance_status": "RUNNING",
        "cpu_utilization": 41.3,
        "memory_utilization": 67.1,
        "network_received_gb": 2.1,
        "network_sent_gb": 1.7,
        "request_count": 9200,
        "latency_ms": 195.0,
        "error_rate": 1.1,
        "availability": 99.92,
        "running_instances": 6,
        "min_instances": 2,
        "max_instances": 10,
        "hourly_cost": 4.50,
        "service_name": "api-service"
    }

    # 1. Validate GCP Pydantic model
    gcp_model = GCPProviderInput(**gcp_payload)
    assert gcp_model.cloud_provider == "GCP"
    assert gcp_model.instance_name == "api-instance-01"
    assert gcp_model.machine_type == "e2-medium"

    # 2. Normalize via GCPAdapter
    telemetry = GCPAdapter.normalize(gcp_model)
    assert isinstance(telemetry, CommonTelemetry)
    assert telemetry.cloud_provider == "GCP"
    assert telemetry.resource_id == "api-instance-01"
    assert telemetry.resource_type == "e2-medium"
    assert telemetry.region == "asia-south1-a"
    assert telemetry.provider_metadata["project_id"] == "cloudguardian-demo"


def test_provider_factory_normalization():
    """Tests the dynamic normalize_provider_data factory function."""
    aws_data = normalize_provider_data("AWS", {
        "region": "us-east-1",
        "instance_id": "i-12345",
        "instance_type": "m5.large",
        "cpu_utilization": 15.0,
        "memory_utilization": 30.0,
        "request_count": 500,
        "latency_ms": 120.0,
        "running_instances": 4,
        "hourly_cost": 8.0,
        "service_name": "web-api"
    })
    assert aws_data.cloud_provider == "AWS"
    assert aws_data.resource_id == "i-12345"

    with pytest.raises(ValueError):
        normalize_provider_data("ORACLE", {"service_name": "bad"})


# ==============================================================================
# 2. END-TO-END PIPELINE ACROSS PROVIDERS (AWS, AZURE, GCP)
# ==============================================================================

def test_aws_end_to_end_pipeline():
    """Full closed-loop pipeline for AWS: Load -> Agent 1 -> Agent 2 -> Safety -> Action -> Agent 3."""
    load_scenario("test_a", "AWS")
    assert get_active_provider() == "AWS"

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Review AWS services and reduce spend.",
        auto_apply=True
    )

    assert result["status"] == "completed"
    assert result["cloud_provider"] == "AWS"
    proposals = {p["service_id"]: p for p in result["proposals"]}
    
    assert "reports-worker" in proposals
    rw = proposals["reports-worker"]
    assert rw["investigation"]["diagnosis"] == "UNDER_UTILIZATION"
    assert rw["proposal"]["action_type"] == "scale_down"
    assert rw["safety"]["approved"] is True
    assert rw["verification"]["status"] == "SUCCESS"


def test_azure_end_to_end_pipeline():
    """Full closed-loop pipeline for Azure: Load -> Agent 1 -> Agent 2 -> Safety -> Action -> Agent 3."""
    load_scenario("test_a", "Azure")
    assert get_active_provider() == "Azure"

    services = get_all_services()
    assert len(services) > 0
    assert any(s["cloud_provider"] == "Azure" for s in services)

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Review Azure VMs and optimize capacity.",
        auto_apply=True
    )

    assert result["status"] == "completed"
    assert result["cloud_provider"] == "Azure"
    proposals = {p["service_id"]: p for p in result["proposals"]}
    
    assert "analytics-worker" in proposals
    aw = proposals["analytics-worker"]
    assert aw["investigation"]["diagnosis"] == "UNDER_UTILIZATION"
    assert aw["proposal"]["action_type"] == "scale_down"
    assert aw["safety"]["approved"] is True
    assert aw["verification"]["status"] == "SUCCESS"


def test_gcp_end_to_end_pipeline():
    """Full closed-loop pipeline for GCP: Load -> Agent 1 -> Agent 2 -> Safety -> Action -> Agent 3."""
    load_scenario("test_a", "GCP")
    assert get_active_provider() == "GCP"

    services = get_all_services()
    assert len(services) > 0
    assert any(s["cloud_provider"] == "GCP" for s in services)

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Review GCP instances and optimize spend safely.",
        auto_apply=True
    )

    assert result["status"] == "completed"
    assert result["cloud_provider"] == "GCP"
    proposals = {p["service_id"]: p for p in result["proposals"]}
    
    assert "batch-processor" in proposals
    bp = proposals["batch-processor"]
    assert bp["investigation"]["diagnosis"] == "UNDER_UTILIZATION"
    assert bp["proposal"]["action_type"] == "scale_down"
    assert bp["safety"]["approved"] is True
    assert bp["verification"]["status"] == "SUCCESS"


# ==============================================================================
# 3. AI AGENT INSTRUCTION TESTING (PART Q REQUIREMENT)
# ==============================================================================

def test_instruction_cost_increasing_vs_latency_priority():
    """
    Verifies that changing user instruction meaningfully affects Agent reasoning:
    1. 'Focus on latency before recommending any scaling action'
    2. 'Check whether the service is over-provisioned'
    3. 'Find the most expensive resource'
    4. 'Determine whether scaling down is safe'
    """
    load_scenario("test_a", "AWS")

    # Instruction 1: Focus on latency
    res_latency = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Focus on latency before recommending any scaling action."
    )
    p_lat = res_latency["proposals"][0]
    assert "latency" in p_lat["investigation"]["diagnosis_reason"].lower() or "latency" in p_lat["proposal"]["reason"].lower()

    # Instruction 2: Check over-provisioned
    res_overprov = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Check whether the service is over-provisioned."
    )
    p_op = res_overprov["proposals"][0]
    assert "over-provision" in p_op["investigation"]["diagnosis_reason"].lower() or "over-provision" in p_op["proposal"]["reason"].lower()

    # Instruction 3: Find most expensive resource
    res_expensive = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Find the most expensive resource."
    )
    p_exp = res_expensive["proposals"][0]
    assert "expensive" in p_exp["investigation"]["diagnosis_reason"].lower() or "spend" in p_exp["investigation"]["diagnosis_reason"].lower() or "$" in p_exp["investigation"]["diagnosis_reason"]

    # Instruction 4: Determine whether scaling down is safe
    res_safety = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt="Determine whether scaling down is safe."
    )
    p_safe = res_safety["proposals"][0]
    assert "safe" in p_safe["investigation"]["diagnosis_reason"].lower() or "safe" in p_safe["proposal"]["reason"].lower()


def test_all_five_part_q_test_prompts_individually():
    """
    Explicitly executes each of the 5 instructions requested in Part Q
    and verifies that each produces distinct, prompt-driven analysis:
    1. 'Investigate why the cloud cost is increasing.'
    2. 'Check whether the service is over-provisioned.'
    3. 'Focus on latency before recommending any scaling action.'
    4. 'Find the most expensive resource.'
    5. 'Determine whether scaling down is safe.'
    """
    load_scenario("test_a", "AWS")

    prompts = [
        "Investigate why the cloud cost is increasing.",
        "Check whether the service is over-provisioned.",
        "Focus on latency before recommending any scaling action.",
        "Find the most expensive resource.",
        "Determine whether scaling down is safe."
    ]

    results = []
    for prompt in prompts:
        res = WorkflowOrchestrator.run_path_a_pipeline(user_prompt=prompt)
        assert res["status"] == "completed"
        assert len(res["proposals"]) > 0
        results.append(res)

    # Verify that the summaries or reasons are distinct and driven by prompt intent
    summaries = [r["investigation"]["summary"] for r in results]
    assert len(set(summaries)) > 1, "Agent summaries should differ across different user prompts"


# ==============================================================================
# 4. MULTI-CLOUD API ENDPOINTS TESTS (PART P)
# ==============================================================================

def test_cloud_providers_api():
    """Tests GET /api/cloud/providers."""
    res = client.get("/api/cloud/providers")
    assert res.status_code == 200
    data = res.json()
    assert "supported_providers" in data
    assert "AWS" in data["supported_providers"]
    assert "Azure" in data["supported_providers"]
    assert "GCP" in data["supported_providers"]


def test_cloud_provider_selection_api():
    """Tests POST /api/cloud/provider/select."""
    # Switch to Azure
    res = client.post("/api/cloud/provider/select", json={"provider": "Azure", "scenario_id": "test_a"})
    assert res.status_code == 200
    data = res.json()
    assert data["active_provider"] == "Azure"
    assert len(data["services"]) > 0

    # Switch to GCP
    res_gcp = client.post("/api/cloud/provider/select", json={"provider": "GCP", "scenario_id": "test_a"})
    assert res_gcp.status_code == 200
    data_gcp = res_gcp.json()
    assert data_gcp["active_provider"] == "GCP"


def test_cloud_telemetry_normalization_api():
    """Tests POST /api/cloud/telemetry ingestion & validation endpoint."""
    raw_aws = {
        "cloud_provider": "AWS",
        "region": "ap-south-1",
        "account_id": "999888777666",
        "instance_id": "i-099887766",
        "instance_type": "c5.xlarge",
        "instance_state": "running",
        "cpu_utilization": 55.0,
        "memory_utilization": 70.0,
        "network_in_gb": 10.0,
        "network_out_gb": 8.0,
        "request_count": 12000,
        "latency_ms": 190.0,
        "running_instances": 8,
        "hourly_cost": 16.0,
        "service_name": "payments-backend"
    }

    res = client.post("/api/cloud/telemetry", json={"provider": "AWS", "provider_data": raw_aws})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "normalized"
    assert data["provider"] == "AWS"
    assert data["normalized_telemetry"]["resource_id"] == "i-099887766"


def test_sqlite_history_with_provider_attribution():
    """Tests that optimization history and audit logs record cloud_provider."""
    load_scenario("test_a", "AWS")
    WorkflowOrchestrator.run_path_a_pipeline(auto_apply=True)

    history = get_optimization_history(limit=5)
    assert len(history) > 0
    assert "cloud_provider" in history[0]
    assert history[0]["cloud_provider"] in ["AWS", "AZURE", "GCP"]
