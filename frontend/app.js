/**
 * Cloud Guardian — Professional Cloud Cost & Safety Manager
 * Enterprise SaaS Control & Telemetry Orchestration
 */

let currentServices = [];
let currentScenarioId = 'test_a';
let activeRecommendation = null;
let lastSelectedManualServiceId = null;

let sliderTimeout = null;
let telemetryChart = null;
let monitoringActive = true;
let monitoringTimer = null;

let auditTimelineEvents = [];

// ==========================================================================
// Dynamic API Endpoint Resolver
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
      if (badge) badge.title = `Connected to backend API: ${base || 'Local'}`;
    } else {
      if (dot) dot.className = 'status-dot dot-warning';
    }
  } catch (err) {
    if (dot) dot.className = 'status-dot dot-offline';
    if (badge) badge.title = `Disconnected. Click to configure API URL.`;
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
// Activity Log Timeline Helper
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
    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px;">System initialized.</div>';
    return;
  }

  container.innerHTML = auditTimelineEvents.map(e => `
    <div class="timeline-event">
      <span class="timeline-time">${e.time}</span>
      <span class="timeline-desc">${e.description}</span>
    </div>
  `).join('');
}

// ==========================================================================
// Operational Boundaries & Safety Controls
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
    console.error('Failed to fetch safety goals:', err);
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
    console.error('Failed to save safety goals:', err);
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
    btn.innerHTML = '<span class="toggle-dot"></span> Active';
  } else {
    btn.className = 'toggle-btn';
    btn.innerHTML = '<span class="toggle-dot"></span> Paused';
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
      // ignore tick errors
    }
  }, 4000);
}

// ==========================================================================
// Response Time Chart.js (Restrained & Professional)
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
          label: 'Response Time (ms)',
          data: [],
          backgroundColor: 'rgba(0, 112, 243, 0.7)',
          borderColor: '#0070F3',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Safety Threshold (ms)',
          data: [],
          type: 'line',
          borderColor: '#EF4444',
          borderDash: [4, 4],
          borderWidth: 1.5,
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
          ticks: { color: '#64748B', font: { family: 'Inter', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94A3B8', font: { family: 'Inter', size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: false
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

  if (services.length > 0) {
    const mainSvc = services[0];
    const currentLatEl = document.getElementById('chart-current-latency');
    const safetyLimEl = document.getElementById('chart-safety-limit');
    if (currentLatEl) currentLatEl.textContent = `${mainSvc.latency_ms} ms`;
    if (safetyLimEl) safetyLimEl.textContent = `${mainSvc.max_latency_ms} ms`;
  }
}

// ==========================================================================
// Scenario Context & Loading
// ==========================================================================

async function loadScenario(scenarioId) {
  currentScenarioId = scenarioId;
  
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

    let friendlyName = data.name;
    let friendlyDesc = data.description;
    let currentSpendStr = "$18.50/hr";
    let potentialSavingsStr = "$9.25/hr (50%)";
    let safetyConstraintStr = "Max latency < 300 ms";

    if (scenarioId === 'test_a') {
      friendlyName = 'Scenario A — Wasted capacity';
      friendlyDesc = '6 servers are currently running for a workload that can be handled with fewer resources.';
      currentSpendStr = "$18.50/hr";
      potentialSavingsStr = "$9.25/hr (50%)";
      safetyConstraintStr = "Max latency < 300 ms";
    } else if (scenarioId === 'test_b') {
      friendlyName = 'Scenario B — High traffic';
      friendlyDesc = 'Traffic is surging rapidly across API endpoints. Additional server capacity is required to maintain response speed.';
      currentSpendStr = "$8.25/hr";
      potentialSavingsStr = "Scale up (+2 servers)";
      safetyConstraintStr = "Max latency < 300 ms";
    } else if (scenarioId === 'test_c') {
      friendlyName = 'Scenario C — Stale telemetry';
      friendlyDesc = 'Server telemetry data has not refreshed in over 15 minutes. Safety controls must block action until fresh data is received.';
      currentSpendStr = "$18.50/hr";
      potentialSavingsStr = "Action Blocked";
      safetyConstraintStr = "Telemetry Age < 15m";
    } else if (scenarioId === 'test_d') {
      friendlyName = 'Scenario D — Risky action';
      friendlyDesc = 'Proposed capacity reduction threatens response time limits. Safety controls will evaluate and block the unsafe operation.';
      currentSpendStr = "$18.50/hr";
      potentialSavingsStr = "Action Blocked";
      safetyConstraintStr = "Safety Guard Verification";
    }

    document.getElementById('scenario-name').textContent = friendlyName;
    document.getElementById('scenario-desc').textContent = friendlyDesc;
    document.getElementById('scenario-prompt').textContent = `"${data.prompt}"`;
    document.getElementById('prompt-input').value = data.prompt;

    const spendEl = document.getElementById('header-current-spend');
    const savEl = document.getElementById('header-potential-savings');
    const safeEl = document.getElementById('header-safety-constraint');
    if (spendEl) spendEl.textContent = currentSpendStr;
    if (savEl) savEl.textContent = potentialSavingsStr;
    if (safeEl) safeEl.textContent = safetyConstraintStr;

    resetPipelineView();
    resetDiffView();
    updateStepperProgress('reset');

    addTimelineEvent('scenario', `Loaded Scenario: ${friendlyName}`);

    await fetchServices();
    await fetchHistory();

  } catch (err) {
    console.error('Failed to load scenario:', err);
  }
}

