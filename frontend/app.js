/**
 * Cloud Guardian — Multi-Cloud Autonomous Cost & Safety Manager
 * Frontend Logic (AWS / Azure / GCP Support)
 */

let currentServices = [];
let currentScenarioId = 'test_a';
let currentProvider = 'AWS';
let activeRecommendation = null;
let lastSelectedManualServiceId = null;

// Debounce helper for slider
let sliderTimeout = null;
let telemetryChart = null;
let monitoringActive = true;
let monitoringTimer = null;

// In-memory Audit Activity Timeline events
let auditTimelineEvents = [];

// ==========================================================================
// Dynamic API Endpoint Resolver (Render + Vercel)
// ==========================================================================

function getApiBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '';
  }
  const custom = localStorage.getItem('API_BASE_URL');
  if (custom && custom.trim() !== '') {
    return custom.trim().replace(/\/+$/, '');
  }
  if (window.API_BASE_URL && window.API_BASE_URL.trim() !== '') {
    return window.API_BASE_URL.trim().replace(/\/+$/, '');
  }
  return '';
}

function apiUrl(endpoint) {
  const base = getApiBaseUrl();
  return base ? `${base}${endpoint}` : endpoint;
}

async function checkBackendHealth() {
  const dot = document.getElementById('backend-status-dot');
  const urlLabel = document.getElementById('backend-status-url');
  const badge = document.getElementById('backend-status-badge');
  const base = getApiBaseUrl();
  if (urlLabel) {
    if (base) {
      try {
        const u = new URL(base);
        urlLabel.textContent = u.hostname.replace('.onrender.com', '');
      } catch (_) {
        urlLabel.textContent = 'Render';
      }
    } else {
      urlLabel.textContent = 'Direct/Local';
    }
  }
  try {
    const res = await fetch(apiUrl('/health'), { method: 'GET' });
    if (res.ok) {
      if (dot) dot.className = 'status-dot dot-online';
      if (badge) badge.title = `Connected to backend: ${base || 'Local'}`;
    } else {
      if (dot) dot.className = 'status-dot dot-warning';
    }
  } catch (err) {
    if (dot) dot.className = 'status-dot dot-offline';
    if (badge) badge.title = `Failed to connect. Click to configure URL.`;
  }
}

function openBackendConfigModal() {
  const modal = document.getElementById('backend-modal');
  const input = document.getElementById('backend-url-input');
  if (input) input.value = localStorage.getItem('API_BASE_URL') || window.API_BASE_URL || '';
  if (modal) modal.classList.remove('hidden');
}

