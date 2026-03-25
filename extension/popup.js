// popup.js

const BACKEND_BASE = "https://127.0.0.1:8000";

function drawGauge(canvas, percentage) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h - 10;
  const radius = 90;

  ctx.clearRect(0, 0, w, h);

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, 0);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.stroke();

  // Fill
  const fraction = Math.min(percentage, 100) / 100;
  let color;
  if (percentage < 33) color = "#22c55e";
  else if (percentage < 66) color = "#f59e0b";
  else color = "#ef4444";

  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, Math.PI + fraction * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.stroke();

  // Needle
  const angle = Math.PI + fraction * Math.PI;
  const nLen = radius - 16;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * nLen, cy + Math.sin(angle) * nLen);
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();

}

function probClass(p) {
  if (p >= 0.75) return "high";
  if (p >= 0.5) return "mid";
  return "low";
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const canvas = document.getElementById("gauge");
  const pctLabel = document.getElementById("percentage-label");
  const statusLabel = document.getElementById("status-label");
  const domainEl = document.getElementById("domain");
  const scanBtn = document.getElementById("scan-btn");
  const breakdown = document.getElementById("breakdown");
  const sentenceList = document.getElementById("sentence-list");
  const container = document.querySelector(".container");

  // Enhanced mode elements
  const enhancedToggle = document.getElementById("enhanced-toggle");
  const apiKeyMsg = document.getElementById("api-key-msg");
  const aiSummary = document.getElementById("ai-summary");
  const aiSummaryText = document.getElementById("ai-summary-text");

  let apiKeyAvailable = false;

  try {
    domainEl.textContent = new URL(tab.url).hostname;
  } catch {}

  // Check API key availability
  try {
    const resp = await fetch(`${BACKEND_BASE}/api-key-status`);
    const data = await resp.json();
    apiKeyAvailable = data.available;
  } catch {}

  if (apiKeyAvailable) {
    enhancedToggle.disabled = false;
    apiKeyMsg.classList.add("hidden");
  } else {
    enhancedToggle.disabled = true;
    enhancedToggle.checked = false;
    apiKeyMsg.textContent = "AI API key is not present, please input key into .env!";
    apiKeyMsg.classList.remove("hidden");
  }

  // Toggle hue-shift on switch change & persist state
  enhancedToggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: "SET_ENHANCED_TOGGLE", tabId: tab.id, enabled: enhancedToggle.checked });
    if (enhancedToggle.checked) {
      container.classList.add("enhanced");
    } else {
      container.classList.remove("enhanced");
      aiSummary.classList.add("hidden");
      aiSummary.classList.remove("analyzing");
    }
  });

  // Load existing state for this tab
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id });

  if (state && state.status === "done") {
    drawGauge(canvas, state.percentage);
    pctLabel.textContent = `${state.percentage}%`;
    statusLabel.textContent = "Scan complete";
    renderBreakdown(state.results, breakdown, sentenceList);

    // Restore toggle state
    if (state.enhancedToggle) {
      enhancedToggle.checked = true;
      container.classList.add("enhanced");
    }

    // Restore or poll enhanced results
    if (state.enhancedStatus === "done" && state.summary) {
      aiSummaryText.textContent = state.summary;
      aiSummary.classList.remove("hidden");
      aiSummary.classList.remove("analyzing");
      if (state.enhancedResults) {
        renderBreakdown(state.enhancedResults, breakdown, sentenceList);
      }
    } else if (state.enhancedStatus === "scanning") {
      // Enhanced scan still running in background — poll for it
      aiSummaryText.textContent = "Analyzing…";
      aiSummary.classList.remove("hidden");
      aiSummary.classList.add("analyzing");
      pollEnhanced(tab.id, aiSummary, aiSummaryText, breakdown, sentenceList);
    } else if (state.enhancedStatus === "error") {
      aiSummaryText.textContent = `Enhanced analysis failed: ${state.enhancedError}`;
      aiSummary.classList.remove("hidden");
      aiSummary.classList.remove("analyzing");
    }
  } else {
    drawGauge(canvas, 0);
    pctLabel.textContent = "—%";
  }

  scanBtn.addEventListener("click", async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning…";
    statusLabel.textContent = "Scanning…";
    breakdown.classList.add("hidden");
    aiSummary.classList.add("hidden");
    aiSummary.classList.remove("analyzing");

    await chrome.runtime.sendMessage({ type: "TRIGGER_SCAN", tabId: tab.id });

    // Poll for result
    const poll = setInterval(async () => {
      try {
        const s = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id });
        if (s && s.status === "done") {
          clearInterval(poll);
          drawGauge(canvas, s.percentage);
          pctLabel.textContent = `${s.percentage}%`;
          statusLabel.textContent = "Scan complete";
          scanBtn.disabled = false;
          scanBtn.textContent = "Scan again";
          renderBreakdown(s.results, breakdown, sentenceList);

          // If enhanced toggle is ON, fire the second opinion via background
          if (enhancedToggle.checked && apiKeyAvailable) {
            aiSummaryText.textContent = "Analyzing…";
            aiSummary.classList.remove("hidden");
            aiSummary.classList.add("analyzing");
            chrome.runtime.sendMessage({
              type: "TRIGGER_ENHANCED",
              tabId: tab.id,
              sentences: s.results.map(r => r.text),
              percentage: s.percentage
            });
            pollEnhanced(tab.id, aiSummary, aiSummaryText, breakdown, sentenceList);
          }
        }
      } catch (err) {
        console.warn("[AI Detector] Poll error:", err);
      }
    }, 500);
  });
}

function pollEnhanced(tabId, aiSummary, aiSummaryText, breakdown, sentenceList) {
  const poll = setInterval(async () => {
    try {
      const s = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId });
      if (s && s.enhancedStatus === "done") {
        clearInterval(poll);
        aiSummaryText.textContent = s.summary;
        aiSummary.classList.remove("analyzing");
        if (s.enhancedResults && s.enhancedResults.length > 0) {
          renderBreakdown(s.enhancedResults, breakdown, sentenceList);
        }
      } else if (s && s.enhancedStatus === "error") {
        clearInterval(poll);
        aiSummaryText.textContent = `Enhanced analysis failed: ${s.enhancedError}`;
        aiSummary.classList.remove("analyzing");
      }
    } catch (err) {
      console.warn("[AI Detector] Enhanced poll error:", err);
    }
  }, 500);
}

function renderBreakdown(results, breakdown, list) {
  if (!results || results.length === 0) return;
  const aiOnly = results.filter(r => r.is_ai);
  if (aiOnly.length === 0) return;

  list.innerHTML = "";
  aiOnly.slice(0, 20).forEach(r => {
    const item = document.createElement("div");
    item.className = "sentence-item";
    const cls = probClass(r.ai_probability);
    item.innerHTML = `
      <span class="prob ${cls}">AI ${Math.round(r.ai_probability * 100)}%</span>
      <p>${r.text.slice(0, 120)}${r.text.length > 120 ? "…" : ""}</p>
    `;
    list.appendChild(item);
  });

  breakdown.classList.remove("hidden");
}

init();