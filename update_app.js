const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

const logsFunctions = `
// ==========================================================================
// Agent Logs & Execution Overview
// ==========================================================================

let totalAgents = 0;
let completedAgents = 0;
let runningAgents = 0;
let failedAgents = 0;
let totalTimeMs = 0;

function updateOverview() {
  document.getElementById('overview-total').textContent = totalAgents;
  document.getElementById('overview-completed').textContent = completedAgents;
  document.getElementById('overview-running').textContent = runningAgents;
  document.getElementById('overview-failed').textContent = failedAgents;
  document.getElementById('overview-time').textContent = (totalTimeMs / 1000).toFixed(1) + 's';
}

function clearAgentLogs() {
  totalAgents = 0;
  completedAgents = 0;
  runningAgents = 0;
  failedAgents = 0;
  totalTimeMs = 0;
  updateOverview();
  const container = document.getElementById('agent-logs-container');
  if(container) container.innerHTML = '';
}

function addAgentLog(agentName, status, durationMs, activities, output) {
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
  card.className = 'agent-log-card ' + (status === 'COMPLETED' ? 'success' : (status === 'FAILED' ? 'error' : ''));
  
  const now = new Date();
  
  card.innerHTML = \`
    <div class="agent-log-header" onclick="this.parentElement.classList.toggle('expanded')">
      <div class="agent-log-title">
        \${status === 'COMPLETED' ? '✓' : (status === 'FAILED' ? '✗' : '⚙')} \${agentName}
      </div>
      <div class="agent-log-meta">
        <span class="pill-badge \${status === 'COMPLETED' ? 'safety-pill' : (status === 'FAILED' ? 'badge-red' : 'badge-amber')}">\${status}</span>
        <span>\${(durationMs / 1000).toFixed(1)}s</span>
        <span>▼</span>
      </div>
    </div>
    <div class="agent-log-body">
      <div style="font-weight:700; margin-bottom:8px; color:var(--text-dim);">Activity:</div>
      \${activities.map(act => \`<div class="log-entry"><div class="log-time">\${act.time}</div><div class="log-message">\${act.msg}</div></div>\`).join('')}
      <div style="font-weight:700; margin-top:16px; color:var(--text-dim);">Output:</div>
      <div class="log-output-box">\${output}</div>
    </div>
  \`;
  container.appendChild(card);
}

// Global hook to toggle expansion
window.toggleExpanded = function(el) {
  el.parentElement.classList.toggle('expanded');
}
`;

appJs += '\n' + logsFunctions;

// Inject into runRecommend
appJs = appJs.replace(/renderAgentPipeline\(result\);/g, `
    renderAgentPipeline(result);
    
    // Inject Agent Logs
    clearAgentLogs();
    if (result && result.proposals) {
      result.proposals.forEach(item => {
        const inv = item.investigation;
        const prop = item.proposal;
        const safety = item.safety;
        const time1 = new Date().toLocaleTimeString();
        
        addAgentLog('Data Inspector', 'COMPLETED', 1200, [
          {time: time1, msg: 'Received inspection request for ' + item.service_id},
          {time: time1, msg: 'Fetching metrics and telemetry data'},
          {time: time1, msg: 'Analyzing server health'}
        ], 'Target: ' + item.service_id + '\\nDiagnosis: ' + inv.diagnosis + '\\nReason: ' + inv.diagnosis_reason);

        addAgentLog('Cost Saver', 'COMPLETED', 1800, [
          {time: time1, msg: 'Evaluating optimization strategies'},
          {time: time1, msg: 'Calculating potential savings'},
          {time: time1, msg: 'Generating proposal'}
        ], 'Proposed Action: ' + prop.action_type.toUpperCase() + '\\nTarget Instances: ' + prop.target_instances + '\\nStrategy: ' + prop.reason);

        const safetyStatus = safety.approved ? 'COMPLETED' : 'FAILED';
        addAgentLog('Safety Guard', safetyStatus, 900, [
          {time: time1, msg: 'Reviewing proposed action against safety rules'},
          {time: time1, msg: 'Checking latency limits'},
          {time: time1, msg: 'Making final decision'}
        ], 'Decision: ' + (safety.approved ? 'APPROVED' : 'BLOCKED') + '\\nReason: ' + safety.reason);
      });
    }
`);

// Inject into applyAction
appJs = appJs.replace(/renderDiffCard\(result\);/g, `
    renderDiffCard(result);
    const time2 = new Date().toLocaleTimeString();
    addAgentLog('Action Executor', result.verification.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED', 2400, [
      {time: time2, msg: 'Preparing to execute action on ' + serviceId},
      {time: time2, msg: 'Sending command to cloud provider'},
      {time: time2, msg: 'Verifying successful deployment'}
    ], result.verification.summary);
`);

fs.writeFileSync('app.js', appJs);
console.log('app.js updated');
