"""
Provider Adapter and Normalization Layer for Multi-Cloud Cloud Guardian.

Translates provider-specific cloud telemetry (AWS, Azure, GCP) into normalized CommonTelemetry.
Agents operate strictly on CommonTelemetry.
All cloud environments are SIMULATED.
"""

from typing import Dict, Any, Union, Optional
from datetime import datetime, timezone
from app.schemas import (
    AWSProviderInput,
    AzureProviderInput,
    GCPProviderInput,
    CommonTelemetry,
    ServiceState
)


class AWSAdapter:
    """Adapter for AWS Cloud Telemetry normalization."""

    @staticmethod
    def normalize(data: Union[AWSProviderInput, Dict[str, Any]]) -> CommonTelemetry:
        if isinstance(data, dict):
            # Validate with Pydantic model
            model = AWSProviderInput(**data)
        else:
            model = data

        now_str = model.timestamp or datetime.now(timezone.utc).isoformat()
        
        return CommonTelemetry(
            cloud_provider="AWS",
            service_name=model.service_name,
            region=model.region,
            resource_id=model.instance_id,
            resource_type=model.instance_type,
            resource_state=model.instance_state,
            cpu_utilization=model.cpu_utilization,
            memory_utilization=model.memory_utilization,
            request_count=model.request_count,
            latency_ms=model.latency_ms,
            error_rate=model.error_rate,
            availability=model.availability,
            running_instances=model.running_instances,
            min_instances=model.min_instances,
            max_instances=model.max_instances,
            hourly_cost=model.hourly_cost,
            network_in_gb=model.network_in_gb,
            network_out_gb=model.network_out_gb,
            max_latency_ms=300.0,
            healthy=model.instance_state.lower() in ["running", "healthy", "ok"],
            timestamp=now_str,
            provider_metadata={
                "account_id": model.account_id,
                "instance_id": model.instance_id,
                "instance_type": model.instance_type,
                "region": model.region,
                "cloudwatch_namespace": "AWS/EC2"
            }
        )

    @staticmethod
    def denormalize(telemetry: CommonTelemetry) -> Dict[str, Any]:
        """Convert CommonTelemetry back to AWS-specific structure."""
        return {
            "cloud_provider": "AWS",
            "region": telemetry.region,
            "account_id": telemetry.provider_metadata.get("account_id", "123456789012"),
            "instance_id": telemetry.resource_id,
            "instance_type": telemetry.resource_type,
            "instance_state": telemetry.resource_state,
            "cpu_utilization": telemetry.cpu_utilization,
            "memory_utilization": telemetry.memory_utilization,
            "network_in_gb": telemetry.network_in_gb,
            "network_out_gb": telemetry.network_out_gb,
            "request_count": telemetry.request_count,
            "latency_ms": telemetry.latency_ms,
            "error_rate": telemetry.error_rate,
            "availability": telemetry.availability,
            "running_instances": telemetry.running_instances,
            "min_instances": telemetry.min_instances,
            "max_instances": telemetry.max_instances,
            "hourly_cost": telemetry.hourly_cost,
            "service_name": telemetry.service_name,
            "timestamp": telemetry.timestamp
        }