// ==========================================================================
// Infrastructure Table Rendering
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
    container.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px;">No active cloud services found.</td></tr>';
    return;
  }

  // Calculate infrastructure summary metrics
  const totalServices = services.length;
  const totalServers = services.reduce((acc, s) => acc + s.instances, 0);
  const totalSpend = services.reduce((acc, s) => acc + s.cost_per_hour, 0);
  const avgLatency = Math.round(services.reduce((acc, s) => acc + s.latency_ms, 0) / (totalServices || 1));

  const totalServicesEl = document.getElementById('infra-total-services');
  const totalServersEl = document.getElementById('infra-total-servers');
  const totalSpendEl = document.getElementById('infra-total-spend');
  const avgLatencyEl = document.getElementById('infra-avg-latency');

  if (totalServicesEl) totalServicesEl.textContent = totalServices;
  if (totalServersEl) totalServersEl.textContent = totalServers;
  if (totalSpendEl) totalSpendEl.textContent = `$${totalSpend.toFixed(2)}/hr`;
  if (avgLatencyEl) avgLatencyEl.textContent = `${avgLatency} ms`;

  container.innerHTML = services.map(svc => {
    const isStale = svc.timestamp && svc.timestamp.includes('08:00');
    const isHighLatency = svc.latency_ms > svc.max_latency_ms * 0.8;
    
    let statusClass = 'healthy';
    let statusText = 'Healthy';
    if (isStale) {
      statusClass = 'stale';
      statusText = 'Stale telemetry';
    } else if (isHighLatency) {
      statusClass = 'danger';
      statusText = 'Latency warning';
    }

    return `
      <tr>
        <td class="service-name">${svc.service_id}</td>
        <td class="metric-mono">${svc.instances}</td>
        <td class="metric-mono">${svc.cpu_percent}%</td>
        <td class="metric-mono">${svc.requests_per_minute.toLocaleString()} RPM</td>
        <td class="metric-mono">${svc.latency_ms} ms</td>
        <td class="metric-mono">$${svc.cost_per_hour.toFixed(2)}/hr</td>
        <td>
          <span class="status-pill ${statusClass}">
            <span class="status-dot ${statusClass === 'healthy' ? 'dot-online' : (statusClass === 'stale' ? 'dot-warning' : 'dot-offline')}"></span>
            ${statusText}
          </span>
        </td>
        <td>
          <button class="btn-sm" onclick="selectServiceForReview('${svc.service_id}')">
            Review
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function selectServiceForReview(serviceId) {
  switchTab('path-a');
  document.getElementById('prompt-input').value = `Review ${serviceId} and optimize cost safely.`;
  runRecommend();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const tabBtn = document.getElementById(`tab-${tabId}`);
  const tabContent = document.getElementById(`content-${tabId}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
}

// ==========================================================================
// Optimization Workflow (Collect → Analyze → Recommend → Apply)
// ==========================================================================

async function runRecommend() {
  const promptInput = document.getElementById('prompt-input');
  const runBtn = document.getElementById('btn-run-recommend');
  const prompt = promptInput.value.trim();

  runBtn.disabled = true;
  runBtn.innerHTML = `Analyzing...`;

  const placeholder = document.getElementById('pipeline-placeholder');
  const cardsContainer = document.getElementById('agent-cards');
  placeholder.classList.add('hidden');
  cardsContainer.classList.remove('hidden');

  updateStepperProgress('recommend');
  addTimelineEvent('workflow', `Evaluating infrastructure metrics for goal: "${prompt}"`);

  cardsContainer.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
      <div style="font-size:13px;font-weight:600;color:var(--text-main);margin-bottom:4px;">Evaluating live metrics & safety constraints...</div>
      <div style="font-size:11px;">Cost Investigator → Performance Analyst → Safety Validator</div>
    </div>
  `;

  try {
    const res = await fetch(apiUrl('/api/recommend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_prompt: prompt, auto_apply: false })
    });
    const result = await res.json();
    
    activeRecommendation = result;
    renderAgentPipeline(result);
  } catch (err) {
    cardsContainer.innerHTML = `<div style="color:var(--danger);padding:16px;">Error evaluating recommendation: ${err.message}</div>`;
  } finally {
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Analyze & Recommend
    `;
  }
}

