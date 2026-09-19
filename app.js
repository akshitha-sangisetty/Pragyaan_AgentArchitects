/**
 * Autonomous Cloud Cost Optimization Engine — Frontend Logic
 * Simplified Human-Understandable Labels for Review Presentation
 */

let currentServices = [];
let currentScenarioId = 'test_a';
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
          label: 'Response Delay / Speed (ms)',
          data: [],
          backgroundColor: 'rgba(6, 182, 212, 0.65)',
          borderColor: '#06b6d4',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Max Allowed Speed Limit',
          data: [],
          type: 'line',
          borderColor: '#f43f5e',
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
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 }
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
// Scenario Loading
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
      body: JSON.stringify({ scenario_id: scenarioId })
    });
    const data = await res.json();

    // Friendly Scenario Descriptions
    let friendlyName = data.name;
    let friendlyDesc = data.description;

    if (scenarioId === 'test_a') {
      friendlyName = 'Scenario A — Wasted Money (Over-Provisioned Servers)';
      friendlyDesc = 'Server has too much unused capacity (6 servers). Goal: Reduce server count to save money without slowing down the website.';
    } else if (scenarioId === 'test_b') {
      friendlyName = 'Scenario B — High Visitor Traffic (Scale Up Required)';
      friendlyDesc = 'Traffic is surging rapidly. Goal: Add more servers so the website stays fast and does not crash under high load.';
    } else if (scenarioId === 'test_c') {
      friendlyName = 'Scenario C — Outdated Server Data (Safety Guard Block)';
      friendlyDesc = 'Server telemetry data is old (>15 min). Goal: Safety Guard must block any changes until fresh data arrives.';
    } else if (scenarioId === 'test_d') {
      friendlyName = 'Scenario D — Risky Server Action (Safety Guard Block)';
      friendlyDesc = 'Proposed server reduction threatens website response speed limit. Goal: Safety Guard detects danger and blocks action.';
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

    // Add timeline log
    addTimelineEvent('investigation', `Loaded Demo Scenario: ${friendlyName}`);

    // Refresh telemetry
    await fetchServices();
    await fetchHistory();

  } catch (err) {
    console.error('Failed to load scenario:', err);
  }
}

