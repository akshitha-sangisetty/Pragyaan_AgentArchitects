const fs = require('fs');
let css = fs.readFileSync('styles.css', 'utf8');

// Replace root variables
css = css.replace(/:root\s*\{[\s\S]*?\}/, `:root {
  --bg-main: #FAF9FF;
  --bg-surface: #FFFFFF;
  --bg-card: #FFFFFF;
  --bg-card-hover: #F5F3FF;
  
  --border-subtle: rgba(139, 92, 246, 0.15);
  --border-active: rgba(139, 92, 246, 0.6);
  
  --primary: #8B5CF6;
  --primary-glow: rgba(139, 92, 246, 0.25);
  --accent: #6D28D9;
  --accent-glow: rgba(109, 40, 217, 0.2);
  
  --success: #16A34A;
  --success-bg: rgba(22, 163, 74, 0.12);
  --warning: #F59E0B;
  --warning-bg: rgba(245, 158, 11, 0.12);
  --danger: #DC2626;
  --danger-bg: rgba(220, 38, 38, 0.14);
  
  --text-main: #1F1B2D;
  --text-muted: #6B6475;
  --text-dim: #8B8594;
  
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}`);

// Backgrounds that are black/dark
css = css.replace(/background:\s*rgba\(0,\s*0,\s*0,\s*[0-9.]+\)/g, 'background: var(--bg-surface)');
css = css.replace(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.[0-9]+\)/g, 'background: var(--bg-card-hover)');
css = css.replace(/color:\s*#fff/gi, 'color: var(--text-main)');
css = css.replace(/color:\s*#ffffff/gi, 'color: var(--text-main)');
css = css.replace(/color:\s*#000/g, 'color: #fff');

// Specifics
css = css.replace(/background:\s*transparent;/g, 'background: transparent;');
css = css.replace(/border-color:\s*rgba\(255,\s*255,\s*255,\s*0.05\)/g, 'border-color: var(--border-subtle)');
css = css.replace(/background-image:\s*radial-gradient.*?;/s, 'background-image: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(109, 40, 217, 0.05) 0%, transparent 50%);');

let additions = [
  "/* Agent Logs Section */",
  ".agent-logs-container { display: flex; flex-direction: column; gap: 16px; }",
  ".agent-overview-cards { display: flex; gap: 16px; margin-bottom: 16px; }",
  ".overview-card { flex: 1; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(139, 92, 246, 0.05); }",
  ".overview-card-value { font-size: 24px; font-weight: 800; color: var(--primary); }",
  ".overview-card-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }",
  ".agent-log-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-left: 4px solid var(--primary); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.05); }",
  ".agent-log-card.success { border-left-color: var(--success); }",
  ".agent-log-card.error { border-left-color: var(--danger); }",
  ".agent-log-header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg-card-hover); border-bottom: 1px solid var(--border-subtle); cursor: pointer; }",
  ".agent-log-title { font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; }",
  ".agent-log-meta { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted); }",
  ".agent-log-body { padding: 16px; font-family: var(--font-mono); font-size: 12px; display: none; }",
  ".agent-log-card.expanded .agent-log-body { display: block; }",
  ".log-entry { display: flex; gap: 12px; margin-bottom: 6px; }",
  ".log-time { color: var(--text-dim); width: 70px; flex-shrink: 0; }",
  ".log-message { color: var(--text-main); }",
  ".log-output-box { margin-top: 12px; padding: 12px; background: #F8F7FA; border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--accent); white-space: pre-wrap; font-family: var(--font-mono); }"
].join('\\n');

fs.writeFileSync('styles.css', css + '\\n' + additions);
console.log('styles.css updated');