class AzureAdapter:
    """Adapter for Azure Cloud Telemetry normalization."""

    @staticmethod
    def normalize(data: Union[AzureProviderInput, Dict[str, Any]]) -> CommonTelemetry:
        if isinstance(data, dict):
            # Validate with Pydantic model
            model = AzureProviderInput(**data)
        else:
            model = data

        now_str = model.timestamp or datetime.now(timezone.utc).isoformat()

        return CommonTelemetry(
            cloud_provider="Azure",
            service_name=model.service_name,
            region=model.region,
            resource_id=model.vm_name,
            resource_type=model.vm_size,
            resource_state=model.vm_status,
            cpu_utilization=model.cpu_utilization,
            memory_utilization=model.memory_utilization,
            request_count=model.request_count,
            latency_ms=model.latency_ms,
            error_rate=model.error_rate,
            availability=model.availability,
            running_instances=model.running_instances,
            min_instances=model.min_instances,
            max_instances=model.max_instances,
            hourly_cost=model.hourly_cost,
            network_in_gb=model.network_in_gb,
            network_out_gb=model.network_out_gb,
            max_latency_ms=300.0,
            healthy=model.vm_status.lower() in ["running", "healthy", "ok", "ready"],
            timestamp=now_str,
            provider_metadata={
                "subscription_id": model.subscription_id,
                "resource_group": model.resource_group,
                "vm_name": model.vm_name,
                "vm_size": model.vm_size,
                "region": model.region,
                "failed_requests": model.failed_requests,
                "azure_monitor_resource": f"/subscriptions/{model.subscription_id}/resourceGroups/{model.resource_group}/providers/Microsoft.Compute/virtualMachineScaleSets/{model.service_name}"
            }
        )

    @staticmethod
    def denormalize(telemetry: CommonTelemetry) -> Dict[str, Any]:
        """Convert CommonTelemetry back to Azure-specific structure."""
        return {
            "cloud_provider": "Azure",
            "subscription_id": telemetry.provider_metadata.get("subscription_id", "sub-demo-001"),
            "resource_group": telemetry.provider_metadata.get("resource_group", "cloudguardian-rg"),
            "region": telemetry.region,
            "vm_name": telemetry.resource_id,
            "vm_size": telemetry.resource_type,
            "vm_status": telemetry.resource_state,
            "cpu_utilization": telemetry.cpu_utilization,
            "memory_utilization": telemetry.memory_utilization,
            "network_in_gb": telemetry.network_in_gb,
            "network_out_gb": telemetry.network_out_gb,
            "request_count": telemetry.request_count,
            "latency_ms": telemetry.latency_ms,
            "failed_requests": telemetry.provider_metadata.get("failed_requests", int(telemetry.request_count * (telemetry.error_rate / 100.0))),
            "error_rate": telemetry.error_rate,
            "availability": telemetry.availability,
            "running_instances": telemetry.running_instances,
            "min_instances": telemetry.min_instances,
            "max_instances": telemetry.max_instances,
            "hourly_cost": telemetry.hourly_cost,
            "service_name": telemetry.service_name,
            "timestamp": telemetry.timestamp
        }


class GCPAdapter:
    """Adapter for Google Cloud Platform (GCP) Telemetry normalization."""

    @staticmethod
    def normalize(data: Union[GCPProviderInput, Dict[str, Any]]) -> CommonTelemetry:
        if isinstance(data, dict):
            # Validate with Pydantic model
            model = GCPProviderInput(**data)
        else:
            model = data

        now_str = model.timestamp or datetime.now(timezone.utc).isoformat()

        return CommonTelemetry(
            cloud_provider="GCP",
            service_name=model.service_name,
            region=model.zone,
            resource_id=model.instance_name,
            resource_type=model.machine_type,
            resource_state=model.instance_status.lower(),
            cpu_utilization=model.cpu_utilization,
            memory_utilization=model.memory_utilization,
            request_count=model.request_count,
            latency_ms=model.latency_ms,
            error_rate=model.error_rate,
            availability=model.availability,
            running_instances=model.running_instances,
            min_instances=model.min_instances,
            max_instances=model.max_instances,
            hourly_cost=model.hourly_cost,
            network_in_gb=model.network_received_gb,
            network_out_gb=model.network_sent_gb,
            max_latency_ms=300.0,
            healthy=model.instance_status.upper() in ["RUNNING", "HEALTHY", "READY"],
            timestamp=now_str,
            provider_metadata={
                "project_id": model.project_id,
                "zone": model.zone,
                "instance_name": model.instance_name,
                "machine_type": model.machine_type,
                "instance_status": model.instance_status,
                "gcp_mig_name": f"projects/{model.project_id}/zones/{model.zone}/instanceGroupManagers/{model.service_name}-mig"
            }
        )

    @staticmethod
    def denormalize(telemetry: CommonTelemetry) -> Dict[str, Any]:
        """Convert CommonTelemetry back to GCP-specific structure."""
        return {
            "cloud_provider": "GCP",
            "project_id": telemetry.provider_metadata.get("project_id", "cloudguardian-demo"),
            "zone": telemetry.region,
            "instance_name": telemetry.resource_id,
            "machine_type": telemetry.resource_type,
            "instance_status": telemetry.resource_state.upper(),
            "cpu_utilization": telemetry.cpu_utilization,
            "memory_utilization": telemetry.memory_utilization,
            "network_received_gb": telemetry.network_in_gb,
            "network_sent_gb": telemetry.network_out_gb,
            "request_count": telemetry.request_count,
            "latency_ms": telemetry.latency_ms,
            "error_rate": telemetry.error_rate,
            "availability": telemetry.availability,
            "running_instances": telemetry.running_instances,
            "min_instances": telemetry.min_instances,
            "max_instances": telemetry.max_instances,
            "hourly_cost": telemetry.hourly_cost,
            "service_name": telemetry.service_name,
            "timestamp": telemetry.timestamp
        }