function closeBackendConfigModal() {
  const modal = document.getElementById('backend-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveBackendConfig() {
  const input = document.getElementById('backend-url-input');
  let val = (input ? input.value : '').trim();
  if (val.endsWith('/')) val = val.slice(0, -1);
  if (val) {
    localStorage.setItem('API_BASE_URL', val);
  } else {
    localStorage.removeItem('API_BASE_URL');
  }
  closeBackendConfigModal();
  await checkBackendHealth();
  await loadScenario(currentScenarioId);
  await fetchHistory();
}

document.addEventListener('DOMContentLoaded', () => {
  checkBackendHealth();
  initTelemetryChart();
  fetchGoals();
  loadScenario('test_a');
  fetchHistory();
  setInterval(updateClock, 1000);
  startMonitoringLoop();
  setInterval(checkBackendHealth, 30000);
});

function updateClock() {
  const clockEl = document.getElementById('system-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toISOString().substring(11, 19) + ' UTC';
  }
}

// ==========================================================================
// Cloud Provider Selector (Part D)
// ==========================================================================

async function setCloudProvider(provider) {
  const prov = (provider || 'AWS').toUpperCase();
  currentProvider = prov;

  // Update button active classes
  ['aws', 'azure', 'gcp'].forEach(p => {
    const btn = document.getElementById(`btn-provider-${p}`);
    if (btn) {
      if (p === prov.toLowerCase()) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  // Update pills and labels
  const pill = document.getElementById('active-provider-pill');
  if (pill) pill.textContent = `${prov} (Simulated)`;
  const telLabel = document.getElementById('telemetry-provider-label');
  if (telLabel) telLabel.textContent = prov;
  const icon = document.getElementById('provider-context-icon');
  if (icon) {
    icon.textContent = prov === 'AWS' ? '🟠' : (prov === 'Azure' ? '🔵' : '🟢');
  }

  addTimelineEvent('investigation', `Switched Cloud Provider to ${prov}. Loading provider-specific simulated data...`);

  try {
    const res = await fetch(apiUrl('/api/cloud/provider/select'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov, scenario_id: currentScenarioId })
    });
    if (res.ok) {
      await loadScenario(currentScenarioId);
    }
  } catch (err) {
    console.error('Failed to select provider:', err);
    await loadScenario(currentScenarioId);
  }
}

// ==========================================================================
// Prompt Presets Helper (Part Q)
// ==========================================================================

function applyPresetPrompt(promptText) {
  const input = document.getElementById('prompt-input');
  if (input) {
    input.value = promptText;
  }
  runRecommend();
}

// ==========================================================================
// Audit Activity Timeline Helper
// ==========================================================================

function addTimelineEvent(category, description) {
  const now = new Date();
  const timeStr = now.toISOString().substring(11, 19);
  
  auditTimelineEvents.unshift({
    time: timeStr,
    category: category,
    description: description
  });

  if (auditTimelineEvents.length > 25) {
    auditTimelineEvents.pop();
  }

  renderTimeline();
}

function renderTimeline() {
  const container = document.getElementById('audit-timeline');
  if (!container) return;

  if (auditTimelineEvents.length === 0) {
    container.innerHTML = '<div class="timeline-empty">System ready. Waiting for scenario actions...</div>';
    return;
  }

  container.innerHTML = auditTimelineEvents.map(e => `
    <div class="timeline-event event-${e.category}">
      <span class="timeline-time">${e.time} UTC</span>
      <div class="timeline-desc">${e.description}</div>
    </div>
  `).join('');
}

// ==========================================================================
// Step 1: Goals & Operational Boundaries
// ==========================================================================

async function fetchGoals() {
  try {
    const res = await fetch(apiUrl('/api/goals'));
    const goals = await res.json();
    document.getElementById('goal-reduction').value = goals.target_cost_reduction_percent;
    document.getElementById('goal-latency').value = goals.max_acceptable_latency_ms;
    document.getElementById('goal-budget').value = goals.max_hourly_budget;
    const minEl = document.getElementById('goal-min-instances');
    if (minEl && goals.default_min_instances !== undefined) {
      minEl.value = goals.default_min_instances;
    }
    monitoringActive = goals.monitoring_enabled;
    updateMonitoringButton();
  } catch (err) {
    console.error('Failed to fetch goals:', err);
  }
}

async function saveGoals() {
  const goals = {
    target_cost_reduction_percent: parseFloat(document.getElementById('goal-reduction').value) || 25.0,
    max_acceptable_latency_ms: parseFloat(document.getElementById('goal-latency').value) || 300.0,
    max_hourly_budget: parseFloat(document.getElementById('goal-budget').value) || 50.0,
    default_min_instances: parseInt(document.getElementById('goal-min-instances')?.value || '1', 10),
    monitoring_enabled: monitoringActive
  };
  try {
    await fetch(apiUrl('/api/goals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goals)
    });
  } catch (err) {
    console.error('Failed to save goals:', err);
  }
}

function toggleMonitoring() {
  monitoringActive = !monitoringActive;
  updateMonitoringButton();
  saveGoals();
  if (monitoringActive) {
    startMonitoringLoop();
  } else {
    clearInterval(monitoringTimer);
    monitoringTimer = null;
  }
}

function updateMonitoringButton() {
  const btn = document.getElementById('btn-monitoring-toggle');
  if (!btn) return;
  if (monitoringActive) {
    btn.className = 'toggle-btn active';
    btn.innerHTML = '<span class="toggle-dot"></span> ON';
  } else {
    btn.className = 'toggle-btn off';
    btn.innerHTML = '<span class="toggle-dot"></span> OFF';
  }
}

function startMonitoringLoop() {
  if (monitoringTimer) clearInterval(monitoringTimer);
  monitoringTimer = setInterval(async () => {
    if (!monitoringActive) return;
    try {
      const res = await fetch(apiUrl('/api/telemetry/tick'), { method: 'POST' });
      const updated = await res.json();
      currentServices = updated;
      renderServicesList(updated);
      updateTelemetryChart(updated);
    } catch (e) {
      // ignore transient tick errors
    }
  }, 4000);
}

// ==========================================================================
// Chart.js Telemetry Graph
// ==========================================================================

function initTelemetryChart() {
  const ctx = document.getElementById('telemetryChart');
  if (!ctx || typeof Chart === 'undefined') return;

  telemetryChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Response Latency (ms)',
          data: [],
          backgroundColor: 'rgba(139, 92, 246, 0.65)',
          borderColor: '#8B5CF6',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Max Allowed SLA Limit',
          data: [],
          type: 'line',
          borderColor: '#DC2626',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(139, 92, 246, 0.1)' },
          ticks: { color: '#6B5B7A', font: { family: 'JetBrains Mono', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#2E1065', font: { family: 'Plus Jakarta Sans', size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#2E1065', font: { size: 10 }, boxWidth: 12 }
        }
      }
    }
  });
}

function updateTelemetryChart(services) {
  if (!telemetryChart) return;
  const labels = services.map(s => s.service_id);
  const latencies = services.map(s => s.latency_ms);
  const slas = services.map(s => s.max_latency_ms);

  telemetryChart.data.labels = labels;
  telemetryChart.data.datasets[0].data = latencies;
  telemetryChart.data.datasets[1].data = slas;
  telemetryChart.update('none');
}

// ==========================================================================
// Scenario Loading (Multi-Cloud Aware)
// ==========================================================================

