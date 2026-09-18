"""
Deterministic Workflow Orchestrator
Coordinates the closed-loop optimization pipeline:
Live State -> Agent 1 (Investigator) -> Agent 2 (Optimizer) -> Deterministic Safety -> Apply -> Agent 3 (Verifier) -> Memory / Recovery
"""

from typing import Dict, Any, List, Optional, AsyncGenerator
import json
import asyncio
from datetime import datetime, timezone
from app.schemas import (
    ServiceState,
    InvestigationReport,
    ActionProposal,
    SafetyCheckResult,
    ActionResult,
    VerificationReport,
    ManualProposalEvaluation
)
from app.cloud_sim import get_service_state, execute_cloud_action
from app.database import get_all_services, record_audit, get_optimization_history, get_user_goals
from app.agents.investigator import run_investigation
from app.agents.optimizer import recommend_action, evaluate_manual_proposal
from app.agents.verifier import verify_action_outcome
from app.safety_engine import validate_proposed_action


class WorkflowOrchestrator:
    """Manages the execution lifecycle of cost optimization workflows."""

    @staticmethod
    def get_current_cloud_state() -> List[ServiceState]:
        """Fetch all active services from the simulated environment."""
        raw_list = get_all_services()
        return [
            ServiceState(
                service_id=s["service_id"],
                cpu_percent=s["cpu_percent"],
                memory_percent=s["memory_percent"],
                requests_per_minute=s["requests_per_minute"],
                previous_requests_per_minute=s.get("previous_requests_per_minute"),
                latency_ms=s["latency_ms"],
                instances=s["instances"],
                cost_per_hour=s["cost_per_hour"],
                min_instances=s["min_instances"],
                max_instances=s["max_instances"],
                max_latency_ms=s["max_latency_ms"],
                healthy=bool(s["healthy"]),
                timestamp=s["timestamp"]
            )
            for s in raw_list
        ]

    @staticmethod
    def run_path_a_pipeline(
        user_prompt: str = "Review services and optimize cost safely.",
        auto_apply: bool = False,
        target_service_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Path A: Full autonomous workflow.
        Returns complete structured record of the run.
        """
        now_str = datetime.now(timezone.utc).isoformat()
        services = WorkflowOrchestrator.get_current_cloud_state()
        if target_service_id:
            services = [s for s in services if s.service_id == target_service_id]

        if not services:
            return {"error": "No services found in cloud registry."}

        # Step 1: Agent 1 - Investigator
        investigation_report = run_investigation(services, user_prompt=user_prompt)
        record_audit("INVESTIGATION_COMPLETED", {"report_id": investigation_report.investigation_id})

        # Step 2: Agent 2 - Optimizer + Deterministic Safety Check
        proposals: List[Dict[str, Any]] = []
        action_results: List[ActionResult] = []
        verification_reports: List[VerificationReport] = []

        # Fetch active user goals (Step 1 of P3)
        user_goals = get_user_goals()

        for inv in investigation_report.services_investigated:
            proposal = recommend_action(inv, user_prompt=user_prompt)
            
            # Deterministic Safety Check with User Goals enforcement
            effective_rpm = inv.fresh_traffic_pulled if inv.fresh_traffic_pulled else inv.current_state.requests_per_minute
            safety_result = validate_proposed_action(
                service=inv.current_state,
                action_type=proposal.action_type,
                target_instances=proposal.target_instances,
                is_fresh=inv.is_fresh,
                current_rpm=effective_rpm,
                user_goals=user_goals
            )

            proposal_record = {
                "service_id": inv.service_id,
                "investigation": inv.model_dump(),
                "proposal": proposal.model_dump(),
                "safety": safety_result.model_dump()
            }

            # Step 3: Apply action if auto_apply requested and approved
            if auto_apply and safety_result.approved and proposal.action_type not in ["no_action"]:
                before_state = inv.current_state
                action_res = execute_cloud_action(
                    service_id=inv.service_id,
                    action_type=proposal.action_type,
                    target_instances=proposal.target_instances
                )
                action_results.append(action_res)
                proposal_record["action_result"] = action_res.model_dump()

                # Step 4: Agent 3 - Verifier
                ver_rep = verify_action_outcome(before_state, action_res)
                verification_reports.append(ver_rep)
                proposal_record["verification"] = ver_rep.model_dump()
            
            proposals.append(proposal_record)

        return {
            "status": "completed",
            "timestamp": now_str,
            "investigation": investigation_report.model_dump(),
            "proposals": proposals,
            "action_results": [a.model_dump() for a in action_results],
            "verifications": [v.model_dump() for v in verification_reports]
        }

    @staticmethod
    def evaluate_manual_change(service_id: str, target_instances: int) -> Dict[str, Any]:
        """
        Path B: Evaluates a manual slider adjustment.
        """
        svc = get_service_state(service_id)
        if not svc:
            return {"error": f"Service {service_id} not found."}

        user_goals = get_user_goals()
        inv_report = run_investigation([svc], user_prompt="Manual review")
        svc_inv = inv_report.services_investigated[0]
        
        evaluation: ManualProposalEvaluation = evaluate_manual_proposal(
            svc_inv, 
            target_instances, 
            user_goals=user_goals
        )
        return evaluation.model_dump()

    @staticmethod
    def execute_rollback(service_id: str) -> Dict[str, Any]:
        """Rollback to previous instance configuration based on optimization history."""
        history = get_optimization_history(service_id=service_id, limit=2)
        if not history:
            return {"error": f"No previous history found to rollback for {service_id}."}

        last_action = history[0]
        target_instances = last_action["instances_before"]
        
        svc = get_service_state(service_id)
        if not svc:
            return {"error": f"Service {service_id} not found."}

        action_res = execute_cloud_action(
            service_id=service_id,
            action_type="scale_up" if target_instances > svc.instances else "scale_down",
            target_instances=target_instances
        )
        record_audit("ROLLBACK_EXECUTED", {"service_id": service_id, "restored_instances": target_instances}, service_id)
        
        return {
            "status": "rolled_back",
            "service_id": service_id,
            "restored_instances": target_instances,
            "action_result": action_res.dict()
        }
