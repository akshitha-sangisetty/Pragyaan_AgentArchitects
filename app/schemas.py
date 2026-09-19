"""
Pydantic Data Models for the Autonomous Cloud Cost Optimization System.
Shared data contracts for all system components, multi-cloud adapters, and agents.
All provider models represent SIMULATED cloud environments (No real cloud credentials or connections).
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, model_validator


# ==============================================================================
# PROVIDER-SPECIFIC SIMULATED INPUT SCHEMAS (Parts E, F, G)
# ==============================================================================

class AWSProviderInput(BaseModel):
    """
    Simulated AWS Cloud Provider Telemetry Input Model.
    Represents realistic AWS EC2 / CloudWatch telemetry fields.
    """
    cloud_provider: Literal["AWS"] = Field("AWS", description="[SIMULATED] Provider identifier")
    region: str = Field(..., description="[SIMULATED] AWS Region (e.g., ap-south-1, us-east-1)")
    account_id: str = Field("123456789012", description="[SIMULATED] AWS 12-digit Account ID")
    instance_id: str = Field(..., description="[SIMULATED] AWS EC2 Instance ID (e.g., i-0abc123456)")
    instance_type: str = Field(..., description="[SIMULATED] AWS Instance Type (e.g., t3.medium, m5.large)")
    instance_state: str = Field("running", description="[SIMULATED] AWS Instance State (e.g., running, stopped)")
    cpu_utilization: float = Field(..., description="[SIMULATED] CloudWatch CPUUtilization percentage (0-100)")
    memory_utilization: float = Field(..., description="[SIMULATED] CloudWatch MemoryUtilization percentage (0-100)")
    network_in_gb: float = Field(0.0, description="[SIMULATED] NetworkIn traffic in Gigabytes")
    network_out_gb: float = Field(0.0, description="[SIMULATED] NetworkOut traffic in Gigabytes")
    request_count: int = Field(..., description="[SIMULATED] ALB RequestCount per minute")
    latency_ms: float = Field(..., description="[SIMULATED] TargetResponseTime P95 latency in ms")
    error_rate: float = Field(0.1, description="[SIMULATED] HTTPCode_Target_5XX_Count error percentage")
    availability: float = Field(99.95, description="[SIMULATED] Availability percentage (e.g., 99.95)")
    running_instances: int = Field(..., description="[SIMULATED] Auto Scaling Group desired/running instances")
    min_instances: int = Field(1, description="[SIMULATED] Auto Scaling Group MinSize")
    max_instances: int = Field(10, description="[SIMULATED] Auto Scaling Group MaxSize")
    hourly_cost: float = Field(..., description="[SIMULATED] AWS hourly billing cost for the service in USD")
    service_name: str = Field(..., description="[SIMULATED] Logical service identifier (e.g., api-service, orders-api)")
    timestamp: Optional[str] = Field(None, description="[SIMULATED] Metric observation ISO timestamp")


class AzureProviderInput(BaseModel):
    """
    Simulated Azure Cloud Provider Telemetry Input Model.
    Represents realistic Azure Monitor / Virtual Machine Scale Set telemetry fields.
    """
    cloud_provider: Literal["Azure"] = Field("Azure", description="[SIMULATED] Provider identifier")
    subscription_id: str = Field("sub-demo-001", description="[SIMULATED] Azure Subscription ID")
    resource_group: str = Field("cloudguardian-rg", description="[SIMULATED] Azure Resource Group name")
    region: str = Field(..., description="[SIMULATED] Azure Region (e.g., Central India, East US)")
    vm_name: str = Field(..., description="[SIMULATED] Azure VM Name (e.g., api-server-01)")
    vm_size: str = Field(..., description="[SIMULATED] Azure VM Size tier (e.g., Standard_D2s_v5)")
    vm_status: str = Field("running", description="[SIMULATED] Azure VM PowerState (e.g., running, deallocated)")
    cpu_utilization: float = Field(..., description="[SIMULATED] Percentage CPU metric (0-100)")
    memory_utilization: float = Field(..., description="[SIMULATED] Available Memory Bytes percentage used (0-100)")
    network_in_gb: float = Field(0.0, description="[SIMULATED] Network In Total in Gigabytes")
    network_out_gb: float = Field(0.0, description="[SIMULATED] Network Out Total in Gigabytes")
    request_count: int = Field(..., description="[SIMULATED] App Service / Application Gateway Requests per minute")
    latency_ms: float = Field(..., description="[SIMULATED] Average Response Time in ms")
    failed_requests: int = Field(0, description="[SIMULATED] Count of failed requests (HTTP 5xx)")
    error_rate: float = Field(0.1, description="[SIMULATED] Failed request percentage")
    availability: float = Field(99.97, description="[SIMULATED] Availability percentage")
    running_instances: int = Field(..., description="[SIMULATED] VMSS active VM capacity count")
    min_instances: int = Field(1, description="[SIMULATED] VMSS minimum capacity")
    max_instances: int = Field(8, description="[SIMULATED] VMSS maximum capacity")
    hourly_cost: float = Field(..., description="[SIMULATED] Azure Cost Management estimated hourly spend in USD")
    service_name: str = Field(..., description="[SIMULATED] Logical service identifier")
    timestamp: Optional[str] = Field(None, description="[SIMULATED] Metric observation ISO timestamp")


class GCPProviderInput(BaseModel):
    """
    Simulated Google Cloud Platform (GCP) Telemetry Input Model.
    Represents realistic Google Cloud Monitoring / Compute Engine MIG telemetry fields.
    """
    cloud_provider: Literal["GCP"] = Field("GCP", description="[SIMULATED] Provider identifier")
    project_id: str = Field("cloudguardian-demo", description="[SIMULATED] GCP Project ID")
    zone: str = Field(..., description="[SIMULATED] GCP Zone (e.g., asia-south1-a, us-central1-a)")
    instance_name: str = Field(..., description="[SIMULATED] GCP Instance Name (e.g., api-instance-01)")
    machine_type: str = Field(..., description="[SIMULATED] GCP Machine Type (e.g., e2-medium, n2-standard-4)")
    instance_status: str = Field("RUNNING", description="[SIMULATED] GCP Instance Status (e.g., RUNNING, TERMINATED)")
    cpu_utilization: float = Field(..., description="[SIMULATED] compute.googleapis.com/instance/cpu/utilization (0-100)")
    memory_utilization: float = Field(..., description="[SIMULATED] agent.googleapis.com/memory/percent_used (0-100)")
    network_received_gb: float = Field(0.0, description="[SIMULATED] compute.googleapis.com/instance/network/received_bytes_count in GB")
    network_sent_gb: float = Field(0.0, description="[SIMULATED] compute.googleapis.com/instance/network/sent_bytes_count in GB")
    request_count: int = Field(..., description="[SIMULATED] loadbalancing.googleapis.com/https/request_count per minute")
    latency_ms: float = Field(..., description="[SIMULATED] Backend Request Latency P95 in ms")
    error_rate: float = Field(0.1, description="[SIMULATED] 5xx error response rate percentage")
    availability: float = Field(99.92, description="[SIMULATED] Service uptime availability percentage")
    running_instances: int = Field(..., description="[SIMULATED] Managed Instance Group (MIG) current target size")
    min_instances: int = Field(1, description="[SIMULATED] MIG autoscaling minNumReplicas")
    max_instances: int = Field(10, description="[SIMULATED] MIG autoscaling maxNumReplicas")
    hourly_cost: float = Field(..., description="[SIMULATED] Google Cloud Billing estimated hourly cost in USD")
    service_name: str = Field(..., description="[SIMULATED] Logical service identifier")
    timestamp: Optional[str] = Field(None, description="[SIMULATED] Metric observation ISO timestamp")


# ==============================================================================
# NORMALIZED COMMON TELEMETRY MODEL (Part H)
# ==============================================================================

class CommonTelemetry(BaseModel):
    """
    Normalized Common Cloud Guardian Telemetry Model.
    All agents operate strictly on this normalized representation.
    """
    cloud_provider: Literal["AWS", "Azure", "GCP"] = Field(..., description="Source cloud provider")
    service_name: str = Field(..., description="Standardized service identifier")
    region: str = Field(..., description="Normalized deployment region/zone")
    resource_id: str = Field(..., description="Provider resource ID (EC2 ID / VM Name / GCP Instance)")
    resource_type: str = Field(..., description="Instance type / VM size / Machine type tier")
    resource_state: str = Field("running", description="Operational power state")
    cpu_utilization: float = Field(..., description="CPU percentage (0-100)")
    memory_utilization: float = Field(..., description="Memory percentage (0-100)")
    request_count: int = Field(..., description="Requests per minute")
    latency_ms: float = Field(..., description="P95 response latency in ms")
    error_rate: float = Field(0.1, description="Error rate percentage (0-100)")
    availability: float = Field(99.95, description="Availability uptime percentage")
    running_instances: int = Field(..., description="Current running instances/nodes")
    min_instances: int = Field(1, description="Minimum allowable instance bound")
    max_instances: int = Field(10, description="Maximum allowable instance bound")
    hourly_cost: float = Field(..., description="Current total hourly cost in USD")
    network_in_gb: float = Field(0.0, description="Inbound network traffic in GB")
    network_out_gb: float = Field(0.0, description="Outbound network traffic in GB")
    max_latency_ms: float = Field(300.0, description="Maximum SLA latency threshold in ms")
    healthy: bool = Field(True, description="Overall health check status")
    timestamp: str = Field(..., description="Observation ISO timestamp (e.g. 2026-09-17T10:30:00Z)")
    provider_metadata: Dict[str, Any] = Field(default_factory=dict, description="Provider-specific context fields")


# ==============================================================================
# LEGACY SERVICE STATE (Maintained for full backward compatibility)
# ==============================================================================

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
    error_rate_percent: float = Field(0.1, description="Current error rate percentage (e.g. 0.1%)")
    resource_size: str = Field("Standard", description="Instance tier sizing (e.g. Standard, Small, Large)")
    timestamp: str = Field(..., description="Observation ISO timestamp (e.g. 2026-09-17T10:30:00Z)")
    # Multi-Cloud fields (Optional with safe defaults for backward compatibility)
    cloud_provider: str = Field("AWS", description="Cloud provider (AWS, Azure, GCP)")
    resource_id: Optional[str] = Field(None, description="Specific provider resource identifier")
    resource_type: Optional[str] = Field(None, description="Instance type or VM size")
    region: Optional[str] = Field(None, description="Cloud region or zone")
    provider_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Provider metadata")


class UserGoals(BaseModel):
    """Developer-defined goals and boundaries from Step 1 of P3."""
    target_cost_reduction_percent: float = Field(25.0, description="Target reduction percentage (e.g. 25%)")
    max_acceptable_latency_ms: float = Field(300.0, description="Global maximum acceptable latency SLA")
    default_min_instances: int = Field(1, description="Global minimum instance capacity limit")
    max_hourly_budget: float = Field(50.0, description="Maximum allowable total hourly cloud spend")
    monitoring_enabled: bool = Field(True, description="Live continuous monitoring toggle")


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
    cloud_provider: Optional[str] = Field("AWS", description="Identified cloud provider")
    normalized_telemetry: Optional[Dict[str, Any]] = Field(None, description="Normalized CommonTelemetry payload")


class InvestigationReport(BaseModel):
    investigation_id: str
    current_time: str
    services_investigated: List[ServiceInvestigation]
    summary: str
    cloud_provider: Optional[str] = Field("AWS", description="Active cloud provider for report")


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
    cloud_provider: Optional[str] = Field("AWS", description="Target cloud provider")


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
    cloud_provider: Optional[str] = Field("AWS", description="Cloud provider action was executed in")


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
    cloud_provider: Optional[str] = Field("AWS", description="Cloud provider for verification")


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
    cloud_provider: Optional[str] = Field("AWS", description="Cloud provider of optimization action")


class UploadedService(BaseModel):
    service_id: str
    resource_size: str = "Standard (2vCPU/4GB)"
    healthy: bool = True
    timestamp: str

    cpu_percent: float = Field(..., ge=0, le=100)
    memory_percent: float = Field(..., ge=0, le=100)
    requests_per_minute: int = Field(..., ge=0)
    previous_requests_per_minute: int = Field(0, ge=0)
    latency_ms: float = Field(..., ge=0)
    error_rate_percent: float = Field(0.0, ge=0)

    instances: int = Field(..., ge=1)
    cost_per_hour: float = Field(..., ge=0)
    min_instances: int = Field(..., ge=1)
    max_instances: int = Field(..., ge=1)
    max_latency_ms: float = Field(..., gt=0)

    @model_validator(mode='after')
    def validate_instances(self):
        if not (self.min_instances <= self.instances <= self.max_instances):
            raise ValueError(f"{self.service_id}.instances must be between min_instances and max_instances")
        return self


class UploadServicesRequest(BaseModel):
    services: List[UploadedService]
