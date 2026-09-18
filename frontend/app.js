/**
 * Autonomous Cloud Cost Optimization Engine — Frontend Logic
 * Supports:
 * - Scenario Switching (Test A, B, C, D)
 * - Path A: Autonomous 3-Agent Closed Loop (Investigator -> Optimizer -> Safety -> Apply -> Verifier)
 * - Path B: Manual What-If Slider with Instant Safety Pre-Flight Check
 * - Before vs After Verification Diff Card & Rollback Trigger
 * - Step 9: Historical Optimization Memory Log
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

document.addEventListener('DOMContentLoaded', () => {
  initTelemetryChart();
  fetchGoals();
  loadScenario('test_a');
  fetchHistory();
  setInterval(updateClock, 1000);
  startMonitoringLoop();
});

function updateClock() {
  const clockEl = document.getElementById('system-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toISOString().substring(11, 19) + ' UTC';
  }
}

// ==========================================================================
// Step 1: Goals & Operational Boundaries
// ==========================================================================

async function fetchGoals() {
  try {
    const res = await fetch('/api/goals');
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
    await fetch('/api/goals', {
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
      const res = await fetch('/api/telemetry/tick', { method: 'POST' });
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
    const res = await fetch('/api/scenario/load', {
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
    const res = await fetch('/api/services');
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

    // Freshness check: If timestamp is not 10:30, flag as stale
    const isStale = svc.timestamp && svc.timestamp.includes('08:00');

    return `
      <div class="service-card" id="card-${svc.service_id}">
        <div class="service-card-header">
          <span class="service-id">${svc.service_id}</span>
          <span class="service-status-badge ${isStale ? 'status-stale' : 'status-healthy'}">
            ${isStale ? '⚠️ Stale (08:00)' : '● Healthy & Fresh'}
          </span>
        </div>

        <div class="telemetry-grid">
          <div class="metric-item">
            <span class="metric-label">Instances</span>
            <span class="metric-val">${svc.instances} <span style="font-size:10px;color:var(--text-dim);">(${svc.min_instances}-${svc.max_instances})</span></span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Hourly Cost</span>
            <span class="metric-val" style="color:var(--primary);">$${svc.cost_per_hour.toFixed(2)}/hr</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">CPU Load</span>
            <span class="metric-val">${svc.cpu_percent}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Memory</span>
            <span class="metric-val">${svc.memory_percent}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Traffic Rate</span>
            <span class="metric-val">${svc.requests_per_minute} RPM</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Error Rate</span>
            <span class="metric-val" style="color:${(svc.error_rate_percent || 0.1) > 1.0 ? 'var(--danger)' : 'var(--text-main)'}">${svc.error_rate_percent !== undefined ? svc.error_rate_percent : 0.1}%</span>
          </div>
        </div>

        <div class="latency-bar-box">
          <div class="latency-bar-header">
            <span>Latency SLA</span>
            <span style="font-family:var(--font-mono);">${svc.latency_ms} ms / ${svc.max_latency_ms} ms</span>
          </div>
          <div class="latency-bar-track">
            <div class="latency-bar-fill ${barColorClass}" style="width: ${latPercent}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// Tab Switching
// ==========================================================================

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`content-${tabId}`).classList.add('active');

  if (tabId === 'path-b') {
    onManualServiceSelected();
  }
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
  cardsContainer.innerHTML = `<div class="loading-spinner" style="text-align:center;padding:24px;color:var(--primary);">Agent 1 (Investigator) inspecting telemetry & freshness...</div>`;

  try {
    const res = await fetch('/api/recommend', {
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

function renderAgentPipeline(result) {
  const container = document.getElementById('agent-cards');
  if (!result || !result.proposals || result.proposals.length === 0) {
    container.innerHTML = '<div class="empty-text">No actions recommended.</div>';
    return;
  }

  container.innerHTML = result.proposals.map(item => {
    const inv = item.investigation;
    const prop = item.proposal;
    const safety = item.safety;

    // Diagnosis Badge style
    let diagBadgeClass = 'badge-blue';
    if (inv.diagnosis === 'RISING_TRAFFIC') diagBadgeClass = 'badge-amber';
    if (inv.diagnosis === 'CRITICAL_LOAD') diagBadgeClass = 'badge-red';
    if (inv.diagnosis === 'UNDER_UTILIZATION') diagBadgeClass = 'badge-green';

    return `
      <div class="agent-step-card" style="margin-bottom: 12px;">
        <!-- STEP 1: AGENT 1 (Investigator) -->
        <div class="agent-step-header">
          <span class="agent-step-name">
            <span>🕵️ Agent 1: Investigator</span>
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--primary);">${item.service_id}</span>
          </span>
          <span class="agent-badge ${diagBadgeClass}">${inv.diagnosis}</span>
        </div>
        <div class="agent-step-body">
          <p>${inv.diagnosis_reason}</p>
          <div style="font-size:11px;margin-top:4px;font-family:var(--font-mono);color:var(--text-dim);">
            Observation Fresh: <strong>${inv.is_fresh ? 'YES' : 'NO (Stale)'}</strong> | 
            Age: ${inv.age_minutes}m ${inv.fresh_traffic_pulled ? `| Pulled Live: ${inv.fresh_traffic_pulled} RPM` : ''}
          </div>
        </div>

        <!-- STEP 2: AGENT 2 (Optimizer) -->
        <div style="border-top: 1px dashed var(--border-subtle); margin: 10px 0; padding-top: 10px;">
          <div class="agent-step-header">
            <span class="agent-step-name">
              <span>🧠 Agent 2: Optimizer</span>
            </span>
            <span class="agent-badge badge-purple">${prop.action_type.toUpperCase()}</span>
          </div>
          <div class="agent-step-body">
            <p><strong>Recommendation:</strong> ${prop.reason}</p>
            <div style="display:flex;gap:16px;margin-top:6px;font-family:var(--font-mono);font-size:11px;">
              <span>Target: <strong>${prop.current_instances} → ${prop.target_instances}</strong> nodes</span>
              <span>Projected Cost: <strong style="color:var(--success);">${prop.projected_cost_delta_per_hr < 0 ? `-$${Math.abs(prop.projected_cost_delta_per_hr)}/hr` : '$0/hr'}</strong></span>
              <span>Latency Impact: <strong>${prop.projected_latency_impact}</strong></span>
            </div>
            ${prop.memory_referenced ? `<div style="font-size:10px;color:var(--accent);margin-top:4px;">🧠 Memory Recall: ${prop.memory_referenced}</div>` : ''}
          </div>
        </div>

        <!-- STEP 3: DETERMINISTIC SAFETY ENGINE -->
        <div style="border-top: 1px dashed var(--border-subtle); margin: 10px 0; padding-top: 10px;">
          <div class="agent-step-header">
            <span class="agent-step-name">
              <span>🛡️ Deterministic Safety Gateway</span>
            </span>
            <span class="agent-badge ${safety.approved ? 'badge-green' : 'badge-red'}">
              ${safety.approved ? 'APPROVED' : 'REJECTED / BLOCKED'}
            </span>
          </div>
          <div class="agent-step-body">
            <p>${safety.reason}</p>
          </div>
        </div>

        <!-- ACTION CTA BAR -->
        ${safety.approved && prop.action_type !== 'no_action' ? `
          <div class="action-cta-bar">
            <span style="font-size:12px;font-weight:600;">Ready to apply action to simulated cloud?</span>
            <button class="primary-btn" onclick="applyAction('${item.service_id}', '${prop.action_type}', ${prop.target_instances})">
              Apply ${prop.action_type} to ${prop.target_instances} instances
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ==========================================================================
// APPLY ACTION & VERIFICATION (Agent 3)
// ==========================================================================

async function applyAction(serviceId, actionType, targetInstances) {
  try {
    const res = await fetch('/api/apply-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        action_type: actionType,
        target_instances: targetInstances
      })
    });
    const result = await res.json();

    // Render Before vs After Diff Card
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

  document.getElementById('diff-service-name').textContent = result.action_result.service_id;
  const statusBadge = document.getElementById('diff-status-badge');
  const summaryBox = document.getElementById('diff-summary-text');
  const recoveryBox = document.getElementById('recovery-box');

  const ver = result.verification;
  statusBadge.textContent = ver.status;
  statusBadge.className = `pill-badge ${ver.status === 'SUCCESS' ? 'status-healthy' : 'badge-red'}`;
  summaryBox.textContent = ver.summary;

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
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);">Action failed: ${result.action_result.error || 'Execution halted'}</td></tr>`;
  }

  // Show/hide rollback recovery
  if (ver.recovery_recommended) {
    recoveryBox.classList.remove('hidden');
    recoveryBox.dataset.serviceId = result.action_result.service_id;
  } else {
    recoveryBox.classList.add('hidden');
  }
}

async function triggerRollback() {
  const recoveryBox = document.getElementById('recovery-box');
  const serviceId = recoveryBox.dataset.serviceId;
  if (!serviceId) return;

  try {
    const res = await fetch('/api/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceId })
    });
    const result = await res.json();
    alert(`Rollback executed: ${result.service_id} restored to ${result.restored_instances} instances.`);
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
      const res = await fetch('/api/evaluate-manual', {
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
    const res = await fetch('/api/history');
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
    const res = await fetch('/api/history');
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