def normalize_provider_data(provider: str, raw_data: Dict[str, Any]) -> CommonTelemetry:
    """
    Factory function: Ingests raw provider payload, validates provider-specific schema,
    and returns normalized CommonTelemetry.
    """
    prov = (provider or raw_data.get("cloud_provider", "AWS")).upper()
    if prov == "AWS":
        return AWSAdapter.normalize(raw_data)
    elif prov == "AZURE":
        return AzureAdapter.normalize(raw_data)
    elif prov == "GCP":
        return GCPAdapter.normalize(raw_data)
    else:
        raise ValueError(f"Unsupported cloud provider: '{provider}'. Supported: AWS, Azure, GCP")


def common_telemetry_to_service_state(telemetry: CommonTelemetry) -> ServiceState:
    """Convert CommonTelemetry into internal ServiceState representation."""
    return ServiceState(
        service_id=telemetry.service_name,
        cpu_percent=telemetry.cpu_utilization,
        memory_percent=telemetry.memory_utilization,
        requests_per_minute=telemetry.request_count,
        previous_requests_per_minute=None,
        latency_ms=telemetry.latency_ms,
        instances=telemetry.running_instances,
        cost_per_hour=telemetry.hourly_cost,
        min_instances=telemetry.min_instances,
        max_instances=telemetry.max_instances,
        max_latency_ms=telemetry.max_latency_ms,
        healthy=telemetry.healthy,
        error_rate_percent=telemetry.error_rate,
        resource_size=telemetry.resource_type,
        timestamp=telemetry.timestamp,
        cloud_provider=telemetry.cloud_provider,
        resource_id=telemetry.resource_id,
        resource_type=telemetry.resource_type,
        region=telemetry.region,
        provider_metadata=telemetry.provider_metadata
    )


def service_state_to_common_telemetry(state: ServiceState) -> CommonTelemetry:
    """Convert ServiceState to CommonTelemetry."""
    prov_raw = (state.cloud_provider or "AWS").strip().upper()
    
    # Sensible defaults based on provider
    if prov_raw == "AZURE":
        prov = "Azure"
        region = state.region or "Central India"
        res_id = state.resource_id or f"vm-{state.service_id}-01"
        res_type = state.resource_type or "Standard_D2s_v5"
    elif prov_raw == "GCP":
        prov = "GCP"
        region = state.region or "asia-south1-a"
        res_id = state.resource_id or f"gcp-{state.service_id}-01"
        res_type = state.resource_type or "e2-medium"
    else: # AWS
        prov = "AWS"
        region = state.region or "ap-south-1"
        res_id = state.resource_id or f"i-0{state.service_id[:8]}"
        res_type = state.resource_type or "t3.medium"

    return CommonTelemetry(
        cloud_provider=prov,
        service_name=state.service_id,
        region=region,
        resource_id=res_id,
        resource_type=res_type,
        resource_state="running" if state.healthy else "degraded",
        cpu_utilization=state.cpu_percent,
        memory_utilization=state.memory_percent,
        request_count=state.requests_per_minute,
        latency_ms=state.latency_ms,
        error_rate=state.error_rate_percent,
        availability=99.95 if state.healthy else 95.0,
        running_instances=state.instances,
        min_instances=state.min_instances,
        max_instances=state.max_instances,
        hourly_cost=state.cost_per_hour,
        network_in_gb=round(state.requests_per_minute * 0.0003, 2),
        network_out_gb=round(state.requests_per_minute * 0.0002, 2),
        max_latency_ms=state.max_latency_ms,
        healthy=state.healthy,
        timestamp=state.timestamp,
        provider_metadata=state.provider_metadata or {}
    )
