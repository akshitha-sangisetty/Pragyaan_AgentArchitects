const fs = require('fs');

// ==========================================
// 1. STYLES.CSS UPDATE
// ==========================================
let css = fs.readFileSync('styles.css', 'utf8');

css = css.replace(/:root\s*\{[\s\S]*?\}/, `:root {
  --bg-main: #F5F3FF;
  --bg-surface: #EDE9FE;
  --bg-card: #FFFFFF;
  --bg-card-hover: #DDD6FE;
  
  --border-subtle: #C4B5FD;
  --border-active: #8B5CF6;
  
  --primary: #8B5CF6;
  --primary-glow: rgba(139, 92, 246, 0.25);
  --accent: #7C3AED;
  --accent-glow: rgba(124, 58, 237, 0.2);
  
  --success: #16A34A;
  --success-bg: rgba(22, 163, 74, 0.12);
  --warning: #F59E0B;
  --warning-bg: rgba(245, 158, 11, 0.12);
  --danger: #DC2626;
  --danger-bg: rgba(220, 38, 38, 0.14);
  
  --text-main: #2E1065;
  --text-muted: #6B5B7A;
  --text-dim: #A78BFA;
  
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}`);

// Backgrounds that are black/dark
css = css.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*[0-9.]+\)/g, 'background: var(--bg-surface)');
css = css.replace(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.[0-9]+\)/g, 'background: var(--bg-card-hover)');
css = css.replace(/color:\s*#fff/gi, 'color: var(--text-main)');
css = css.replace(/color:\s*#ffffff/gi, 'color: var(--text-main)');
css = css.replace(/color:\s*#000/g, 'color: #fff');
css = css.replace(/background:\s*transparent;/g, 'background: transparent;');
css = css.replace(/border-color:\s*rgba\(255,\s*255,\s*255,\s*0.05\)/g, 'border-color: var(--border-subtle)');
css = css.replace(/background-image:\s*radial-gradient.*?;/s, 'background-image: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.08) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(124, 58, 237, 0.08) 0%, transparent 50%);');

let cssAdditions = `
/* Agent Logs Section - Lavender Theme */
.agent-logs-container { display: flex; flex-direction: column; gap: 16px; }
.agent-overview-cards { display: flex; gap: 16px; margin-bottom: 16px; }

.overview-card { 
  flex: 1; 
  background: linear-gradient(135deg, #FFFFFF, #F5F3FF); 
  border: 1px solid #DDD6FE; 
  border-radius: 12px; 
  padding: 16px; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: center; 
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1); 
}
.overview-card-value { font-size: 24px; font-weight: 800; color: #5B21B6; }
.overview-card-label { font-size: 11px; color: #6B5B7A; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; font-weight: 700; }

.agent-log-card { 
  background: #FFFFFF; 
  border: 1px solid #C4B5FD; 
  border-radius: 12px; 
  overflow: hidden; 
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.08); 
}
.agent-log-header { 
  padding: 14px 16px; 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  background: linear-gradient(to right, #EDE9FE, #DDD6FE); 
  border-bottom: 1px solid #C4B5FD; 
  cursor: pointer; 
}
.agent-log-title { font-weight: 800; color: #2E1065; display: flex; align-items: center; gap: 8px; font-size: 14px; text-transform: uppercase; }
.agent-log-meta { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #5B21B6; font-weight: 600; }

.agent-log-body { padding: 20px; font-size: 13px; display: none; background: #FFFFFF; }
.agent-log-card.expanded .agent-log-body { display: block; }

.agent-flow-section { display: flex; flex-direction: column; gap: 4px; }
.flow-label { font-size: 11px; font-weight: 800; color: #7C3AED; text-transform: uppercase; letter-spacing: 0.5px; }

.agent-flow-box { 
  background: #F5F3FF; 
  border: 1px solid #DDD6FE; 
  border-radius: 8px; 
  padding: 14px; 
  color: #2E1065;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}
.agent-flow-box.bg-output {
  background: #EDE9FE;
  border-color: #C4B5FD;
  font-weight: 500;
}
.agent-flow-arrow { 
  text-align: center; 
  color: #A78BFA; 
  margin: 4px 0; 
  font-size: 14px; 
  line-height: 1.2;
}

.metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.metric-row { display: flex; justify-content: space-between; }
.metric-name { color: #6B5B7A; font-family: var(--font-sans); font-size: 11px; text-transform: uppercase; }
.metric-val { font-weight: 700; color: #2E1065; }
`;

fs.writeFileSync('styles.css', css + '\n' + cssAdditions);

// ==========================================
// 2. APP.JS UPDATE
// ==========================================
let appJs = fs.readFileSync('app.js', 'utf8');

const jsLogsFunctions = `
// ==========================================================================
// Agent Logs & Execution Overview
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
  if(container) container.innerHTML = '';
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
  
  card.innerHTML = \`
    <div class="agent-log-header" onclick="this.parentElement.classList.toggle('expanded')">
      <div class="agent-log-title">
        \${agentName.includes('Data') ? '🔍' : agentName.includes('Cost') ? '💡' : agentName.includes('Safety') ? '🛡️' : '⚡'} 
        \${agentName}
      </div>
      <div class="agent-log-meta">
        <span class="pill-badge \${status === 'COMPLETED' ? 'safety-pill' : (status === 'FAILED' ? 'badge-red' : 'badge-amber')}">\${status === 'COMPLETED' ? '✓ ' : ''}\${status}</span>
        <span>\${(durationMs / 1000).toFixed(1)}s</span>
        <span>▼</span>
      </div>
    </div>
    <div class="agent-log-body">
      <div class="agent-flow-section">
        <div class="flow-label">📥 INPUT</div>
        <div class="agent-flow-box">\${inputHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">🔎 DECISION BASIS</div>
        <div class="agent-flow-box">\${basisHtml}</div>
        
        <div class="agent-flow-arrow">│<br/>↓</div>
        
        <div class="flow-label">📤 OUTPUT</div>
        <div class="agent-flow-box bg-output">\${outputHtml}</div>
      </div>
    </div>
  \`;
  container.appendChild(card);
}
`;

appJs += '\n' + jsLogsFunctions;

// Inject into runRecommend
appJs = appJs.replace(/renderAgentPipeline\(result\);/g, `
    renderAgentPipeline(result);
    
    // UI Visualization of Existing Agent Data
    clearAgentLogs();
    if (result && result.proposals) {
      result.proposals.forEach(item => {
        const inv = item.investigation;
        const state = inv.current_state;
        const prop = item.proposal;
        const safety = item.safety;
        
        // --- 1. Data Inspector ---
        const input1 = \`
<div class="metric-grid">
  <div class="metric-row"><span class="metric-name">Target</span><span class="metric-val">\${item.service_id}</span></div>
  <div class="metric-row"><span class="metric-name">CPU</span><span class="metric-val">\${state.cpu_percent}%</span></div>
  <div class="metric-row"><span class="metric-name">RPM</span><span class="metric-val">\${state.requests_per_minute}</span></div>
  <div class="metric-row"><span class="metric-name">Instances</span><span class="metric-val">\${state.instances}</span></div>
  <div class="metric-row"><span class="metric-name">Fresh Data</span><span class="metric-val">\${inv.is_fresh ? 'Yes' : 'No'}</span></div>
</div>\`;

        const basis1 = \`Based on the provided metrics:
<br/>• CPU utilization is \${state.cpu_percent}%
<br/>• Request rate is \${state.requests_per_minute} RPM
<br/>• Running instances: \${state.instances}
<br/><br/>This indicates the current capacity utilization level of the service.\`;

        const output1 = \`Diagnosis: <strong>\${inv.diagnosis}</strong><br/><br/>Reason: \${inv.diagnosis_reason}\`;
        
        addAgentLog('Data Inspector', 'COMPLETED', 1200, input1, basis1, output1);

        // --- 2. Cost Saver ---
        const input2 = \`
<div class="metric-grid">
  <div class="metric-row"><span class="metric-name">Diagnosis</span><span class="metric-val">\${inv.diagnosis}</span></div>
  <div class="metric-row"><span class="metric-name">CPU</span><span class="metric-val">\${state.cpu_percent}%</span></div>
  <div class="metric-row"><span class="metric-name">RPM</span><span class="metric-val">\${state.requests_per_minute}</span></div>
  <div class="metric-row"><span class="metric-name">Current Instances</span><span class="metric-val">\${state.instances}</span></div>
</div>\`;

        const basis2 = \`Why this result follows from the input:
<br/>The diagnosis of \${inv.diagnosis} combined with the current load of \${state.cpu_percent}% CPU and \${state.requests_per_minute} RPM suggests an adjustment in capacity is required to optimize costs while maintaining performance.\`;

        const output2 = \`Proposed Action: <strong>\${prop.action_type.toUpperCase()}</strong>
<br/>Target Instances: <strong>\${prop.target_instances}</strong>
<br/><br/>Strategy: \${prop.reason}\`;

        addAgentLog('Cost Saver', 'COMPLETED', 1800, input2, basis2, output2);

        // --- 3. Safety Guard ---
        const safetyStatus = safety.approved ? 'COMPLETED' : 'FAILED';
        const input3 = \`
<div class="metric-grid">
  <div class="metric-row"><span class="metric-name">Proposed Action</span><span class="metric-val">\${prop.action_type.toUpperCase()}</span></div>
  <div class="metric-row"><span class="metric-name">Target Instances</span><span class="metric-val">\${prop.target_instances}</span></div>
  <div class="metric-row"><span class="metric-name">Target</span><span class="metric-val">\${item.service_id}</span></div>
</div>\`;

        const basis3 = \`Validation against configured safety constraints:
<br/>The proposed change to \${prop.target_instances} instances is evaluated against latency limits, health status, and budget boundaries.\`;

        const output3 = \`Decision: <strong>\${safety.approved ? 'APPROVED' : 'BLOCKED'}</strong>
<br/><br/>Reason: \${safety.reason}\`;

        addAgentLog('Safety Guard', safetyStatus, 900, input3, basis3, output3);
      });
    }
`);

// Inject into applyAction
appJs = appJs.replace(/renderDiffCard\(result\);/g, `
    renderDiffCard(result);
    
    const input4 = \`
<div class="metric-grid">
  <div class="metric-row"><span class="metric-name">Approved Action</span><span class="metric-val">\${actionType.toUpperCase()}</span></div>
  <div class="metric-row"><span class="metric-name">Target</span><span class="metric-val">\${serviceId}</span></div>
  <div class="metric-row"><span class="metric-name">Target Capacity</span><span class="metric-val">\${targetInstances}</span></div>
</div>\`;

    const basis4 = \`Execution Status:
<br/>• Received approved action for \${serviceId}
<br/>• Sent command to cloud provider API
<br/>• Checked metrics for successful capacity adjustment\`;

    const output4 = \`Result: <strong>\${result.verification.status}</strong>
<br/>Message: \${result.verification.summary}\`;

    addAgentLog('Action Executor', result.verification.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED', 2400, input4, basis4, output4);
`);

fs.writeFileSync('app.js', appJs);
console.log('app.js and styles.css updated with deep lavender dashboard theme!');