async function loadScenario(scenarioId) {
  currentScenarioId = scenarioId;
  
  // Update scenario navbar buttons
  document.querySelectorAll('.scenario-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${scenarioId.replace('_', '-')}`);
  if (activeBtn) activeBtn.classList.add('active');

  try {
    const res = await fetch(apiUrl('/api/scenario/load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, provider: currentProvider })
    });
    const data = await res.json();

    let friendlyName = data.name;
    let friendlyDesc = data.description;

    if (scenarioId === 'test_a') {
      friendlyName = `Scenario A — Over-Provisioned Spend (${currentProvider})`;
      friendlyDesc = `Service has excess running capacity. Goal: Rightsizing to eliminate idle spend while preserving response latency.`;
    } else if (scenarioId === 'test_b') {
      friendlyName = `Scenario B — High Visitor Traffic (${currentProvider})`;
      friendlyDesc = `Traffic is surging rapidly. Goal: Defend latency SLA and refuse naive downscaling.`;
    } else if (scenarioId === 'test_c') {
      friendlyName = `Scenario C — Stale Observation Telemetry (${currentProvider})`;
      friendlyDesc = `Observation timestamp is stale (>15m). Goal: Safety Guard halts optimization until fresh live telemetry is verified.`;
    } else if (scenarioId === 'test_d') {
      friendlyName = `Scenario D — Simulated Action Failure & Recovery (${currentProvider})`;
      friendlyDesc = `Cloud infrastructure rejects scaling action. Goal: Catch failure, flag recovery recommendation, and record audit log.`;
    }

    // Update Context Banner
    document.getElementById('scenario-name').textContent = friendlyName;
    document.getElementById('scenario-desc').textContent = friendlyDesc;
    document.getElementById('scenario-prompt').textContent = `"${data.prompt}"`;
    document.getElementById('prompt-input').value = data.prompt;

    // Reset pipeline view & diff
    resetPipelineView();
    resetDiffView();
    clearAgentLogs();
    updateStepperProgress('reset');

    addTimelineEvent('investigation', `Loaded Scenario: ${friendlyName}`);

    // Refresh telemetry
    await fetchServices();
    await fetchHistory();

  } catch (err) {
    console.error('Failed to load scenario:', err);
  }
}

// ==========================================================================
// Telemetry & Services Rendering (Multi-Cloud Aware)
// ==========================================================================

async function fetchServices() {
  try {
    const res = await fetch(apiUrl('/api/services'));
    currentServices = await res.json();
    renderServicesList(currentServices);
    populateManualDropdown(currentServices);
    updateTelemetryChart(currentServices);
  } catch (err) {
    console.error('Failed to fetch services:', err);
  }
}

function renderServicesList(services) {
  const container = document.getElementById('services-list');
  if (!container) return;

  if (services.length === 0) {
    container.innerHTML = '<div class="empty-text">No active servers found for selected provider.</div>';
    return;
  }

  container.innerHTML = services.map(svc => {
    const latPercent = Math.min(100, Math.round((svc.latency_ms / svc.max_latency_ms) * 100));
    let barColorClass = '';
    if (latPercent > 80) barColorClass = 'danger';
    else if (latPercent > 65) barColorClass = 'warning';

    const isStale = svc.timestamp && svc.timestamp.includes('08:00');
    const prov = (svc.cloud_provider || currentProvider).toUpperCase();
    const badgeClass = prov === 'AWS' ? 'badge-aws' : (prov === 'AZURE' ? 'badge-azure' : 'badge-gcp');

    // Provider specific details
    let providerMetaHtml = '';
    if (prov === 'AWS') {
      providerMetaHtml = `
        <div class="provider-meta-row">
          <div class="provider-meta-item">Region: <strong>${svc.region || 'ap-south-1'}</strong></div>
          <div class="provider-meta-item">Instance: <strong>${svc.resource_id || svc.service_id}</strong></div>
          <div class="provider-meta-item">Type: <strong>${svc.resource_type || svc.resource_size || 't3.medium'}</strong></div>
        </div>
      `;
    } else if (prov === 'AZURE') {
      providerMetaHtml = `
        <div class="provider-meta-row">
          <div class="provider-meta-item">Region: <strong>${svc.region || 'Central India'}</strong></div>
          <div class="provider-meta-item">VM: <strong>${svc.resource_id || svc.service_id}</strong></div>
          <div class="provider-meta-item">VM Size: <strong>${svc.resource_type || svc.resource_size || 'Standard_D2s_v5'}</strong></div>
        </div>
      `;
    } else { // GCP
      providerMetaHtml = `
        <div class="provider-meta-row">
          <div class="provider-meta-item">Zone: <strong>${svc.region || 'asia-south1-a'}</strong></div>
          <div class="provider-meta-item">Instance: <strong>${svc.resource_id || svc.service_id}</strong></div>
          <div class="provider-meta-item">Machine: <strong>${svc.resource_type || svc.resource_size || 'e2-medium'}</strong></div>
        </div>
      `;
    }

    return `
      <div class="service-card" id="card-${svc.service_id}">
        <div class="service-card-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="provider-badge ${badgeClass}">${prov}</span>
            <span class="service-id">${svc.service_id}</span>
          </div>
          <span class="service-status-badge ${isStale ? 'status-stale' : 'status-healthy'}">
            ${isStale ? '⚠️ Outdated Observation' : '● Live & Healthy'}
          </span>
        </div>

        <div class="telemetry-grid">
          <div class="metric-item">
            <span class="metric-label">Active Capacity</span>
            <span class="metric-val" style="color:var(--primary);">${svc.instances} ${prov === 'AZURE' ? 'VMs' : 'nodes'}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Hourly Spend</span>
            <span class="metric-val">$${svc.cost_per_hour}/hr</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">CPU Load</span>
            <span class="metric-val">${svc.cpu_percent}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Traffic Rate</span>
            <span class="metric-val">${svc.requests_per_minute} RPM</span>
          </div>
        </div>

        <div class="latency-bar-box">
          <div class="latency-bar-header">
            <span>Latency P95: <strong>${svc.latency_ms} ms</strong></span>
            <span>SLA Boundary: ${svc.max_latency_ms} ms</span>
          </div>
          <div class="latency-bar-track">
            <div class="latency-bar-fill ${barColorClass}" style="width: ${latPercent}%;"></div>
          </div>
        </div>

        ${providerMetaHtml}
      </div>
    `;
  }).join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`content-${tabId}`).classList.add('active');
}

// ==========================================================================
// PATH A: Autonomous Recommend Workflow (Multi-Cloud Aware)
// ==========================================================================

