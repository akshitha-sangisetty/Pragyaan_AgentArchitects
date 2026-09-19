"""
SQLite Database Layer for Autonomous Cloud Cost Optimization System.
Provides persistent storage for:
1. Active cloud service state (`services`) with multi-cloud metadata
2. Audit trail of requests and safety checks (`audit_log`)
3. Historical optimization outcomes for Step 9 memory (`optimization_history`)
4. Developer-configured goals and boundaries (`user_goals`)
5. Active cloud provider selection (`system_config`)
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).parent.parent / "cloud_optimizer.db"
SCENARIOS_PATH = Path(__file__).parent.parent / "data" / "scenarios.json"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create database tables if they do not exist and apply safe schema migrations."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")

        # 1. Services table: Live state of services
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS services (
                service_id TEXT PRIMARY KEY,
                cpu_percent REAL NOT NULL,
                memory_percent REAL NOT NULL,
                requests_per_minute INTEGER NOT NULL,
                previous_requests_per_minute INTEGER,
                latency_ms REAL NOT NULL,
                instances INTEGER NOT NULL,
                cost_per_hour REAL NOT NULL,
                min_instances INTEGER NOT NULL,
                max_instances INTEGER NOT NULL,
                max_latency_ms REAL NOT NULL,
                healthy BOOLEAN NOT NULL DEFAULT 1,
                error_rate_percent REAL NOT NULL DEFAULT 0.1,
                resource_size TEXT NOT NULL DEFAULT 'Standard',
                timestamp TEXT NOT NULL,
                cloud_provider TEXT NOT NULL DEFAULT 'AWS',
                resource_id TEXT,
                resource_type TEXT,
                region TEXT,
                provider_metadata_json TEXT
            )
        """)

        # 2. Audit log table: Traceability of all agent activities
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                service_id TEXT,
                details_json TEXT NOT NULL,
                cloud_provider TEXT DEFAULT 'AWS'
            )
        """)

        # 3. Optimization history table: Step 9 memory & learning
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS optimization_history (
                history_id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                instances_before INTEGER NOT NULL,
                instances_after INTEGER NOT NULL,
                cost_before REAL NOT NULL,
                cost_after REAL NOT NULL,
                latency_before REAL NOT NULL,
                latency_after REAL NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                cloud_provider TEXT DEFAULT 'AWS'
            )
        """)

        # 4. User Goals table: Step 1 of P3
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_goals (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                target_cost_reduction_percent REAL NOT NULL DEFAULT 25.0,
                max_acceptable_latency_ms REAL NOT NULL DEFAULT 300.0,
                max_hourly_budget REAL NOT NULL DEFAULT 50.0,
                default_min_instances INTEGER NOT NULL DEFAULT 1,
                monitoring_enabled BOOLEAN NOT NULL DEFAULT 1
            )
        """)

        # 5. System config table: stores active provider
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Schema migrations using PRAGMA table_info
        cursor.execute("PRAGMA table_info(services)")
        existing_cols = {row["name"] for row in cursor.fetchall()}
        
        for col, typ, dflt in [
            ("error_rate_percent", "REAL", "0.1"),
            ("resource_size", "TEXT", "'Standard'"),
            ("cloud_provider", "TEXT", "'AWS'"),
            ("resource_id", "TEXT", "NULL"),
            ("resource_type", "TEXT", "NULL"),
            ("region", "TEXT", "NULL"),
            ("provider_metadata_json", "TEXT", "NULL")
        ]:
            if col not in existing_cols:
                try:
                    cursor.execute(f"ALTER TABLE services ADD COLUMN {col} {typ} DEFAULT {dflt}")
                except Exception:
                    pass

        cursor.execute("PRAGMA table_info(optimization_history)")
        hist_cols = {row["name"] for row in cursor.fetchall()}
        if "cloud_provider" not in hist_cols:
            try:
                cursor.execute("ALTER TABLE optimization_history ADD COLUMN cloud_provider TEXT DEFAULT 'AWS'")
            except Exception:
                pass

        cursor.execute("PRAGMA table_info(audit_log)")
        audit_cols = {row["name"] for row in cursor.fetchall()}
        if "cloud_provider" not in audit_cols:
            try:
                cursor.execute("ALTER TABLE audit_log ADD COLUMN cloud_provider TEXT DEFAULT 'AWS'")
            except Exception:
                pass

        cursor.execute("PRAGMA table_info(user_goals)")
        goals_cols = {row["name"] for row in cursor.fetchall()}
        if "default_min_instances" not in goals_cols:
            try:
                cursor.execute("ALTER TABLE user_goals ADD COLUMN default_min_instances INTEGER NOT NULL DEFAULT 1")
            except Exception:
                pass

        cursor.execute("""
            INSERT OR IGNORE INTO user_goals (id, target_cost_reduction_percent, max_acceptable_latency_ms, max_hourly_budget, default_min_instances, monitoring_enabled)
            VALUES (1, 25.0, 300.0, 50.0, 1, 1)
        """)

        cursor.execute("""
            INSERT OR IGNORE INTO system_config (key, value)
            VALUES ('active_provider', 'AWS')
        """)

        conn.commit()
    finally:
        conn.close()


def normalize_provider_name(provider: Optional[str]) -> str:
    """Normalize provider name to canonical casing: AWS, Azure, GCP."""
    p = (provider or "AWS").strip()
    if p.upper() == "AWS":
        return "AWS"
    elif p.upper() == "AZURE":
        return "Azure"
    elif p.upper() == "GCP":
        return "GCP"
    return "AWS"


def get_active_provider() -> str:
    """Retrieve the currently active cloud provider (AWS, Azure, GCP)."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_config WHERE key = 'active_provider'")
        row = cursor.fetchone()
        return normalize_provider_name(row["value"]) if row else "AWS"
    except Exception:
        return "AWS"
    finally:
        conn.close()