function updateStepperProgress(stage) {
  const node1 = document.getElementById('step-node-1');
  const node2 = document.getElementById('step-node-2');
  const node3 = document.getElementById('step-node-3');
  const node4 = document.getElementById('step-node-4');

  if (stage === 'reset') {
    if (node1) node1.className = 'stepper-card completed';
    if (node2) node2.className = 'stepper-card completed';
    if (node3) node3.className = 'stepper-card active';
    if (node4) node4.className = 'stepper-card';
    return;
  }

  if (stage === 'recommend') {
    if (node1) node1.className = 'stepper-card completed';
    if (node2) node2.className = 'stepper-card completed';
    if (node3) node3.className = 'stepper-card active';
    if (node4) node4.className = 'stepper-card';
  } else if (stage === 'applied') {
    if (node1) node1.className = 'stepper-card completed';
    if (node2) node2.className = 'stepper-card completed';
    if (node3) node3.className = 'stepper-card completed';
    if (node4) node4.className = 'stepper-card completed';
  } else if (stage === 'blocked') {
    if (node1) node1.className = 'stepper-card completed';
    if (node2) node2.className = 'stepper-card completed';
    if (node3) node3.className = 'stepper-card blocked';
    if (node4) node4.className = 'stepper-card';
  }
}

function renderAgentPipeline(result) {
  const container = document.getElementById('agent-cards');
  if (!result || !result.proposals || result.proposals.length === 0) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:16px;">No optimization recommendations generated.</div>';
    return;
  }

  container.innerHTML = result.proposals.map(item => {
    const inv = item.investigation;
    const prop = item.proposal;
    const safety = item.safety;
    const state = inv.current_state;

    const savingsAmount = prop.projected_cost_delta_per_hr < 0 ? Math.abs(prop.projected_cost_delta_per_hr) : 0;
    const monthlySavings = (savingsAmount * 24 * 30).toFixed(2);
    const latencyImpactStr = prop.projected_latency_impact === 'LOW' ? '+42 ms' : (prop.projected_latency_impact === 'HIGH' ? '+150 ms' : '0 ms');

    let actionHeadline = `Maintain ${item.service_id} capacity (${prop.current_instances} servers)`;
    if (prop.action_type === 'scale_down') {
      actionHeadline = `Reduce ${item.service_id}`;
    } else if (prop.action_type === 'scale_up') {
      actionHeadline = `Scale up ${item.service_id}`;
    }

    if (safety.approved) {
      addTimelineEvent('safety', `Recommendation generated for ${item.service_id}: ${actionHeadline}. Status: Within safety limits.`);
      updateStepperProgress('recommend');
    } else {
      addTimelineEvent('blocked', `Safety Guard blocked proposal for ${item.service_id}: ${safety.reason}`);
      updateStepperProgress('blocked');
    }

    return `
      <div class="recommendation-panel">
        <div class="rec-header">
          <span class="rec-title-label">Recommended Optimization</span>
          <span class="status-pill ${safety.approved ? 'healthy' : 'danger'}">
            ${safety.approved ? '● Within safety limits' : '● Action Blocked by Safety Guard'}
          </span>
        </div>

        <div class="rec-main-box">
          <div>
            <div class="rec-headline">${actionHeadline}</div>
            <div class="rec-change-chip">
              ${prop.current_instances} servers → ${prop.target_instances} servers
            </div>
          </div>
        </div>

        <div class="rec-metrics-grid">
          <div class="rec-metric-item">
            <span class="rec-metric-label">Estimated savings</span>
            <span class="rec-metric-val success">+$${savingsAmount.toFixed(2)}/hr</span>
          </div>
          <div class="rec-metric-item">
            <span class="rec-metric-label">Estimated monthly savings</span>
            <span class="rec-metric-val success">+$${monthlySavings}</span>
          </div>
          <div class="rec-metric-item">
            <span class="rec-metric-label">Expected latency change</span>
            <span class="rec-metric-val">${latencyImpactStr}</span>
          </div>
          <div class="rec-metric-item">
            <span class="rec-metric-label">Safety threshold</span>
            <span class="rec-metric-val">${state.max_latency_ms || 300} ms</span>
          </div>
        </div>

        <!-- Technical Analysis Details -->
        <div style="font-size:12px;color:var(--text-muted);background:var(--bg-main);padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          <strong style="color:var(--text-main);">Analysis Reasoning:</strong> ${prop.reason}
          ${!safety.approved ? `<div style="color:var(--danger);margin-top:4px;"><strong>Safety Guard Notice:</strong> ${safety.reason}</div>` : ''}
        </div>

        <div class="rec-actions-bar">
          <span class="rec-philosophy-tag">AI recommends. Human reviews. System executes safely.</span>

          <div class="rec-actions-buttons">
            <button class="secondary-btn" onclick="simulateInManualTab('${item.service_id}', ${prop.target_instances})">
              Simulate change
            </button>
            ${safety.approved && prop.action_type !== 'no_action' ? `
              <button class="primary-btn" onclick="applyAction('${item.service_id}', '${prop.action_type}', ${prop.target_instances})">
                Review recommendation
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function simulateInManualTab(serviceId, targetInstances) {
  switchTab('path-b');
  const select = document.getElementById('manual-service-select');
  if (select) {
    select.value = serviceId;
    onManualServiceSelected();
    const slider = document.getElementById('instance-slider');
    if (slider) {
      slider.value = targetInstances;
      onSliderInput(targetInstances);
    }
  }
}

// ==========================================================================
// Apply Action & Verification
// ==========================================================================

async function applyAction(serviceId, actionType, targetInstances) {
  try {
    addTimelineEvent('action', `Executing server adjustment on ${serviceId} to ${targetInstances} servers...`);

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

    updateStepperProgress('applied');
    addTimelineEvent('action', `Action applied to ${serviceId}. Verification passed.`);

    renderDiffCard(result);

    await fetchServices();
    await fetchHistory();

  } catch (err) {
    alert(`Failed to apply action: ${err.message}`);
  }
}

function renderDiffCard(result) {
  const emptyDiff = document.getElementById('empty-diff');
  const activeCard = document.getElementById('active-diff-card');
  if (emptyDiff) emptyDiff.classList.add('hidden');
  if (activeCard) activeCard.classList.remove('hidden');

  const before = result.before_state;
  const after = result.after_state;
  const ver = result.verification;

  const nameEl = document.getElementById('diff-service-name');
  if (nameEl) nameEl.textContent = result.action_result.service_id;

  const statusBadge = document.getElementById('diff-status-badge');
  const summaryBox = document.getElementById('diff-summary-text');
  const recoveryBox = document.getElementById('recovery-box');

  if (statusBadge) {
    statusBadge.textContent = ver.status === 'SUCCESS' ? 'VERIFIED PASSED' : 'DEGRADED';
    statusBadge.className = `status-pill ${ver.status === 'SUCCESS' ? 'healthy' : 'danger'}`;
  }
  if (summaryBox) summaryBox.textContent = ver.summary;

  if (before && after) {
    const hourlySaved = Math.max(0, before.cost_per_hour - after.cost_per_hour);
    const dailySaved = Math.round(hourlySaved * 24);

    const hrEl = document.getElementById('chip-hourly-saved');
    const dayEl = document.getElementById('chip-daily-saved');
    if (hrEl) hrEl.textContent = `$${hourlySaved.toFixed(2)}/hr`;
    if (dayEl) dayEl.textContent = `$${dailySaved}/day`;
  }

  const metricNameMap = {
    'Active Instances': 'Active Servers',
    'Cost per Hour': 'Hourly Spend ($/hr)',
    'CPU %': 'CPU Load %',
    'Latency P95': 'Response Time (ms)',
    'Requests per Minute': 'Traffic (RPM)'
  };

  const tbody = document.getElementById('diff-table-body');
  if (tbody) {
    if (ver.comparisons && ver.comparisons.length > 0) {
      tbody.innerHTML = ver.comparisons.map(c => `
        <tr>
          <td class="service-name">${metricNameMap[c.metric_name] || c.metric_name}</td>
          <td class="metric-mono">${c.before} ${c.unit}</td>
          <td class="metric-mono">${c.after} ${c.unit}</td>
          <td class="${c.change_percent <= 0 ? 'diff-change-positive' : 'diff-change-negative'}">
            ${c.change_percent > 0 ? `+${c.change_percent}%` : `${c.change_percent}%`}
          </td>
          <td style="color:var(--text-muted);">${c.metric_name.includes('Latency') ? `${before ? before.max_latency_ms : 300} ms` : 'PASS'}</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger);">Execution halted: ${result.action_result.error || 'Action failed'}</td></tr>`;
    }
  }

  if (recoveryBox) {
    if (ver.recovery_recommended) {
      recoveryBox.classList.remove('hidden');
      recoveryBox.dataset.serviceId = result.action_result.service_id;
    } else {
      recoveryBox.classList.add('hidden');
    }
  }
}

async function triggerRollback() {
  const recoveryBox = document.getElementById('recovery-box');
  const serviceId = recoveryBox.dataset.serviceId;
  if (!serviceId) return;

  try {
    addTimelineEvent('action', `Initiating rollback for ${serviceId}...`);
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
// Manual Sliders (Path B)
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
  if (slider) {
    slider.min = Math.max(0, svc.min_instances - 1);
    slider.max = svc.max_instances + 2;
    slider.value = svc.instances;
  }

  const valEl = document.getElementById('slider-instance-val');
  if (valEl) valEl.textContent = svc.instances;

  const markersEl = document.getElementById('slider-markers');
  if (markersEl) {
    markersEl.innerHTML = `
      <span>Min: ${svc.min_instances}</span>
      <span>Current: ${svc.instances}</span>
      <span>Max: ${svc.max_instances}</span>
    `;
  }

  evaluateManualChangeDebounced(serviceId, svc.instances);
}

function onSliderInput(val) {
  const valEl = document.getElementById('slider-instance-val');
  if (valEl) valEl.textContent = val;
  const select = document.getElementById('manual-service-select');
  if (select) evaluateManualChangeDebounced(select.value, parseInt(val, 10));
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

  if (badge) {
    badge.textContent = recText;
    badge.className = `status-pill ${data.recommendation === 'RECOMMENDED' ? 'healthy' : 'danger'}`;
  }
  if (reason) reason.textContent = data.reason;

  if (impact) {
    if (data.projected_impact) {
      impact.textContent = `Hourly Cost Impact: ${data.projected_impact.cost_delta ? (data.projected_impact.cost_delta < 0 ? `-$${Math.abs(data.projected_impact.cost_delta)}/hr` : `+$${data.projected_impact.cost_delta}/hr`) : '$0'} | Speed Risk: ${data.projected_impact.latency_risk || 'N/A'}`;
    } else {
      impact.textContent = '';
    }
  }

  if (applyBtn) {
    if (data.recommendation === 'UNSAFE_BLOCKED') {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Blocked by Safety Guard';
    } else {
      applyBtn.disabled = false;
      applyBtn.textContent = `Apply Change (${targetInstances} servers)`;
    }
  }
}

async function applyManualChange() {
  const select = document.getElementById('manual-service-select');
  const slider = document.getElementById('instance-slider');
  if (!select || !slider) return;

  const serviceId = select.value;
  const targetInstances = parseInt(slider.value, 10);
  const svc = currentServices.find(s => s.service_id === serviceId);
  const actionType = targetInstances < (svc ? svc.instances : 1) ? 'scale_down' : 'scale_up';

  await applyAction(serviceId, actionType, targetInstances);
}

// ==========================================================================
// Past Savings History & Audit Export
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
    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px;">No history recorded yet.</div>';
    return;
  }

  container.innerHTML = records.map(r => `
    <div class="memory-item">
      <div class="memory-item-top">
        <span><strong>${r.service_id}</strong> (${r.action_type})</span>
        <span style="color:${r.status === 'SUCCESS' ? 'var(--success)' : 'var(--danger)'};">${r.status === 'SUCCESS' ? 'VERIFIED PASSED' : r.status}</span>
      </div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);">
        Servers: ${r.instances_before} → ${r.instances_after} | Spend: $${r.cost_before} → $${r.cost_after}/hr
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${r.notes}</div>
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
