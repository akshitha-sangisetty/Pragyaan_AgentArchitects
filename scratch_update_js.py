with open("frontend/app.js", "a", encoding="utf-8") as f:
    f.write("""

async function uploadServicesJson() {
  const fileInput = document.getElementById('json-upload-input');
  const statusDiv = document.getElementById('upload-status');
  const btn = document.getElementById('btn-upload-services');

  if (!fileInput.files || fileInput.files.length === 0) {
    statusDiv.innerHTML = '<span style="color:var(--warning);">Please select a JSON file first.</span>';
    return;
  }

  const file = fileInput.files[0];
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    statusDiv.innerHTML = '<span style="color:var(--warning);">Invalid file type. Please upload a .json file.</span>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading & Analyzing...';
  statusDiv.innerHTML = '<span style="color:var(--primary);">Uploading services...</span>';

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.services || !Array.isArray(data.services)) {
      throw new Error('Invalid JSON format: "services" array is required.');
    }

    statusDiv.innerHTML = '<span style="color:var(--primary);">Validating service data...</span>';

    const res = await fetch(apiUrl('/api/services/upload'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: data.services })
    });

    const result = await res.json();

    if (!res.ok) {
      const details = Array.isArray(result.detail) ? result.detail.map(d => d.msg || d).join(", ") : (result.detail || 'Upload failed');
      throw new Error(details);
    }

    statusDiv.innerHTML = `<span style="color:var(--success);">✓ ${result.serviceCount} services loaded successfully</span>`;
    
    // Switch to clear scenario state
    document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('scenario-name').textContent = 'Custom Uploaded Services';
    document.getElementById('scenario-desc').textContent = 'Analyzing custom architecture defined in JSON.';
    
    addTimelineEvent('investigation', `Uploaded custom configuration with ${result.serviceCount} services.`);
    
    await fetchServices();
    await fetchHistory();
    
  } catch (err) {
    statusDiv.innerHTML = `<span style="color:var(--danger);">Error: ${err.message}</span>`;
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload & Analyze';
  }
}
""")
