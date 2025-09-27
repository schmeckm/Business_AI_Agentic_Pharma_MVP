<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pharmaceutical Manufacturing Agent System - Phase 2</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        Pharmaceutical Manufacturing Agent System
        <div class="phase-badge">Phase 2</div>
      </h1>
      <div style="font-size: 14px; opacity: 0.9;">Enterprise AI Operations Platform</div>
    </div>

    <div class="main-content">
      <!-- Input / Commands -->
      <div class="input-section">
        <div class="status" id="status">
          System Status: Initializing...
        </div>

        <label for="message">Manufacturing Command Input</label>
        <textarea id="message" placeholder="Example:
• Assess FG-123 batch 2000 units for EU market release
• Schedule production of FG-456 1500 units
• Execute quality prioritization for material FG-789"></textarea>

        <button id="send" class="primary-button">Execute Manufacturing Command</button>

        <!-- Claude Antwort Box -->
        <div id="claude-response" class="claude-response-box" style="display:none;">
          <strong>AI Response:</strong>
          <div id="claude-text"></div>
        </div>

        <!-- Audit Trail Access -->
        <div class="audit-log-link">
          <strong>Audit Trail:</strong><br>
          <a href="/audit_log.json" target="_blank">📂 Open Full Audit Log</a><br>
          <a href="/audit_log.json" download="audit_log.json">💾 Download Audit Log</a>
        </div>
      </div>

      <!-- Output / Logs -->
      <div class="output-section">
        <div class="output-header">
          <label for="out">System Response & Audit Log</label>
          <button class="clear-button" onclick="clearOutput()">Clear</button>
        </div>
        <pre id="out">System Ready...</pre>
      </div>
    </div>
  </div>
  <script src="js/app.js"></script>
</body>
</html>