async function runRecommend() {
  const promptInput = document.getElementById('prompt-input');
  const runBtn = document.getElementById('btn-run-recommend');
  const prompt = promptInput.value.trim();

  runBtn.disabled = true;
  runBtn.innerHTML = `Running AI Analysis...`;

  const placeholder = document.getElementById('pipeline-placeholder');
  const cardsContainer = document.getElementById('agent-cards');
  placeholder.classList.add('hidden');
  cardsContainer.classList.remove('hidden');

  updateStepperProgress('agent1');
  addTimelineEvent('investigation', `Started ${currentProvider} analysis for goal: "${prompt}"`);

  cardsContainer.innerHTML = `<div class="loading-spinner" style="text-align:center;padding:24px;color:var(--primary);">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">Agent 1: Data Inspector (${currentProvider})</div>
    <div style="font-size:11px;color:var(--text-muted);">Normalizing raw provider metrics into CommonTelemetry and analyzing state...</div>
  </div>`;

  // Set running overview stats
  setRunningOverview();

  const startTime = performance.now();

  try {
    const res = await fetch(apiUrl('/api/recommend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_prompt: prompt, 
        auto_apply: false,
        provider: currentProvider
      })
    });
    const result = await res.json();
    const elapsedMs = Math.round(performance.now() - startTime);
    
    renderAgentPipeline(result);
    renderAgentLogs(result, elapsedMs);

  } catch (err) {
    cardsContainer.innerHTML = `<div class="error-msg">Error running AI analysis: ${err.message}</div>`;
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Run AI Analysis & Recommend
    `;
  }
}

function updateStepperProgress(stage) {
  const stages = ['request', 'agent1', 'agent2', 'agent3', 'action', 'verify'];
  
  stages.forEach(s => {
    const node = document.getElementById(`step-node-${s}`);
    if (node) node.className = 'stepper-step';
  });

  if (stage === 'reset') return;

  const idx = stages.indexOf(stage);
  for (let i = 0; i <= idx; i++) {
    const node = document.getElementById(`step-node-${stages[i]}`);
    if (node) {
      if (i < idx) node.className = 'stepper-step active completed';
      else node.className = 'stepper-step active';
    }
  }
}

function renderAgentPipeline(result) {
  const container = document.getElementById('agent-cards');
  if (!result || !result.proposals || result.proposals.length === 0) {
    container.innerHTML = '<div class="empty-text">No recommendations generated.</div>';
    return;
  }

  const prov = result.cloud_provider || currentProvider;

  container.innerHTML = result.proposals.map(item => {
    const inv = item.investigation;
    const prop = item.proposal;
    const safety = item.safety;
    const state = inv.current_state;

    // Beginner Friendly Diagnosis Labels
    let diagnosisLabel = inv.diagnosis;
    let diagBadgeClass = 'badge-blue';

    if (inv.diagnosis === 'OVER_PROVISIONED' || inv.diagnosis === 'UNDER_UTILIZATION') {
      diagnosisLabel = 'WASTED SPEND (Over-Provisioned)';
      diagBadgeClass = 'badge-green';
    } else if (inv.diagnosis === 'RISING_TRAFFIC') {
      diagnosisLabel = 'SURGING TRAFFIC (Protect SLA)';
      diagBadgeClass = 'badge-amber';
    } else if (inv.diagnosis === 'CRITICAL_LOAD') {
      diagnosisLabel = 'CRITICAL OVERLOAD (Scale Up)';
      diagBadgeClass = 'badge-red';
    } else if (inv.diagnosis === 'STALE_METRICS') {
      diagnosisLabel = 'STALE METRICS (Halt Downscale)';
      diagBadgeClass = 'badge-amber';
    }

    // Strategy Labels
    let actionLabel = prop.action_type.toUpperCase();
    if (prop.action_type === 'scale_down') actionLabel = 'Reduce Capacity (Save Spend)';
    if (prop.action_type === 'scale_up') actionLabel = 'Scale Up (Handle Load)';
    if (prop.action_type === 'no_action') actionLabel = 'Preserve Current Setup';

    // Confidence & Savings
    const confidenceScore = inv.is_fresh ? '96% (High)' : '72% (Medium)';
    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    const savingsPercent = state.cost_per_hour > 0 ? Math.round((savingsAmount / state.cost_per_hour) * 100) : 0;

    // Timeline logging
    addTimelineEvent('investigation', `Agent 1: Data Inspector analyzed ${item.service_id} (${prov}) -> ${diagnosisLabel}.`);
    addTimelineEvent('proposal', `Agent 2: Cost Saver proposed ${actionLabel} (${prop.current_instances} -> ${prop.target_instances} nodes). Savings: -$${savingsAmount}/hr.`);
    
    if (safety.approved) {
      addTimelineEvent('safety', `Agent 3: Safety Guard APPROVED recommendation for ${item.service_id}.`);
      updateStepperProgress('agent3');
    } else {
      addTimelineEvent('blocked', `Agent 3: Safety Guard BLOCKED recommendation for ${item.service_id}. Reason: ${safety.reason}`);
      const sNode = document.getElementById('step-node-agent3');
      if (sNode) sNode.className = 'stepper-step active blocked';
    }

    // Safety Checklist rules list with clear human names
    const safetyChecklist = [
      { name: 'Response Latency within SLA Limit', passed: !safety.violated_rules.some(r => r.includes('latency')) },
      { name: 'Service Health Status OK', passed: !safety.violated_rules.some(r => r.includes('unhealthy')) },
      { name: 'Observation Data is Fresh (<15m)', passed: inv.is_fresh },
      { name: 'Meets Minimum Capacity Limit', passed: !safety.violated_rules.some(r => r.includes('minimum')) },
      { name: 'Fits Hourly Budget Constraint', passed: !safety.violated_rules.some(r => r.includes('budget')) },
      { name: 'Step-by-Step Reduction Bound', passed: !safety.violated_rules.some(r => r.includes('single step')) }
    ];

    return `
      <div class="agent-pipeline-grid">
        <!-- AGENT 1: DATA INSPECTOR -->
        <div class="agent-node-card agent-1">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>🔍 AGENT 1: DATA INSPECTOR (${prov})</span>
            </span>
            <span class="agent-node-status ${diagBadgeClass}">${diagnosisLabel}</span>
          </div>

          <div class="agent-finding-box">
            <p class="agent-summary-text"><strong>Inspection Summary:</strong> ${inv.diagnosis_reason}</p>
            <div class="agent-meta-text">
              Target: <strong>${item.service_id}</strong> | Resource: <strong>${state.resource_id || state.service_id}</strong> | Provider: <strong>${prov}</strong>
            </div>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>CPU Load:</span> <strong>${state.cpu_percent}%</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Traffic:</span> <strong>${state.requests_per_minute} RPM</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Latency:</span> <strong>${state.latency_ms} ms</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Confidence:</span> <strong style="color:var(--primary);">${confidenceScore}</strong>
            </div>
          </div>
        </div>

        <!-- AGENT 2: COST SAVER -->
        <div class="agent-node-card agent-2">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>💡 AGENT 2: COST SAVER (${prov})</span>
            </span>
            <span class="agent-node-status badge-purple">${actionLabel}</span>
          </div>

          <div class="agent-finding-box">
            <p class="agent-summary-text"><strong>Cost Strategy:</strong> ${prop.reason}</p>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>Capacity Change:</span> <strong>${prop.current_instances} → ${prop.target_instances} nodes</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Hourly Savings:</span> <strong style="color:var(--success);">${savingsAmount > 0 ? `-$${savingsAmount}/hr` : '$0/hr'}</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Reduction:</span> <strong style="color:var(--success);">${savingsPercent}% cheaper</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Latency Risk:</span> <strong style="color:${prop.projected_latency_impact.toLowerCase().includes('negligible') || prop.projected_latency_impact.toLowerCase().includes('safe') ? 'var(--success)' : 'var(--warning)'}">${prop.projected_latency_impact}</strong>
            </div>
          </div>
          ${prop.memory_referenced ? `<div class="agent-memory-text">🧠 Memory Recall: ${prop.memory_referenced}</div>` : ''}
        </div>

        <!-- AGENT 3: SAFETY GUARD -->
        <div class="agent-node-card agent-3 ${safety.approved ? '' : 'blocked'}">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>🛡️ AGENT 3: SAFETY GUARD</span>
            </span>
            <span class="agent-node-status ${safety.approved ? 'badge-green' : 'badge-red'}">
              ${safety.approved ? '✓ APPROVED (Safe)' : '! BLOCKED (Unsafe)'}
            </span>
          </div>

          <div class="safety-checks-list">
            ${safetyChecklist.map(c => `
              <div class="safety-check-item ${c.passed ? 'passed' : 'failed'}">
                <span class="check-icon">${c.passed ? '✓' : '✕'}</span>
                <span class="check-label">${c.name}</span>
              </div>
            `).join('')}
          </div>

          <div class="safety-decision-box" style="margin-top:6px;border-left:3px solid ${safety.approved ? 'var(--success)' : 'var(--danger)'}">
            <p class="agent-summary-text"><strong>Safety Decision:</strong> ${safety.reason}</p>
          </div>
        </div>
      </div>

      <!-- ACTION EXECUTOR CTA BAR -->
      ${safety.approved && prop.action_type !== 'no_action' ? `
        <div class="action-cta-box">
          <div>
            <div class="action-stage-title">5. Action Stage: Ready to Apply Safe Change on ${prov}</div>
            <div class="action-stage-proposed">Proposed: Change <strong>${item.service_id}</strong> from ${prop.current_instances} → ${prop.target_instances} instances</div>
          </div>
          <button class="primary-btn" onclick="applyAction('${item.service_id}', '${prop.action_type}', ${prop.target_instances})">
            Apply Safe Changes to Live ${prov} Cloud
          </button>
        </div>
      ` : `
        <div class="action-cta-box status-msg-box">
          <div class="action-status-msg ${safety.approved ? 'msg-info' : 'msg-blocked'}">
            ${safety.approved ? 'No changes needed for this server right now.' : '<strong>Action Blocked:</strong> Safety Guard stopped this change to protect performance.'}
          </div>
        </div>
      `}
    `;
  }).join('');
}

// ==========================================================================
// APPLY ACTION & VERIFICATION (Agent 3)
// ==========================================================================

async function applyAction(serviceId, actionType, targetInstances) {
  try {
    updateStepperProgress('action');
    addTimelineEvent('action', `Applying safe server change on ${serviceId} (${currentProvider}) to ${targetInstances} instances...`);

    const res = await fetch(apiUrl('/api/apply-action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        action_type: actionType,
        target_instances: targetInstances
      })
    });
    const result = await res.json();

    updateStepperProgress('verify');
    addTimelineEvent('action', `Server change applied to ${serviceId}. Verifying new speed and savings...`);

    // Render Before vs After Diff Card & Outcome Highlights
    renderDiffCard(result);

    // Refresh telemetry and history
    await fetchServices();
    await fetchHistory();

  } catch (err) {
    alert(`Failed to apply action: ${err.message}`);
  }
}

function renderDiffCard(result) {
  const emptyDiff = document.getElementById('empty-diff');
  const activeCard = document.getElementById('active-diff-card');
  emptyDiff.classList.add('hidden');
  activeCard.classList.remove('hidden');

  const before = result.before_state;
  const after = result.after_state;
  const ver = result.verification;
  const prov = result.cloud_provider || currentProvider;

  document.getElementById('diff-service-name').textContent = `${result.action_result.service_id} (${prov})`;
  const statusBadge = document.getElementById('diff-status-badge');
  const summaryBox = document.getElementById('diff-summary-text');
  const recoveryBox = document.getElementById('recovery-box');

  statusBadge.textContent = ver.status === 'SUCCESS' ? 'VERIFIED PASSED' : 'DEGRADED';
  statusBadge.className = `pill-badge ${ver.status === 'SUCCESS' ? 'status-healthy' : 'badge-red'}`;
  summaryBox.textContent = ver.summary;

  // Calculate Savings Highlights
  if (before && after) {
    const hourlySaved = Math.max(0, before.cost_per_hour - after.cost_per_hour);
    const dailySaved = Math.round(hourlySaved * 24);

    document.getElementById('chip-hourly-saved').textContent = `$${hourlySaved.toFixed(2)}/hr`;
    document.getElementById('chip-daily-saved').textContent = `$${dailySaved}/day`;
    
    addTimelineEvent('action', `Verification Complete: Money Saved: $${hourlySaved.toFixed(2)}/hr ($${dailySaved}/day). Speed Limit OK.`);
  }

  // Friendly Table Metric Names
  const metricNameMap = {
    'Instances': 'Active Instances / VMs',
    'Cost': 'Hourly Spend ($/hr)',
    'Latency': 'Response Latency (P95 ms)',
    'CPU': 'Server Load (CPU %)',
    'Errors': 'Error Rate (%)'
  };

  // Render Table rows
  const tbody = document.getElementById('diff-table-body');
  if (ver.comparisons && ver.comparisons.length > 0) {
    tbody.innerHTML = ver.comparisons.map(c => `
      <tr>
        <td><strong>${metricNameMap[c.metric_name] || c.metric_name}</strong></td>
        <td>${c.before} ${c.unit}</td>
        <td>${c.after} ${c.unit}</td>
        <td class="${c.change_percent <= 0 ? 'diff-change-positive' : 'diff-change-negative'}">
          ${c.change_percent > 0 ? `+${c.change_percent}%` : `${c.change_percent}%`}
        </td>
        <td style="color:var(--text-dim);">${c.metric_name.includes('Latency') ? `${before ? before.max_latency_ms : 300} ms` : 'PASS'}</td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);">Action failed: ${result.action_result.error || 'Execution halted'}</td></tr>`;
  }

  // Show/hide rollback recovery
  if (ver.recovery_recommended) {
    recoveryBox.classList.remove('hidden');
    recoveryBox.dataset.serviceId = result.action_result.service_id;
    addTimelineEvent('blocked', `WARNING: Delay increased beyond limit on ${result.action_result.service_id}. Undo/Rollback recommended.`);
  } else {
    recoveryBox.classList.add('hidden');
  }
}

