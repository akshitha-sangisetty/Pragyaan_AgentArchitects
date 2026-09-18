"""
FastAPI Server for Autonomous Cloud Cost Optimization System.
Provides REST and SSE endpoints for Mission Control UI and external integrations.
"""

import os
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.database import (
    init_db, 
    load_scenario, 
    get_all_services, 
    get_optimization_history,
    get_db_connection,
    get_user_goals,
    update_user_goals
)
from app.schemas import UserGoals
from app.workflow import WorkflowOrchestrator
from app.cloud_sim import get_service_state, execute_cloud_action, simulate_telemetry_tick
from app.agents.verifier import verify_action_outcome

# Initialize FastAPI application
app = FastAPI(
    title="Autonomous Cloud Cost Optimization System",
    description="Multi-agent closed-loop cloud cost optimization system with deterministic safety enforcement.",
    version="1.0.0"
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


# Request / Response Schemas for API
class ScenarioLoadRequest(BaseModel):
    scenario_id: str


class RecommendRequest(BaseModel):
    user_prompt: str = "Review services and optimize cost safely without breaking latency."
    auto_apply: bool = False
    target_service_id: Optional[str] = None


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
    # If no services exist, load test_a by default
    existing = get_all_services()
    if not existing:
        load_scenario("test_a")


# API Endpoints
@app.get("/api/services")
def list_services():
    """Retrieve all current cloud services and metrics."""
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


@app.post("/api/scenario/load")
def load_scenario_endpoint(req: ScenarioLoadRequest):
    """Load an official hackathon test case (test_a, test_b, test_c, test_d)."""
    try:
        data = load_scenario(req.scenario_id)
        return {
            "status": "success",
            "scenario": req.scenario_id,
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
    """Retrieve optimization history and audit logs."""
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


# Static Frontend Files Mount
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_dashboard():
        return FileResponse(str(FRONTEND_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
