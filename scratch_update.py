import os

with open("app/database.py", "a", encoding="utf-8") as f:
    f.write("""

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
""")

with open("app/main.py", "r", encoding="utf-8") as f:
    main_content = f.read()

main_content = main_content.replace(
    "from app.schemas import (",
    "from app.schemas import (\n    UploadServicesRequest,\n    UploadedService,"
)
main_content = main_content.replace(
    "    normalize_provider_name\n)",
    "    normalize_provider_name,\n    load_uploaded_services\n)"
)

main_content += """

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
"""

with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(main_content)