def set_active_provider(provider: str) -> str:
    """Set the active cloud provider (AWS, Azure, GCP)."""
    prov = normalize_provider_name(provider)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO system_config (key, value) VALUES ('active_provider', ?)", (prov,))
        conn.commit()
        return prov
    except Exception:
        return prov
    finally:
        conn.close()


def load_scenario(scenario_id: str = "test_a", provider: Optional[str] = None) -> Dict[str, Any]:
    """
    Reset the database and load an official scenario (test_a, test_b, test_c, test_d)
    for the selected cloud provider (AWS, Azure, GCP).
    """
    init_db()
    with open(SCENARIOS_PATH, "r", encoding="utf-8") as f:
        all_scenarios = json.load(f)

    if scenario_id not in all_scenarios:
        raise ValueError(f"Unknown scenario ID: {scenario_id}. Available: {list(all_scenarios.keys())}")

    active_provider = normalize_provider_name(provider or get_active_provider())
    set_active_provider(active_provider)

    scenario_data = all_scenarios[scenario_id]

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Clear existing active services
        cursor.execute("DELETE FROM services")

        # Check if provider-specific configuration exists for this scenario
        matched_provider_block = None
        if "providers" in scenario_data:
            for k, v in scenario_data["providers"].items():
                if k.upper() == active_provider.upper():
                    matched_provider_block = v
                    break

        if matched_provider_block:
            raw_services = matched_provider_block["services"]
            for s in raw_services:
                service_id = s.get("service_name") or s.get("service_id")
                cpu = float(s.get("cpu_utilization", s.get("cpu_percent", 20.0)))
                mem = float(s.get("memory_utilization", s.get("memory_percent", 40.0)))
                rpm = int(s.get("request_count", s.get("requests_per_minute", 1000)))
                lat = float(s.get("latency_ms", 150.0))
                inst = int(s.get("running_instances", s.get("instances", 4)))
                cost = float(s.get("hourly_cost", s.get("cost_per_hour", 15.0)))
                min_i = int(s.get("min_instances", 1))
                max_i = int(s.get("max_instances", 8))
                max_lat = 300.0
                healthy = 1 if s.get("instance_state", s.get("vm_status", s.get("instance_status", "running"))).lower() in ["running", "healthy", "ok", "ready"] else 0
                err_rate = float(s.get("error_rate", s.get("error_rate_percent", 0.1)))
                
                # Resource ID and Type based on provider
                if active_provider.upper() == "AWS":
                    res_id = s.get("instance_id", f"i-{service_id[:8]}")
                    res_type = s.get("instance_type", "t3.medium")
                    region = s.get("region", "ap-south-1")
                    res_size = f"{res_type} ({region})"
                    meta = {"account_id": s.get("account_id", "123456789012"), "instance_id": res_id, "instance_type": res_type}
                elif active_provider.upper() == "AZURE":
                    res_id = s.get("vm_name", f"vm-{service_id[:8]}")
                    res_type = s.get("vm_size", "Standard_D2s_v5")
                    region = s.get("region", "Central India")
                    res_size = f"{res_type} ({region})"
                    meta = {"subscription_id": s.get("subscription_id", "sub-demo-001"), "resource_group": s.get("resource_group", "cloudguardian-rg"), "vm_name": res_id, "vm_size": res_type}
                else: # GCP
                    res_id = s.get("instance_name", f"gcp-{service_id[:8]}")
                    res_type = s.get("machine_type", "e2-medium")
                    region = s.get("zone", "asia-south1-a")
                    res_size = f"{res_type} ({region})"
                    meta = {"project_id": s.get("project_id", "cloudguardian-demo"), "zone": region, "instance_name": res_id, "machine_type": res_type}

                timestamp = s.get("timestamp", scenario_data.get("current_time", "2026-09-17T10:30:00Z"))

                cursor.execute("""
                    INSERT INTO services (
                        service_id, cpu_percent, memory_percent, requests_per_minute,
                        previous_requests_per_minute, latency_ms, instances, cost_per_hour,
                        min_instances, max_instances, max_latency_ms, healthy, error_rate_percent, resource_size, timestamp,
                        cloud_provider, resource_id, resource_type, region, provider_metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    service_id, cpu, mem, rpm, s.get("previous_requests_per_minute"),
                    lat, inst, cost, min_i, max_i, max_lat, healthy, err_rate,
                    res_size, timestamp, active_provider, res_id, res_type, region, json.dumps(meta)
                ))
        else:
            # Fallback to top-level services list
            for s in scenario_data["services"]:
                cursor.execute("""
                    INSERT INTO services (
                        service_id, cpu_percent, memory_percent, requests_per_minute,
                        previous_requests_per_minute, latency_ms, instances, cost_per_hour,
                        min_instances, max_instances, max_latency_ms, healthy, error_rate_percent, resource_size, timestamp,
                        cloud_provider, resource_id, resource_type, region, provider_metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    s["service_id"],
                    s["cpu_percent"],
                    s["memory_percent"],
                    s["requests_per_minute"],
                    s.get("previous_requests_per_minute"),
                    s["latency_ms"],
                    s["instances"],
                    s["cost_per_hour"],
                    s["min_instances"],
                    s["max_instances"],
                    s["max_latency_ms"],
                    1 if s.get("healthy", True) else 0,
                    s.get("error_rate_percent", 0.1),
                    s.get("resource_size", "Standard"),
                    s["timestamp"],
                    s.get("cloud_provider", active_provider),
                    s.get("resource_id", f"i-{s['service_id'][:8]}"),
                    s.get("resource_type", "t3.medium"),
                    s.get("region", "ap-south-1"),
                    json.dumps(s.get("provider_metadata", {}))
                ))

        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO audit_log (timestamp, event_type, service_id, details_json, cloud_provider)
            VALUES (?, 'SCENARIO_LOADED', NULL, ?, ?)
        """, (now_str, json.dumps({"scenario_id": scenario_id, "name": scenario_data["name"], "provider": active_provider}), active_provider))

        conn.commit()
    finally:
        conn.close()

    return scenario_data


def get_all_services() -> List[Dict[str, Any]]:
    """Retrieve all current services from database with parsed metadata."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM services")
        rows = cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if "provider_metadata_json" in d and d["provider_metadata_json"]:
                try:
                    d["provider_metadata"] = json.loads(d["provider_metadata_json"])
                except Exception:
                    d["provider_metadata"] = {}
            else:
                d["provider_metadata"] = {}
            result.append(d)
        return result
    finally:
        conn.close()


