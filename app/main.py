"""
FastAPI Server for Autonomous Cloud Cost Optimization System.
Provides REST and SSE endpoints for Mission Control UI and Multi-Cloud integrations.
"""

import os
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.database import (
    init_db, 
    load_scenario, 
    get_all_services, 
    get_optimization_history,
    get_db_connection,
    get_user_goals,
    update_user_goals,
    get_active_provider,
    set_active_provider,
    normalize_provider_name,
    load_uploaded_services
)
from app.schemas import (
    UploadServicesRequest,
    UploadedService,
    UserGoals, 
    AWSProviderInput, 
    AzureProviderInput, 
    GCPProviderInput, 
    CommonTelemetry
)
from app.adapters import normalize_provider_data, common_telemetry_to_service_state
from app.workflow import WorkflowOrchestrator
from app.cloud_sim import get_service_state, execute_cloud_action, simulate_telemetry_tick
from app.agents.verifier import verify_action_outcome

# Initialize FastAPI application
app = FastAPI(
    title="Cloud Guardian - Autonomous Multi-Cloud Cost Optimization System",
    description="Multi-agent closed-loop cloud cost optimization system with multi-cloud support (AWS, Azure, GCP) and deterministic safety enforcement.",
    version="2.0.0"
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ==============================================================================
# Request / Response Schemas for API
# ==============================================================================

class ScenarioLoadRequest(BaseModel):
    scenario_id: str
    provider: Optional[str] = None


class ProviderSelectRequest(BaseModel):
    provider: str = Field(..., description="Cloud provider (AWS, Azure, GCP)")
    scenario_id: Optional[str] = Field("test_a", description="Scenario to load under new provider")


class CloudTelemetryIngestRequest(BaseModel):
    provider: str = Field(..., description="Provider name: AWS, Azure, GCP")
    provider_data: Dict[str, Any] = Field(..., description="Raw provider-specific telemetry payload")


class RecommendRequest(BaseModel):
    user_prompt: str = "Review services and optimize cost safely without breaking latency."
    auto_apply: bool = False
    target_service_id: Optional[str] = None
    provider: Optional[str] = None


class ManualEvaluateRequest(BaseModel):
    service_id: str
    target_instances: int


class ApplyActionRequest(BaseModel):
    service_id: str
    action_type: str
    target_instances: int


class RollbackRequest(BaseModel):
    service_id: str


@app.on_event("startup")
def startup_event():
    """Ensure database is initialized and seeded with default Test A scenario on launch."""
    init_db()
    existing = get_all_services()
    if not existing:
        load_scenario("test_a", "AWS")


# ==============================================================================
# Core & Health Endpoints
# ==============================================================================

@app.get("/health")
def health_check():
    """Health check endpoint for Render uptime monitoring."""
    return {"status": "ok", "service": "cloud-guardian-agent-backend", "version": "2.0.0"}


@app.get("/api/services")
def list_services():
    """Retrieve all current cloud services and metrics with provider attribution."""
    return get_all_services()


@app.get("/api/goals")
def get_goals_endpoint():
    """Step 1 of P3: Retrieve developer goals and boundaries."""
    return get_user_goals()


@app.post("/api/goals")
def update_goals_endpoint(goals: UserGoals):
    """Step 1 of P3: Update developer goals and boundaries."""
    return update_user_goals(goals.model_dump())


@app.post("/api/telemetry/tick")
def telemetry_tick_endpoint():
    """Simulate real-time telemetry jitter for continuous live monitoring."""
    return simulate_telemetry_tick()


# ==============================================================================
# Multi-Cloud Endpoints (Parts C, D, H, P)
# ==============================================================================

@app.get("/api/cloud/providers")
def get_cloud_providers():
    """List supported cloud providers and the currently active selection."""
    return {
        "supported_providers": ["AWS", "Azure", "GCP"],
        "active_provider": get_active_provider()
    }


@app.post("/api/cloud/provider/select")
def select_cloud_provider(req: ProviderSelectRequest):
    """
    Switch active cloud provider (AWS, Azure, GCP) and load provider-specific simulated data.
    """
    prov = normalize_provider_name(req.provider)
    if prov not in ["AWS", "Azure", "GCP"]:
        raise HTTPException(status_code=400, detail=f"Invalid cloud provider '{req.provider}'. Allowed: AWS, Azure, GCP")

    set_active_provider(prov)
    scenario_id = req.scenario_id or "test_a"
    scenario_data = load_scenario(scenario_id, prov)

    return {
        "status": "success",
        "active_provider": prov,
        "scenario_id": scenario_id,
        "name": scenario_data["name"],
        "services": get_all_services()
    }


@app.post("/api/cloud/telemetry")
def ingest_cloud_telemetry(req: CloudTelemetryIngestRequest):
    """
    Ingests provider-specific raw telemetry (AWS, Azure, GCP),
    validates the provider-specific schema, and normalizes it into CommonTelemetry.
    """
    try:
        common_tel = normalize_provider_data(req.provider, req.provider_data)
        return {
            "status": "normalized",
            "provider": common_tel.cloud_provider,
            "normalized_telemetry": common_tel.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Normalization failed for {req.provider} payload: {str(e)}")


# ==============================================================================
# Scenario & Recommendation Endpoints
# ==============================================================================

@app.post("/api/scenario/load")
def load_scenario_endpoint(req: ScenarioLoadRequest):
    """Load an official test scenario (test_a, test_b, test_c, test_d) for the active provider."""
    try:
        active_prov = req.provider or get_active_provider()
        data = load_scenario(req.scenario_id, active_prov)
        return {
            "status": "success",
            "scenario": req.scenario_id,
            "cloud_provider": active_prov,
            "name": data["name"],
            "description": data["description"],
            "prompt": data["prompt"],
            "services": get_all_services()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/recommend")
def run_recommend_endpoint(req: RecommendRequest):
    """
    Path A: Run autonomous 3-agent pipeline.
    Investigates state, produces action recommendations with reasoning and safety validation.
    """
    if req.provider:
        set_active_provider(req.provider)

    result = WorkflowOrchestrator.run_path_a_pipeline(
        user_prompt=req.user_prompt,
        auto_apply=req.auto_apply,
        target_service_id=req.target_service_id
    )
    return result


@app.post("/api/evaluate-manual")
def evaluate_manual_endpoint(req: ManualEvaluateRequest):
    """
    Path B: Pre-flight safety and operational evaluation for manual slider adjustments.
    """
    result = WorkflowOrchestrator.evaluate_manual_change(
        service_id=req.service_id,
        target_instances=req.target_instances
    )
    return result


@app.post("/api/apply-action")
def apply_action_endpoint(req: ApplyActionRequest):
    """
    Applies an approved recommendation to the simulated cloud environment,
    then executes Agent 3 (Verifier) to produce a Before vs After verification diff.
    """
    before_state = get_service_state(req.service_id)
    if not before_state:
        raise HTTPException(status_code=404, detail=f"Service {req.service_id} not found.")

    action_res = execute_cloud_action(
        service_id=req.service_id,
        action_type=req.action_type,
        target_instances=req.target_instances
    )

    verification = verify_action_outcome(before_state, action_res)
    after_state = get_service_state(req.service_id)

    return {
        "status": "applied" if action_res.status == "applied" else "failed",
        "cloud_provider": before_state.cloud_provider or get_active_provider(),
        "action_result": action_res.model_dump(),
        "verification": verification.model_dump(),
        "before_state": before_state.model_dump(),
        "after_state": after_state.model_dump() if after_state else None
    }


@app.post("/api/rollback")
def rollback_endpoint(req: RollbackRequest):
    """Executes a rollback to restore previous safe configuration."""
    result = WorkflowOrchestrator.execute_rollback(req.service_id)
    return result


@app.get("/api/history")
def get_history(service_id: Optional[str] = Query(None)):
    """Retrieve optimization history and audit logs with cloud provider context."""
    history = get_optimization_history(service_id=service_id, limit=20)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_log ORDER BY log_id DESC LIMIT 30")
    audit_rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {
        "optimization_history": history,
        "audit_log": audit_rows
    }


# ==============================================================================
# Static Frontend Files Mount
# ==============================================================================

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_dashboard():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/styles.css")
    def serve_styles():
        return FileResponse(str(FRONTEND_DIR / "styles.css"))

    @app.get("/app.js")
    def serve_app_js():
        return FileResponse(str(FRONTEND_DIR / "app.js"))

    @app.get("/config.js")
    def serve_config_js():
        cfg_file = FRONTEND_DIR / "config.js"
        if cfg_file.exists():
            return FileResponse(str(cfg_file))
        return JSONResponse(content={})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)


@app.post("/api/services/upload")
def upload_services_endpoint(req: UploadServicesRequest):
    try:
        load_uploaded_services(req.services)
        return {
            "success": True,
            "message": "Services uploaded successfully",
            "serviceCount": len(req.services),
            "services": [s.model_dump() for s in req.services]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