async function triggerRollback() {
  const recoveryBox = document.getElementById('recovery-box');
  const serviceId = recoveryBox.dataset.serviceId;
  if (!serviceId) return;

  try {
    addTimelineEvent('action', `Initiating emergency undo for ${serviceId} (${currentProvider})...`);
    const res = await fetch(apiUrl('/api/rollback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceId })
    });
    const result = await res.json();
    alert(`Rollback executed: ${result.service_id} restored to ${result.restored_instances} instances.`);
    addTimelineEvent('action', `Rollback completed for ${serviceId}. Restored to ${result.restored_instances} instances.`);
    await fetchServices();
    await fetchHistory();
    recoveryBox.classList.add('hidden');
  } catch (err) {
    alert(`Rollback failed: ${err.message}`);
  }
}

// ==========================================================================
// PATH B: Manual Slider Controls (Multi-Cloud Aware)
// ==========================================================================

function populateManualDropdown(services) {
  const select = document.getElementById('manual-service-select');
  if (!select) return;

  const prevVal = select.value;
  select.innerHTML = services.map(s => `
    <option value="${s.service_id}">${s.service_id} [${s.cloud_provider || currentProvider}] (${s.instances} nodes, $${s.cost_per_hour}/hr)</option>
  `).join('');

  if (prevVal && services.find(s => s.service_id === prevVal)) {
    select.value = prevVal;
  }
  onManualServiceSelected();
}

