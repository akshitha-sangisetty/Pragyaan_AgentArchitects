"""
Pydantic Data Models for the Autonomous Cloud Cost Optimization System.
Shared data contracts for all system components and agents.
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


class ServiceState(BaseModel):
    service_id: str
    cpu_percent: float = Field(..., description="CPU utilization percentage (0-100)")
    memory_percent: float = Field(..., description="Memory utilization percentage (0-100)")
    requests_per_minute: int = Field(..., description="Current request rate per minute")
    previous_requests_per_minute: Optional[int] = Field(None, description="Previous RPM if traffic change detected")
    latency_ms: float = Field(..., description="Current P95 response latency in ms")
    instances: int = Field(..., description="Current number of active instances")
    cost_per_hour: float = Field(..., description="Current hourly cost per instance or total")
    min_instances: int = Field(..., description="Minimum permitted instances (hard bound)")
    max_instances: int = Field(..., description="Maximum permitted instances (hard bound)")
    max_latency_ms: float = Field(..., description="Maximum allowed latency SLA in ms")
    healthy: bool = Field(True, description="Service health check status")
    timestamp: str = Field(..., description="Observation ISO timestamp (e.g. 2026-09-17T10:30:00Z)")


class ServiceInvestigation(BaseModel):
    service_id: str
    current_state: ServiceState
    is_fresh: bool = Field(..., description="Whether the observation timestamp is within freshness threshold")
    age_minutes: float = Field(..., description="Age of observation in minutes relative to current time")
    fresh_traffic_pulled: Optional[int] = Field(None, description="Fresh traffic value fetched if observation was stale")
    diagnosis: Literal[
        "UNDER_UTILIZATION",
        "RISING_TRAFFIC",
        "STALE_METRICS",
        "CRITICAL_LOAD",
        "CAPACITY_RISK",
        "HEALTHY_STABLE"
    ] = Field(..., description="Situational diagnosis by Agent 1")
    diagnosis_reason: str = Field(..., description="Evidence and plain-language explanation of diagnosis")


class InvestigationReport(BaseModel):
    investigation_id: str
    current_time: str
    services_investigated: List[ServiceInvestigation]
    summary: str


class ActionProposal(BaseModel):
    service_id: str
    action_type: Literal["scale_down", "scale_up", "resize", "stop_idle_service", "no_action"]
    current_instances: int
    target_instances: int
    reason: str = Field(..., description="Plain-language reason for proposed action")
    projected_cost_delta_per_hr: float = Field(..., description="Estimated cost change (negative is savings)")
    projected_latency_impact: str = Field(..., description="Expected latency effect (e.g. 'none', 'slight increase within SLA')")
    risk_level: Literal["low", "medium", "high"] = Field("low", description="Assessed risk level")
    memory_referenced: Optional[str] = Field(None, description="Past optimization outcome retrieved from memory")


class SafetyCheckResult(BaseModel):
    approved: bool
    reason: str
    violated_rules: List[str] = Field(default_factory=list)
    action_type: str
    target_instances: int


class ManualProposalEvaluation(BaseModel):
    service_id: str
    proposed_instances: int
    recommendation: Literal["RECOMMENDED", "NOT_RECOMMENDED", "UNSAFE_BLOCKED"]
    safety: SafetyCheckResult
    reason: str
    projected_impact: Dict[str, Any] = Field(default_factory=dict)


class ActionResult(BaseModel):
    action_id: str
    service_id: str
    action_type: str
    requested_instances: int
    applied_instances: int
    status: Literal["applied", "failed", "rejected"]
    error: Optional[str] = None
    applied_at: str


class MetricComparison(BaseModel):
    metric_name: str
    before: float
    after: float
    unit: str
    change_percent: float
    improved: bool


class VerificationReport(BaseModel):
    verification_id: str
    service_id: str
    status: Literal["SUCCESS", "DEGRADED", "FAILED"]
    sla_maintained: bool
    cost_reduced: bool
    comparisons: List[MetricComparison]
    summary: str
    recovery_recommended: bool
    recovery_action: Optional[str] = None


class OptimizationHistoryRecord(BaseModel):
    history_id: Optional[int] = None
    service_id: str
    action_type: str
    instances_before: int
    instances_after: int
    cost_before: float
    cost_after: float
    latency_before: float
    latency_after: float
    status: str
    notes: str
    created_at: str