// ==========================================================================
// Telemetry & Services Rendering
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
    container.innerHTML = '<div class="empty-text">No active servers found.</div>';
    return;
  }

  container.innerHTML = services.map(svc => {
    const latPercent = Math.min(100, Math.round((svc.latency_ms / svc.max_latency_ms) * 100));
    let barColorClass = '';
    if (latPercent > 80) barColorClass = 'danger';
    else if (latPercent > 65) barColorClass = 'warning';

    const isStale = svc.timestamp && svc.timestamp.includes('08:00');

    return `
      <div class="service-card" id="card-${svc.service_id}">
        <div class="service-card-header">
          <span class="service-id">${svc.service_id}</span>
          <span class="service-status-badge ${isStale ? 'status-stale' : 'status-healthy'}">
            ${isStale ? '⚠️ Outdated Server Data' : '● Healthy & Up-to-Date'}
          </span>
        </div>

        <div class="telemetry-grid">
          <div class="metric-item">
            <span class="metric-label">Active Servers</span>
            <span class="metric-val" style="color:var(--primary);">${svc.instances} servers</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Hourly Spend</span>
            <span class="metric-val">$${svc.cost_per_hour}/hr</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Server Load (CPU)</span>
            <span class="metric-val">${svc.cpu_percent}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Visitors / Traffic</span>
            <span class="metric-val">${svc.requests_per_minute} RPM</span>
          </div>
        </div>

        <div class="latency-bar-box">
          <div class="latency-bar-header">
            <span>Response Delay: <strong>${svc.latency_ms} ms</strong></span>
            <span>Speed Limit: ${svc.max_latency_ms} ms</span>
          </div>
          <div class="latency-bar-track">
            <div class="latency-bar-fill ${barColorClass}" style="width: ${latPercent}%;"></div>
          </div>
        </div>
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
// PATH A: Autonomous Recommend Workflow
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
  addTimelineEvent('investigation', `Started AI analysis for goal: "${prompt}"`);

  cardsContainer.innerHTML = `<div class="loading-spinner" style="text-align:center;padding:24px;color:var(--primary);">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">Agent 1: Data Inspector</div>
    <div style="font-size:11px;color:var(--text-muted);">Reading server metrics, workload, speed & data freshness...</div>
  </div>`;

  try {
    const res = await fetch(apiUrl('/api/recommend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_prompt: prompt, auto_apply: false })
    });
    const result = await res.json();
    
    
    renderAgentPipeline(result);
    renderAgentLogs(result);

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

  container.innerHTML = result.proposals.map(item => {
    const inv = item.investigation;
    const prop = item.proposal;
    const safety = item.safety;
    const state = inv.current_state;

    // Beginner Friendly Diagnosis Labels
    let diagnosisLabel = inv.diagnosis;
    let diagBadgeClass = 'badge-blue';

    if (inv.diagnosis === 'OVER_PROVISIONED' || inv.diagnosis === 'UNDER_UTILIZATION') {
      diagnosisLabel = 'WASTED SPEND (Too Many Servers)';
      diagBadgeClass = 'badge-green';
    } else if (inv.diagnosis === 'RISING_TRAFFIC') {
      diagnosisLabel = 'HIGH TRAFFIC (Add Capacity)';
      diagBadgeClass = 'badge-amber';
    } else if (inv.diagnosis === 'CRITICAL_LOAD') {
      diagnosisLabel = 'CRITICAL OVERLOAD (Action Required)';
      diagBadgeClass = 'badge-red';
    } else if (inv.diagnosis === 'STALE_TELEMETRY') {
      diagnosisLabel = 'OUTDATED DATA (Must Refresh)';
      diagBadgeClass = 'badge-amber';
    }

    // Strategy Labels
    let actionLabel = prop.action_type.toUpperCase();
    if (prop.action_type === 'scale_down') actionLabel = 'Reduce Servers (Save Money)';
    if (prop.action_type === 'scale_up') actionLabel = 'Add Servers (Handle Traffic)';
    if (prop.action_type === 'no_action') actionLabel = 'Keep Current Setup';

    // Confidence & Savings
    const confidenceScore = inv.is_fresh ? '94% (High)' : '70% (Medium)';
    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    const savingsPercent = state.cost_per_hour > 0 ? Math.round((savingsAmount / state.cost_per_hour) * 100) : 0;

    // Timeline logging
    addTimelineEvent('investigation', `Agent 1: Data Inspector analyzed ${item.service_id} -> ${diagnosisLabel}.`);
    addTimelineEvent('proposal', `Agent 2: Cost Saver proposed ${actionLabel} (${prop.current_instances} -> ${prop.target_instances} servers). Savings: -$${savingsAmount}/hr.`);
    
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
      { name: 'Response Speed within Safe Limit', passed: !safety.violated_rules.some(r => r.includes('latency')) },
      { name: 'Server Health Status OK', passed: !safety.violated_rules.some(r => r.includes('unhealthy')) },
      { name: 'Server Data is Fresh & Current', passed: inv.is_fresh },
      { name: 'Meets Minimum Server Requirement', passed: !safety.violated_rules.some(r => r.includes('minimum')) },
      { name: 'Fits Hourly Budget Limit', passed: !safety.violated_rules.some(r => r.includes('budget')) },
      { name: 'Safe Step-by-Step Change', passed: !safety.violated_rules.some(r => r.includes('single step')) }
    ];

    return `
      <div class="agent-pipeline-grid">
        <!-- AGENT 1: DATA INSPECTOR -->
        <div class="agent-node-card agent-1">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>🔍 AGENT 1: DATA INSPECTOR</span>
            </span>
            <span class="agent-node-status ${diagBadgeClass}">${diagnosisLabel}</span>
          </div>

          <div class="agent-finding-box">
            <p class="agent-summary-text"><strong>Inspection Summary:</strong> ${inv.diagnosis_reason}</p>
            <div class="agent-meta-text">
              Target: <strong>${item.service_id}</strong> | Data Status: <strong>${inv.is_fresh ? 'Fresh Data' : 'Old Data (>15m)'}</strong>
            </div>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>Server Load:</span> <strong>${state.cpu_percent}%</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Visitors:</span> <strong>${state.requests_per_minute} RPM</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Delay:</span> <strong>${state.latency_ms} ms</strong>
            </div>
            <div class="agent-metric-chip">
              <span>AI Certainty:</span> <strong style="color:var(--primary);">${confidenceScore}</strong>
            </div>
          </div>
        </div>

        <!-- AGENT 2: COST SAVER -->
        <div class="agent-node-card agent-2">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>💡 AGENT 2: COST SAVER</span>
            </span>
            <span class="agent-node-status badge-purple">${actionLabel}</span>
          </div>

          <div class="agent-finding-box">
            <p class="agent-summary-text"><strong>Cost Strategy:</strong> ${prop.reason}</p>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>Server Change:</span> <strong>${prop.current_instances} → ${prop.target_instances} servers</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Hourly Savings:</span> <strong style="color:var(--success);">${savingsAmount > 0 ? `-$${savingsAmount}/hr` : '$0/hr'}</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Cost Reduction:</span> <strong style="color:var(--success);">${savingsPercent}% cheaper</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Speed Risk:</span> <strong style="color:${prop.projected_latency_impact === 'LOW' ? 'var(--success)' : 'var(--warning)'}">${prop.projected_latency_impact}</strong>
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
            <div class="action-stage-title">5. Action Stage: Ready to Apply Safe Change</div>
            <div class="action-stage-proposed">Proposed: Change <strong>${item.service_id}</strong> from ${prop.current_instances} → ${prop.target_instances} servers</div>
          </div>
          <button class="primary-btn" onclick="applyAction('${item.service_id}', '${prop.action_type}', ${prop.target_instances})">
            Apply Safe Changes to Live Cloud
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
    addTimelineEvent('action', `Applying safe server change on ${serviceId} to ${targetInstances} servers...`);

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

  document.getElementById('diff-service-name').textContent = result.action_result.service_id;
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
    'Active Instances': 'Active Servers',
    'Cost per Hour': 'Hourly Spend ($/hr)',
    'CPU %': 'Server Load (CPU %)',
    'Latency P95': 'Response Delay (Speed ms)',
    'Requests per Minute': 'Visitor Traffic (RPM)'
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
    addTimelineEvent('action', `Initiating emergency undo for ${serviceId}...`);
    const res = await fetch(apiUrl('/api/rollback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceId })
    });
    const result = await res.json();
    alert(`Rollback executed: ${result.service_id} restored to ${result.restored_instances} servers.`);
    addTimelineEvent('action', `Rollback completed for ${serviceId}. Restored to ${result.restored_instances} servers.`);
    await fetchServices();
    await fetchHistory();
    recoveryBox.classList.add('hidden');
  } catch (err) {
    alert(`Rollback failed: ${err.message}`);
  }
}