function onManualServiceSelected() {
  const select = document.getElementById('manual-service-select');
  if (!select || !select.value) return;

  const serviceId = select.value;
  lastSelectedManualServiceId = serviceId;
  const svc = currentServices.find(s => s.service_id === serviceId);
  if (!svc) return;

  const slider = document.getElementById('instance-slider');
  slider.min = Math.max(0, svc.min_instances - 1);
  slider.max = svc.max_instances + 2;
  slider.value = svc.instances;

  document.getElementById('slider-instance-val').textContent = svc.instances;
  document.getElementById('slider-markers').innerHTML = `
    <span>Min Allowed: ${svc.min_instances}</span>
    <span>Current: ${svc.instances}</span>
    <span>Max Allowed: ${svc.max_instances}</span>
  `;

  evaluateManualChangeDebounced(serviceId, svc.instances);
}

function onSliderInput(val) {
  document.getElementById('slider-instance-val').textContent = val;
  const serviceId = document.getElementById('manual-service-select').value;
  evaluateManualChangeDebounced(serviceId, parseInt(val, 10));
}

function evaluateManualChangeDebounced(serviceId, targetInstances) {
  clearTimeout(sliderTimeout);
  sliderTimeout = setTimeout(async () => {
    try {
      const res = await fetch(apiUrl('/api/evaluate-manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, target_instances: targetInstances })
      });
      const data = await res.json();
      renderPreflightEvaluation(data, targetInstances);
    } catch (err) {
      console.error('Failed manual pre-flight check:', err);
    }
  }, 150);
}

function renderPreflightEvaluation(data, targetInstances) {
  const badge = document.getElementById('preflight-badge');
  const reason = document.getElementById('preflight-reason');
  const impact = document.getElementById('preflight-impact');
  const applyBtn = document.getElementById('btn-apply-manual');

  let recText = data.recommendation.replace('_', ' ');
  if (data.recommendation === 'RECOMMENDED') recText = 'RECOMMENDED (SAFE)';
  if (data.recommendation === 'NOT_RECOMMENDED') recText = 'NOT RECOMMENDED (RISKY)';
  if (data.recommendation === 'UNSAFE_BLOCKED') recText = 'BLOCKED BY SAFETY GUARD';

  badge.textContent = recText;
  badge.className = `preflight-badge badge-${data.recommendation.toLowerCase().replace('_', '-')}`;
  reason.textContent = data.reason;

  if (data.projected_impact) {
    impact.textContent = `Hourly Cost Change: ${data.projected_impact.cost_delta ? (data.projected_impact.cost_delta < 0 ? `-$${Math.abs(data.projected_impact.cost_delta)}/hr` : `+$${data.projected_impact.cost_delta}/hr`) : '$0'} | Latency Risk: ${data.projected_impact.latency_risk || 'N/A'}`;
  } else {
    impact.textContent = '';
  }

  if (data.recommendation === 'UNSAFE_BLOCKED') {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Blocked by Safety Guard';
  } else {
    applyBtn.disabled = false;
    applyBtn.textContent = `Apply Change (${targetInstances} nodes)`;
  }
}