def get_service_by_id(service_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single service state by service_id with metadata."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM services WHERE service_id = ?", (service_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        if "provider_metadata_json" in d and d["provider_metadata_json"]:
            try:
                d["provider_metadata"] = json.loads(d["provider_metadata_json"])
            except Exception:
                d["provider_metadata"] = {}
        else:
            d["provider_metadata"] = {}
        return d
    finally:
        conn.close()


def update_service_instances(
    service_id: str, 
    new_instances: int, 
    new_latency: float, 
    new_cpu: float, 
    new_cost: float,
    new_error_rate: float = 0.1,
    new_resource_size: str = "Standard"
):
    """Update service state in database after simulated cloud action."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            UPDATE services
            SET instances = ?, latency_ms = ?, cpu_percent = ?, cost_per_hour = ?, 
                error_rate_percent = ?, resource_size = ?, timestamp = ?
            WHERE service_id = ?
        """, (new_instances, new_latency, new_cpu, new_cost, new_error_rate, new_resource_size, now_str, service_id))
        conn.commit()
    finally:
        conn.close()


def record_audit(event_type: str, details: Dict[str, Any], service_id: Optional[str] = None, cloud_provider: Optional[str] = None):
    """Record an event in the audit trail with provider context."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        prov = cloud_provider or get_active_provider()
        cursor.execute("""
            INSERT INTO audit_log (timestamp, event_type, service_id, details_json, cloud_provider)
            VALUES (?, ?, ?, ?, ?)
        """, (now_str, event_type, service_id, json.dumps(details), prov))
        conn.commit()
    finally:
        conn.close()


def save_optimization_history(
    service_id: str,
    action_type: str,
    instances_before: int,
    instances_after: int,
    cost_before: float,
    cost_after: float,
    latency_before: float,
    latency_after: float,
    status: str,
    notes: str = "",
    cloud_provider: Optional[str] = None
):
    """Store optimization outcome for Step 9 memory with provider tracking."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        now_str = datetime.now(timezone.utc).isoformat()
        prov = cloud_provider or get_active_provider()
        cursor.execute("""
            INSERT INTO optimization_history (
                service_id, action_type, instances_before, instances_after,
                cost_before, cost_after, latency_before, latency_after,
                status, notes, created_at, cloud_provider
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            service_id, action_type, instances_before, instances_after,
            cost_before, cost_after, latency_before, latency_after,
            status, notes, now_str, prov
        ))
        conn.commit()
    finally:
        conn.close()


def get_optimization_history(service_id: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve historical optimization outcomes for memory retrieval."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if service_id:
            cursor.execute("""
                SELECT * FROM optimization_history 
                WHERE service_id = ? 
                ORDER BY history_id DESC LIMIT ?
            """, (service_id, limit))
        else:
            cursor.execute("""
                SELECT * FROM optimization_history 
                ORDER BY history_id DESC LIMIT ?
            """, (limit,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_user_goals() -> Dict[str, Any]:
    """Retrieve the developer's goals and boundaries."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM user_goals WHERE id = 1")
        row = cursor.fetchone()
        if row:
            d = dict(row)
            d["monitoring_enabled"] = bool(d["monitoring_enabled"])
            if "default_min_instances" not in d or d["default_min_instances"] is None:
                d["default_min_instances"] = 1
            return d
        return {
            "target_cost_reduction_percent": 25.0,
            "max_acceptable_latency_ms": 300.0,
            "max_hourly_budget": 50.0,
            "default_min_instances": 1,
            "monitoring_enabled": True
        }
    finally:
        conn.close()


def update_user_goals(goals: Dict[str, Any]) -> Dict[str, Any]:
    """Update the developer's goals and boundaries."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE user_goals
            SET target_cost_reduction_percent = ?,
                max_acceptable_latency_ms = ?,
                max_hourly_budget = ?,
                default_min_instances = ?,
                monitoring_enabled = ?
            WHERE id = 1
        """, (
            goals.get("target_cost_reduction_percent", 25.0),
            goals.get("max_acceptable_latency_ms", 300.0),
            goals.get("max_hourly_budget", 50.0),
            goals.get("default_min_instances", 1),
            1 if goals.get("monitoring_enabled", True) else 0
        ))
        conn.commit()
    finally:
        conn.close()
    return get_user_goals()


def load_uploaded_services(services_data):
    from datetime import datetime, timezone
    import json
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM services")
        for s in services_data:
            cursor.execute('''
                INSERT INTO services (
                    service_id, cpu_percent, memory_percent, requests_per_minute,
                    previous_requests_per_minute, latency_ms, instances, cost_per_hour,
                    min_instances, max_instances, max_latency_ms, healthy, error_rate_percent, resource_size, timestamp,
                    cloud_provider, resource_id, resource_type, region, provider_metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                s.service_id, s.cpu_percent, s.memory_percent, s.requests_per_minute,
                s.previous_requests_per_minute, s.latency_ms, s.instances, s.cost_per_hour,
                s.min_instances, s.max_instances, s.max_latency_ms,
                1 if s.healthy else 0, s.error_rate_percent,
                s.resource_size, s.timestamp,
                'AWS', f'i-{s.service_id[:8]}', 't3.medium', 'ap-south-1', '{}'
            ))
        conn.commit()
    finally:
        conn.close()