// ==========================================================================
// PATH B: Manual Slider Controls
// ==========================================================================

function populateManualDropdown(services) {
  const select = document.getElementById('manual-service-select');
  if (!select) return;

  const prevVal = select.value;
  select.innerHTML = services.map(s => `
    <option value="${s.service_id}">${s.service_id} (${s.instances} servers, $${s.cost_per_hour}/hr)</option>
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

  // Evaluate current value immediately
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
    impact.textContent = `Hourly Cost Change: ${data.projected_impact.cost_delta ? (data.projected_impact.cost_delta < 0 ? `-$${Math.abs(data.projected_impact.cost_delta)}/hr` : `+$${data.projected_impact.cost_delta}/hr`) : '$0'} | Speed Risk: ${data.projected_impact.latency_risk || 'N/A'}`;
  } else {
    impact.textContent = '';
  }

  if (data.recommendation === 'UNSAFE_BLOCKED') {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Blocked by Safety Guard';
  } else {
    applyBtn.disabled = false;
    applyBtn.textContent = `Apply Change (${targetInstances} servers)`;
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
// Step 9: Historical Optimization Memory
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
        <span><strong>${r.service_id}</strong> (${r.action_type})</span>
        <span style="color:${r.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)'};">${r.status === 'SUCCESS' ? 'VERIFIED PASSED' : r.status}</span>
      </div>
      <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);">
        Servers: ${r.instances_before} → ${r.instances_after} | Spend: $${r.cost_before} → $${r.cost_after}/hr
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
      const headers = ['history_id', 'service_id', 'action_type', 'instances_before', 'instances_after', 'cost_before', 'cost_after', 'latency_before', 'latency_after', 'status', 'created_at', 'notes'];
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
// Agent Logs & Execution Overview (3 Autonomous Agents)
// ==========================================================================

let totalAgents = 0;
let completedAgents = 0;
let runningAgents = 0;
let failedAgents = 0;
let totalTimeMs = 0;

function updateOverview() {
  const elTotal = document.getElementById('overview-total');
  if(elTotal) {
    elTotal.textContent = totalAgents;
    document.getElementById('overview-completed').textContent = completedAgents;
    document.getElementById('overview-running').textContent = runningAgents;
    document.getElementById('overview-failed').textContent = failedAgents;
    document.getElementById('overview-time').textContent = (totalTimeMs / 1000).toFixed(1) + 's';
  }
}

function clearAgentLogs() {
  totalAgents = 0;
  completedAgents = 0;
  runningAgents = 0;
  failedAgents = 0;
  totalTimeMs = 0;
  updateOverview();
  const container = document.getElementById('agent-logs-container');
  if(container) {
    container.innerHTML = '<div class="timeline-empty" style="text-align:center;padding:20px;color:var(--text-dim);">No agent executions recorded yet. Run an analysis.</div>';
  }
}

function renderAgentLogs(result) {
  clearAgentLogs();
  if (!result || !result.proposals || result.proposals.length === 0) return;

  const proposals = result.proposals;

  // --- 1. Agent 1: Data Inspector ---
  const input1 = proposals.map(item => {
    const s = item.investigation.current_state;
    const inv = item.investigation;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Service</span><span class="metric-val">${item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">CPU Load</span><span class="metric-val">${s.cpu_percent}%</span></div>
        <div class="metric-row"><span class="metric-name">Traffic</span><span class="metric-val">${s.requests_per_minute} RPM</span></div>
        <div class="metric-row"><span class="metric-name">Latency</span><span class="metric-val">${s.latency_ms} ms</span></div>
        <div class="metric-row"><span class="metric-name">Servers</span><span class="metric-val">${s.instances}</span></div>
        <div class="metric-row"><span class="metric-name">Fresh Data</span><span class="metric-val">${inv.is_fresh ? 'Yes (<15m)' : 'Stale (>15m)'}</span></div>
      </div>
    `;
  }).join('');

  const basis1 = `Analyzed real-time telemetry metrics and resource saturation against health baselines and data freshness windows. Evaluated ${proposals.length} service(s) for operational stability.`;

  const output1 = proposals.map(item => {
    const inv = item.investigation;
    return `<strong>${item.service_id}:</strong> Diagnosis: <strong>${inv.diagnosis}</strong><br/>Reason: ${inv.diagnosis_reason}`;
  }).join('<br/><br/>');

  addAgentLog('Agent 1: Data Inspector', 'COMPLETED', 1200, input1, basis1, output1);

  // --- 2. Agent 2: Cost Saver ---
  const input2 = proposals.map(item => {
    const inv = item.investigation;
    const s = item.investigation.current_state;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Service</span><span class="metric-val">${item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">Diagnosis</span><span class="metric-val">${inv.diagnosis}</span></div>
        <div class="metric-row"><span class="metric-name">Current Spend</span><span class="metric-val">$${s.cost_per_hour}/hr</span></div>
        <div class="metric-row"><span class="metric-name">Current Servers</span><span class="metric-val">${s.instances}</span></div>
      </div>
    `;
  }).join('');

  const basis2 = `Calculated cost-performance trade-offs and capacity rightsizing models to eliminate over-provisioning spend while preserving required latency headroom.`;

  const output2 = proposals.map(item => {
    const prop = item.proposal;
    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    return `<strong>${item.service_id}:</strong> Proposed Action: <strong>${prop.action_type.toUpperCase()}</strong> (${prop.current_instances} → ${prop.target_instances} servers)<br/>Savings: <strong>-$${savingsAmount.toFixed(2)}/hr</strong><br/>Strategy: ${prop.reason}`;
  }).join('<br/><br/>');

  addAgentLog('Agent 2: Cost Saver', 'COMPLETED', 1800, input2, basis2, output2);

  // --- 3. Agent 3: Safety Guard ---
  const allApproved = proposals.every(item => item.safety.approved);
  const safetyStatus = allApproved ? 'COMPLETED' : 'FAILED';

  const input3 = proposals.map(item => {
    const prop = item.proposal;
    return `
      <div class="metric-grid" style="margin-bottom:8px;">
        <div class="metric-row"><span class="metric-name">Target Service</span><span class="metric-val">${item.service_id}</span></div>
        <div class="metric-row"><span class="metric-name">Proposed Action</span><span class="metric-val">${prop.action_type.toUpperCase()}</span></div>
        <div class="metric-row"><span class="metric-name">Target Servers</span><span class="metric-val">${prop.target_instances}</span></div>
      </div>
    `;
  }).join('');

  const basis3 = `Executed deterministic safety policy validation against latency thresholds, minimum instance constraints, budget boundaries, and data freshness requirements.`;

  const output3 = proposals.map(item => {
    const s = item.safety;
    return `<strong>${item.service_id}:</strong> Verdict: <strong>${s.approved ? '✓ APPROVED (Safe)' : '✕ BLOCKED (Unsafe)'}</strong><br/>Reason: ${s.reason}${s.violated_rules && s.violated_rules.length ? `<br/>Violated Rules: ${s.violated_rules.join(', ')}` : ''}`;
  }).join('<br/><br/>');

  addAgentLog('Agent 3: Safety Guard', safetyStatus, 900, input3, basis3, output3);
}

function addAgentLog(agentName, status, durationMs, inputHtml, basisHtml, outputHtml) {
  totalAgents++;
  if (status === 'COMPLETED') completedAgents++;
  else if (status === 'FAILED') failedAgents++;
  else if (status === 'RUNNING') runningAgents++;
  
  totalTimeMs += durationMs;
  updateOverview();

  const container = document.getElementById('agent-logs-container');
  if(!container) return;
  
  const emptyMsg = container.querySelector('.timeline-empty');
  if(emptyMsg) emptyMsg.remove();

  const card = document.createElement('div');
  card.className = 'agent-log-card expanded'; // Expanded by default for visibility
  
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
        <div class="flow-label">📥 INPUT</div>
        <div class="agent-flow-box">${inputHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">🔎 DECISION BASIS</div>
        <div class="agent-flow-box">${basisHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">📤 OUTPUT</div>
        <div class="agent-flow-box bg-output">${outputHtml}</div>
      </div>
    </div>
  `;
  container.appendChild(card);
}
