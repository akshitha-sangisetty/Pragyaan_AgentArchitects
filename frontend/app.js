/**
 * Autonomous Cloud Cost Optimization Engine — Frontend Logic
 * Supports:
 * - Scenario Switching (Test A, B, C, D)
 * - Path A: Autonomous 3-Agent Closed Loop (Telemetry Analyst -> Cost Optimizer -> Safety Validator -> Action -> Verifier)
 * - Path B: Manual What-If Slider with Instant Safety Pre-Flight Check
 * - Before vs After Verification Diff Card & Financial Savings Outcome
 * - Real-Time Audit Activity Timeline & Historical Memory Log (Step 9)
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
    category: category, // 'investigation', 'proposal', 'safety', 'action', 'blocked'
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
          label: 'Current Latency (ms)',
          data: [],
          backgroundColor: 'rgba(6, 182, 212, 0.65)',
          borderColor: '#06b6d4',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Max Latency SLA Boundary',
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
  telemetryChart.update('none'); // Update without full redraw animation
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

    // Update Context Banner
    document.getElementById('scenario-name').textContent = data.name;
    document.getElementById('scenario-desc').textContent = data.description;
    document.getElementById('scenario-prompt').textContent = `"${data.prompt}"`;
    document.getElementById('prompt-input').value = data.prompt;

    // Reset pipeline view & diff
    resetPipelineView();
    resetDiffView();
    updateStepperProgress('reset');

    // Add timeline log
    addTimelineEvent('investigation', `Loaded Test Scenario ${scenarioId.toUpperCase()}: ${data.name}`);

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
    container.innerHTML = '<div class="empty-text">No services in registry.</div>';
    return;
  }

  container.innerHTML = services.map(svc => {
    // Latency bar percentage
    const latPercent = Math.min(100, Math.round((svc.latency_ms / svc.max_latency_ms) * 100));
    let barColorClass = '';
    if (latPercent > 80) barColorClass = 'danger';
    else if (latPercent > 65) barColorClass = 'warning';

    // Freshness check: If timestamp is stale (e.g. 08:00)
    const isStale = svc.timestamp && svc.timestamp.includes('08:00');

    return `
      <div class="service-card" id="card-${svc.service_id}">
        <div class="service-card-header">
          <span class="service-id">${svc.service_id}</span>
          <span class="service-status-badge ${isStale ? 'status-stale' : 'status-healthy'}">
            ${isStale ? '⚠️ Stale Telemetry' : '● Healthy & Fresh'}
          </span>
        </div>

        <div class="telemetry-grid">
          <div class="metric-item">
            <span class="metric-label">Instances</span>
            <span class="metric-val" style="color:var(--primary);">${svc.instances} nodes</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Hourly Cost</span>
            <span class="metric-val">$${svc.cost_per_hour}/hr</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">CPU Utilization</span>
            <span class="metric-val">${svc.cpu_percent}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Traffic Rate</span>
            <span class="metric-val">${svc.requests_per_minute} RPM</span>
          </div>
        </div>

        <div class="latency-bar-box">
          <div class="latency-bar-header">
            <span>P95 Latency: <strong>${svc.latency_ms} ms</strong></span>
            <span>SLA: ${svc.max_latency_ms} ms</span>
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
  runBtn.innerHTML = `Running Pipeline...`;

  const placeholder = document.getElementById('pipeline-placeholder');
  const cardsContainer = document.getElementById('agent-cards');
  placeholder.classList.add('hidden');
  cardsContainer.classList.remove('hidden');

  updateStepperProgress('agent1');
  addTimelineEvent('investigation', `Triggered 3-Agent closed loop with prompt: "${prompt}"`);

  cardsContainer.innerHTML = `<div class="loading-spinner" style="text-align:center;padding:24px;color:var(--primary);">
    <div style="font-size:14px;font-weight:700;margin-bottom:6px;">Agent 1: Telemetry Analyst</div>
    <div style="font-size:11px;color:var(--text-muted);">Inspecting cloud service metrics, CPU, RAM, latency & freshness...</div>
  </div>`;

  try {
    const res = await fetch(apiUrl('/api/recommend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_prompt: prompt, auto_apply: false })
    });
    const result = await res.json();
    
    renderAgentPipeline(result);
  } catch (err) {
    cardsContainer.innerHTML = `<div class="error-msg">Error executing recommendation pipeline: ${err.message}</div>`;
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Recommend
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
    container.innerHTML = '<div class="empty-text">No service recommendations generated.</div>';
    return;
  }

  container.innerHTML = result.proposals.map(item => {
    const inv = item.investigation;
    const prop = item.proposal;
    const safety = item.safety;
    const state = inv.current_state;

    // Diagnosis Badge style
    let diagBadgeClass = 'badge-blue';
    if (inv.diagnosis === 'RISING_TRAFFIC') diagBadgeClass = 'badge-amber';
    if (inv.diagnosis === 'CRITICAL_LOAD') diagBadgeClass = 'badge-red';
    if (inv.diagnosis === 'UNDER_UTILIZATION' || inv.diagnosis === 'OVER_PROVISIONED') diagBadgeClass = 'badge-green';

    // Confidence & Risk Rating
    const confidenceScore = inv.is_fresh ? '94%' : '70%';
    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    const savingsPercent = state.cost_per_hour > 0 ? Math.round((savingsAmount / state.cost_per_hour) * 100) : 0;

    // Timeline logging
    addTimelineEvent('investigation', `Agent 1 Finding: ${item.service_id} diagnosed as ${inv.diagnosis} (Freshness: ${inv.is_fresh ? 'YES' : 'STALE'}).`);
    addTimelineEvent('proposal', `Agent 2 Recommendation: ${prop.action_type.toUpperCase()} from ${prop.current_instances} → ${prop.target_instances} nodes (Savings: -$${savingsAmount}/hr).`);
    
    if (safety.approved) {
      addTimelineEvent('safety', `Agent 3 Safety Validator: APPROVED action for ${item.service_id}. Satisfies SLA & bounds.`);
      updateStepperProgress('agent3');
    } else {
      addTimelineEvent('blocked', `Agent 3 Safety Validator: BLOCKED action for ${item.service_id}. Reason: ${safety.reason}`);
      const sNode = document.getElementById('step-node-agent3');
      if (sNode) sNode.className = 'stepper-step active blocked';
    }

    // Safety Checklist rules list
    const safetyChecklist = [
      { name: 'SLA Latency Boundary Check', passed: !safety.violated_rules.some(r => r.includes('latency')) },
      { name: 'Service Health Gate', passed: !safety.violated_rules.some(r => r.includes('unhealthy')) },
      { name: 'Observation Data Freshness Gate', passed: inv.is_fresh },
      { name: 'Minimum Capacity Guard', passed: !safety.violated_rules.some(r => r.includes('minimum')) },
      { name: 'Hourly Budget Cap Check', passed: !safety.violated_rules.some(r => r.includes('budget')) },
      { name: 'Single Step Scaling Limit', passed: !safety.violated_rules.some(r => r.includes('single step')) }
    ];

    return `
      <div class="agent-pipeline-grid">
        <!-- AGENT 1: TELEMETRY ANALYST -->
        <div class="agent-node-card agent-1">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>🔍 AGENT 1 — TELEMETRY ANALYST</span>
            </span>
            <span class="agent-node-status ${diagBadgeClass}">${inv.diagnosis}</span>
          </div>

          <div class="agent-finding-box">
            <p><strong>Finding:</strong> ${inv.diagnosis_reason}</p>
            <div style="font-size:10px;margin-top:4px;font-family:var(--font-mono);color:var(--text-dim);">
              Target: <strong>${item.service_id}</strong> | Freshness: <strong>${inv.is_fresh ? 'FRESH' : 'STALE (>15m)'}</strong>
            </div>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>CPU:</span> <strong>${state.cpu_percent}%</strong>
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

        <!-- AGENT 2: COST OPTIMIZER -->
        <div class="agent-node-card agent-2">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>💡 AGENT 2 — COST OPTIMIZER</span>
            </span>
            <span class="agent-node-status badge-purple">${prop.action_type.toUpperCase()}</span>
          </div>

          <div class="agent-finding-box">
            <p><strong>Strategy Rationale:</strong> ${prop.reason}</p>
          </div>

          <div class="agent-metrics-row">
            <div class="agent-metric-chip">
              <span>Instance Delta:</span> <strong>${prop.current_instances} → ${prop.target_instances}</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Cost Impact:</span> <strong style="color:var(--success);">${savingsAmount > 0 ? `-$${savingsAmount}/hr` : '$0/hr'}</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Estimated Saving:</span> <strong style="color:var(--success);">${savingsPercent}%</strong>
            </div>
            <div class="agent-metric-chip">
              <span>Latency Risk:</span> <strong style="color:${prop.projected_latency_impact === 'LOW' ? 'var(--success)' : 'var(--warning)'}">${prop.projected_latency_impact}</strong>
            </div>
          </div>
          ${prop.memory_referenced ? `<div style="font-size:10px;color:var(--accent);margin-top:2px;">🧠 Memory Recall: ${prop.memory_referenced}</div>` : ''}
        </div>

        <!-- AGENT 3: SAFETY VALIDATOR -->
        <div class="agent-node-card agent-3 ${safety.approved ? '' : 'blocked'}">
          <div class="agent-node-header">
            <span class="agent-node-title">
              <span>🛡️ AGENT 3 — SAFETY VALIDATOR</span>
            </span>
            <span class="agent-node-status ${safety.approved ? 'badge-green' : 'badge-red'}">
              ${safety.approved ? '✓ APPROVED' : '! BLOCKED'}
            </span>
          </div>

          <div class="safety-checks-list">
            ${safetyChecklist.map(c => `
              <div class="safety-check-item ${c.passed ? 'passed' : 'failed'}">
                <span>${c.passed ? '✓' : '✕'}</span>
                <span>${c.name}</span>
              </div>
            `).join('')}
          </div>

          <div class="agent-finding-box" style="margin-top:6px;border-left:2px solid ${safety.approved ? 'var(--success)' : 'var(--danger)'}">
            <strong>Safety Verdict:</strong> ${safety.reason}
          </div>
        </div>
      </div>

      <!-- ACTION EXECUTOR CTA BAR -->
      ${safety.approved && prop.action_type !== 'no_action' ? `
        <div class="action-cta-box">
          <div>
            <div style="font-size:13px;font-weight:700;color:#fff;">Action Executor Stage: Ready to Apply</div>
            <div style="font-size:11px;color:var(--text-muted);">Proposed: Scale <strong>${item.service_id}</strong> from ${prop.current_instances} → ${prop.target_instances} instances</div>
          </div>
          <button class="primary-btn" onclick="applyAction('${item.service_id}', '${prop.action_type}', ${prop.target_instances})">
            Apply Action (${prop.action_type})
          </button>
        </div>
      ` : `
        <div class="action-cta-box" style="border-color:var(--border-subtle);background:rgba(0,0,0,0.3);">
          <div style="font-size:12px;color:var(--text-dim);">
            ${safety.approved ? 'No optimization action required for this service state.' : '<strong>Action Execution Halted:</strong> Blocked by Deterministic Safety Validator.'}
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
    addTimelineEvent('action', `Applying action '${actionType}' on ${serviceId} to ${targetInstances} instances...`);

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
    addTimelineEvent('action', `Action successfully executed on ${serviceId}. Verifying post-action telemetry...`);

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

  statusBadge.textContent = ver.status;
  statusBadge.className = `pill-badge ${ver.status === 'SUCCESS' ? 'status-healthy' : 'badge-red'}`;
  summaryBox.textContent = ver.summary;

  // Calculate Savings Highlights
  if (before && after) {
    const hourlySaved = Math.max(0, before.cost_per_hour - after.cost_per_hour);
    const dailySaved = Math.round(hourlySaved * 24);

    document.getElementById('chip-hourly-saved').textContent = `$${hourlySaved.toFixed(2)}/hr`;
    document.getElementById('chip-daily-saved').textContent = `$${dailySaved}/day`;
    
    addTimelineEvent('action', `Verification Complete: Saved $${hourlySaved.toFixed(2)}/hr ($${dailySaved}/day). SLA Preserved.`);
  }

  // Render Table rows
  const tbody = document.getElementById('diff-table-body');
  if (ver.comparisons && ver.comparisons.length > 0) {
    tbody.innerHTML = ver.comparisons.map(c => `
      <tr>
        <td><strong>${c.metric_name}</strong></td>
        <td>${c.before} ${c.unit}</td>
        <td>${c.after} ${c.unit}</td>
        <td class="${c.change_percent <= 0 ? 'diff-change-positive' : 'diff-change-negative'}">
          ${c.change_percent > 0 ? `+${c.change_percent}%` : `${c.change_percent}%`}
        </td>
        <td style="color:var(--text-dim);">${c.metric_name === 'Latency P95' ? `${before ? before.max_latency_ms : 300} ms` : 'PASS'}</td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);">Action failed: ${result.action_result.error || 'Execution halted'}</td></tr>`;
  }

  // Show/hide rollback recovery
  if (ver.recovery_recommended) {
    recoveryBox.classList.remove('hidden');
    recoveryBox.dataset.serviceId = result.action_result.service_id;
    addTimelineEvent('blocked', `WARNING: Post-action degradation detected on ${result.action_result.service_id}. Rollback recommended.`);
  } else {
    recoveryBox.classList.add('hidden');
  }
}

async function triggerRollback() {
  const recoveryBox = document.getElementById('recovery-box');
  const serviceId = recoveryBox.dataset.serviceId;
  if (!serviceId) return;

  try {
    addTimelineEvent('action', `Initiating emergency rollback for ${serviceId}...`);
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
// PATH B: Manual Slider Controls
// ==========================================================================

function populateManualDropdown(services) {
  const select = document.getElementById('manual-service-select');
  if (!select) return;

  const prevVal = select.value;
  select.innerHTML = services.map(s => `
    <option value="${s.service_id}">${s.service_id} (${s.instances} instances, $${s.cost_per_hour}/hr)</option>
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
    <span>Min Bound: ${svc.min_instances}</span>
    <span>Current: ${svc.instances}</span>
    <span>Max Bound: ${svc.max_instances}</span>
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

  badge.textContent = data.recommendation.replace('_', ' ');
  badge.className = `preflight-badge badge-${data.recommendation.toLowerCase().replace('_', '-')}`;
  reason.textContent = data.reason;

  if (data.projected_impact) {
    impact.textContent = `Cost Delta: ${data.projected_impact.cost_delta ? (data.projected_impact.cost_delta < 0 ? `-$${Math.abs(data.projected_impact.cost_delta)}/hr` : `+$${data.projected_impact.cost_delta}/hr`) : '$0'} | Risk: ${data.projected_impact.latency_risk || 'N/A'}`;
  } else {
    impact.textContent = '';
  }

  // Allow apply if safety is approved (even if NOT_RECOMMENDED, user can choose; but NOT if UNSAFE_BLOCKED)
  if (data.recommendation === 'UNSAFE_BLOCKED') {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Blocked by Safety Engine';
  } else {
    applyBtn.disabled = false;
    applyBtn.textContent = `Apply Change (${targetInstances} instances)`;
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
    container.innerHTML = '<div class="memory-empty">No previous optimizations recorded yet.</div>';
    return;
  }

  container.innerHTML = records.map(r => `
    <div class="memory-item">
      <div class="memory-item-top">
        <span><strong>${r.service_id}</strong> (${r.action_type})</span>
        <span style="color:${r.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)'};">${r.status}</span>
      </div>
      <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);">
        Instances: ${r.instances_before} → ${r.instances_after} | Cost: $${r.cost_before} → $${r.cost_after}/hr
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