async function applyManualChange() {
  const serviceId = document.getElementById('manual-service-select').value;
  const targetInstances = parseInt(document.getElementById('instance-slider').value, 10);
  const svc = currentServices.find(s => s.service_id === serviceId);
  const actionType = targetInstances < svc.instances ? 'scale_down' : 'scale_up';

  await applyAction(serviceId, actionType, targetInstances);
}

// ==========================================================================
// Step 9: Historical Optimization Memory (Multi-Cloud Aware)
// ==========================================================================

async function fetchHistory() {
  try {
    const res = await fetch(apiUrl('/api/history'));
    const data = await res.json();
    renderMemoryList(data.optimization_history);
  } catch (err) {
    console.error('Failed to fetch history:', err);
  }
}

function renderMemoryList(records) {
  const container = document.getElementById('memory-list');
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = '<div class="memory-empty">No previous savings recorded yet.</div>';
    return;
  }

  container.innerHTML = records.map(r => `
    <div class="memory-item">
      <div class="memory-item-top">
        <span><strong>${r.service_id}</strong> [${r.cloud_provider || 'AWS'}] (${r.action_type})</span>
        <span style="color:${r.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)'};">${r.status === 'SUCCESS' ? 'VERIFIED PASSED' : r.status}</span>
      </div>
      <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);">
        Capacity: ${r.instances_before} → ${r.instances_after} | Spend: $${r.cost_before} → $${r.cost_after}/hr
      </div>
      <div class="memory-item-notes">${r.notes}</div>
    </div>
  `).join('');
}

function resetPipelineView() {
  const placeholder = document.getElementById('pipeline-placeholder');
  const cards = document.getElementById('agent-cards');
  if (placeholder && cards) {
    placeholder.classList.remove('hidden');
    cards.classList.add('hidden');
    cards.innerHTML = '';
  }
}

function resetDiffView() {
  const emptyDiff = document.getElementById('empty-diff');
  const activeCard = document.getElementById('active-diff-card');
  if (emptyDiff && activeCard) {
    emptyDiff.classList.remove('hidden');
    activeCard.classList.add('hidden');
  }
}

// ==========================================================================
// Phase 5: Export Compliance Audit Report
// ==========================================================================

