"""
SQLite Database Layer for Autonomous Cloud Cost Optimization System.
Provides persistent storage for:
1. Active cloud service state (`services`)
2. Audit trail of requests and safety checks (`audit_log`)
3. Historical optimization outcomes for Step 9 memory (`optimization_history`)
"""

import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).parent.parent / "cloud_optimizer.db"
SCENARIOS_PATH = Path(__file__).parent.parent / "data" / "scenarios.json"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create database tables if they do not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

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
            timestamp TEXT NOT NULL
        )
    """)

    # 2. Audit log table: Traceability of all agent activities
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            log_id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            service_id TEXT,
            details_json TEXT NOT NULL
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
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def load_scenario(scenario_id: str = "test_a") -> Dict[str, Any]:
    """Reset the database and load an official scenario (test_a, test_b, test_c, test_d)."""
    init_db()
    with open(SCENARIOS_PATH, "r", encoding="utf-8") as f:
        all_scenarios = json.load(f)

    if scenario_id not in all_scenarios:
        raise ValueError(f"Unknown scenario ID: {scenario_id}. Available: {list(all_scenarios.keys())}")

    scenario_data = all_scenarios[scenario_id]

    conn = get_db_connection()
    cursor = conn.cursor()

    # Clear existing active services
    cursor.execute("DELETE FROM services")

    # Insert services for this scenario
    for s in scenario_data["services"]:
        cursor.execute("""
            INSERT INTO services (
                service_id, cpu_percent, memory_percent, requests_per_minute,
                previous_requests_per_minute, latency_ms, instances, cost_per_hour,
                min_instances, max_instances, max_latency_ms, healthy, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            s["timestamp"]
        ))

    # Log the scenario load event
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO audit_log (timestamp, event_type, service_id, details_json)
        VALUES (?, 'SCENARIO_LOADED', NULL, ?)
    """, (now_str, json.dumps({"scenario_id": scenario_id, "name": scenario_data["name"]})))

    conn.commit()
    conn.close()
    return scenario_data


def get_all_services() -> List[Dict[str, Any]]:
    """Retrieve all current services from database."""
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM services")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_service_by_id(service_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single service state by service_id."""
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM services WHERE service_id = ?", (service_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_service_instances(service_id: str, new_instances: int, new_latency: float, new_cpu: float, new_cost: float):
    """Update service state in database after cloud action."""
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        UPDATE services
        SET instances = ?, latency_ms = ?, cpu_percent = ?, cost_per_hour = ?, timestamp = ?
        WHERE service_id = ?
    """, (new_instances, new_latency, new_cpu, new_cost, now_str, service_id))
    conn.commit()
    conn.close()


def record_audit(event_type: str, details: Dict[str, Any], service_id: Optional[str] = None):
    """Record an event in the audit trail."""
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO audit_log (timestamp, event_type, service_id, details_json)
        VALUES (?, ?, ?, ?)
    """, (now_str, event_type, service_id, json.dumps(details)))
    conn.commit()
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
    notes: str = ""
):
    """Store optimization outcome for Step 9 memory."""
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now(timezone.utc).isoformat()
    cursor.execute("""
        INSERT INTO optimization_history (
            service_id, action_type, instances_before, instances_after,
            cost_before, cost_after, latency_before, latency_after,
            status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        service_id, action_type, instances_before, instances_after,
        cost_before, cost_after, latency_before, latency_after,
        status, notes, now_str
    ))
    conn.commit()
    conn.close()


def get_optimization_history(service_id: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve historical optimization outcomes for memory retrieval."""
    init_db()
    conn = get_db_connection()
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
    conn.close()
    return [dict(row) for row in rows]