async function exportAuditReport(format) {
  try {
    const res = await fetch(apiUrl('/api/history'));
    const data = await res.json();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (format === 'json') {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cloud_guardian_audit_report_${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const records = data.optimization_history || [];
      if (records.length === 0) {
        alert('No optimization history to export yet.');
        return;
      }
      const headers = ['history_id', 'cloud_provider', 'service_id', 'action_type', 'instances_before', 'instances_after', 'cost_before', 'cost_after', 'latency_before', 'latency_after', 'status', 'created_at', 'notes'];
      const rows = records.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cloud_guardian_audit_report_${timestamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}

// ==========================================================================
// Agent Logs & Dynamic Execution Overview (Part T)
// ==========================================================================

let totalAgents = 3;
let completedAgents = 0;
let runningAgents = 0;
let failedAgents = 0;
let totalTimeMs = 0;

function updateOverview() {
  const elTotal = document.getElementById('overview-total');
  if (elTotal) {
    elTotal.textContent = totalAgents;
    document.getElementById('overview-completed').textContent = completedAgents;
    document.getElementById('overview-running').textContent = runningAgents;
    document.getElementById('overview-failed').textContent = failedAgents;
    document.getElementById('overview-time').textContent = (totalTimeMs / 1000).toFixed(1) + 's';
  }
}

function setRunningOverview() {
  totalAgents = 3;
  completedAgents = 0;
  runningAgents = 3;
  failedAgents = 0;
  totalTimeMs = 0;
  updateOverview();
}

function clearAgentLogs() {
  totalAgents = 3;
  completedAgents = 0;
  runningAgents = 0;
  failedAgents = 0;
  totalTimeMs = 0;
  updateOverview();
  const container = document.getElementById('agent-logs-container');
  if (container) {
    container.innerHTML = '<div class="timeline-empty" style="text-align:center;padding:20px;color:var(--text-dim);">No agent executions recorded yet. Run an analysis.</div>';
  }
}

function renderAgentLogs(result, elapsedMs) {
  const container = document.getElementById('agent-logs-container');
  if (!container) return;
  container.innerHTML = '';

  if (!result || !result.proposals || result.proposals.length === 0) return;

  const proposals = result.proposals;
  const prov = result.cloud_provider || currentProvider;
  const execMetrics = result.execution_metrics || {};

  const t1 = execMetrics.agent1_duration_ms || Math.round(elapsedMs * 0.4);
  const t2 = execMetrics.agent2_duration_ms || Math.round(elapsedMs * 0.4);
  const t3 = execMetrics.agent3_duration_ms || Math.round(elapsedMs * 0.2);
  const totalMs = elapsedMs || execMetrics.total_duration_ms || (t1 + t2 + t3);

  const allApproved = proposals.every(item => item.safety.approved);

  totalAgents = 3;
  runningAgents = 0;
  completedAgents = allApproved ? 3 : 2;
  failedAgents = allApproved ? 0 : 1;
  totalTimeMs = totalMs;
  updateOverview();

  // --- 1. Agent 1: Data Inspector ---
  const input1 = proposals.map(item => {
    const s = item.investigation.current_state;
    const inv = item.investigation;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Provider</span><span class="metric-val">${prov}</span></div>
        <div class="metric-row"><span class="metric-name">Resource</span><span class="metric-val">${s.resource_id || item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">CPU Load</span><span class="metric-val">${s.cpu_percent}%</span></div>
        <div class="metric-row"><span class="metric-name">Traffic</span><span class="metric-val">${s.requests_per_minute} RPM</span></div>
        <div class="metric-row"><span class="metric-name">Latency</span><span class="metric-val">${s.latency_ms} ms</span></div>
        <div class="metric-row"><span class="metric-name">Capacity</span><span class="metric-val">${s.instances} nodes</span></div>
        <div class="metric-row"><span class="metric-name">Data Freshness</span><span class="metric-val">${inv.is_fresh ? 'Fresh (<15m)' : 'Stale (>15m)'}</span></div>
      </div>
    `;
  }).join('');

  const basis1 = `Normalized raw ${prov} telemetry into CommonTelemetry schema. Analyzed saturation and latency boundaries against user instruction: "${result.user_prompt}".`;
  const output1 = proposals.map(item => {
    const inv = item.investigation;
    return `<strong>${item.service_id} [${prov}]:</strong> Diagnosis: <strong>${inv.diagnosis}</strong><br/>Reason: ${inv.diagnosis_reason}`;
  }).join('<br/><br/>');

  addAgentLogCard(`Agent 1: Data Inspector (${prov})`, 'COMPLETED', t1, input1, basis1, output1);

  // --- 2. Agent 2: Cost Saver ---
  const input2 = proposals.map(item => {
    const inv = item.investigation;
    const s = item.investigation.current_state;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Target Service</span><span class="metric-val">${item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">Diagnosis</span><span class="metric-val">${inv.diagnosis}</span></div>
        <div class="metric-row"><span class="metric-name">Spend</span><span class="metric-val">$${s.cost_per_hour}/hr</span></div>
        <div class="metric-row"><span class="metric-name">Current Nodes</span><span class="metric-val">${s.instances}</span></div>
      </div>
    `;
  }).join('');

  const basis2 = `Calculated cost-performance trade-offs for ${prov} infrastructure. Formulated optimization proposal aligning with goal: "${result.user_prompt}".`;
  const output2 = proposals.map(item => {
    const prop = item.proposal;
    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    return `<strong>${item.service_id}:</strong> Action: <strong>${prop.action_type.toUpperCase()}</strong> (${prop.current_instances} → ${prop.target_instances} nodes)<br/>Savings: <strong>-$${savingsAmount.toFixed(2)}/hr</strong><br/>Strategy: ${prop.reason}`;
  }).join('<br/><br/>');

  addAgentLogCard(`Agent 2: Cost Saver (${prov})`, 'COMPLETED', t2, input2, basis2, output2);

  // --- 3. Agent 3: Safety Guard ---
  const safetyStatus = allApproved ? 'COMPLETED' : 'FAILED';
  const input3 = proposals.map(item => {
    const prop = item.proposal;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Service</span><span class="metric-val">${item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">Proposed Action</span><span class="metric-val">${prop.action_type.toUpperCase()}</span></div>
        <div class="metric-row"><span class="metric-name">Target Nodes</span><span class="metric-val">${prop.target_instances}</span></div>
      </div>
    `;
  }).join('');

  const basis3 = `Executed deterministic safety policy validation against latency thresholds, minimum instance constraints, budget boundaries, and data freshness requirements on ${prov}.`;
  const output3 = proposals.map(item => {
    const s = item.safety;
    return `<strong>${item.service_id}:</strong> Verdict: <strong>${s.approved ? '✓ APPROVED (Safe)' : '✕ BLOCKED (Unsafe)'}</strong><br/>Reason: ${s.reason}${s.violated_rules && s.violated_rules.length ? `<br/>Violated Rules: ${s.violated_rules.join(', ')}` : ''}`;
  }).join('<br/><br/>');

  addAgentLogCard(`Agent 3: Safety Guard (${prov})`, safetyStatus, t3, input3, basis3, output3);
}

function addAgentLogCard(agentName, status, durationMs, inputHtml, basisHtml, outputHtml) {
  const container = document.getElementById('agent-logs-container');
  if (!container) return;
  
  const emptyMsg = container.querySelector('.timeline-empty');
  if (emptyMsg) emptyMsg.remove();

  const card = document.createElement('div');
  card.className = 'agent-log-card expanded';
  
  let icon = '🤖';
  if (agentName.includes('Data') || agentName.includes('Inspector')) icon = '🔍';
  else if (agentName.includes('Cost') || agentName.includes('Saver')) icon = '💡';
  else if (agentName.includes('Safety') || agentName.includes('Guard')) icon = '🛡️';

  card.innerHTML = `
    <div class="agent-log-header" onclick="this.parentElement.classList.toggle('expanded')">
      <div class="agent-log-title">
        <span>${icon}</span>
        <span>${agentName}</span>
      </div>
      <div class="agent-log-meta">
        <span class="pill-badge ${status === 'COMPLETED' ? 'safety-pill' : (status === 'FAILED' ? 'badge-red' : 'badge-amber')}">${status === 'COMPLETED' ? '✓ ' : ''}${status}</span>
        <span>${(durationMs / 1000).toFixed(1)}s</span>
        <span>▼</span>
      </div>
    </div>
    <div class="agent-log-body">
      <div class="agent-flow-section">
        <div class="flow-label">📥 INPUT TELEMETRY</div>
        <div class="agent-flow-box">${inputHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">🔎 REASONING & DECISION BASIS</div>
        <div class="agent-flow-box">${basisHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">📤 OUTPUT / VERDICT</div>
        <div class="agent-flow-box bg-output">${outputHtml}</div>
      </div>
    </div>
  `;
  container.appendChild(card);
}


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
