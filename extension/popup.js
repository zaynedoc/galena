// popup.js

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

  // Tick labels
  ctx.fillStyle = "#64748b";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("0%",   cx - radius + 4,  cy - 4);
  ctx.fillText("50%",  cx,               cy - radius - 6);
  ctx.fillText("100%", cx + radius - 10, cy - 4);
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

  try {
    domainEl.textContent = new URL(tab.url).hostname;
  } catch {}

  // Load existing state for this tab
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id });

  if (state && state.status === "done") {
    drawGauge(canvas, state.percentage);
    pctLabel.textContent = `${state.percentage}%`;
    statusLabel.textContent = "Scan complete";
    renderBreakdown(state.results, breakdown, sentenceList);
  } else {
    drawGauge(canvas, 0);
    pctLabel.textContent = "—%";
  }

  scanBtn.addEventListener("click", async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning…";
    statusLabel.textContent = "Scanning…";
    breakdown.classList.add("hidden");

    await chrome.runtime.sendMessage({ type: "TRIGGER_SCAN", tabId: tab.id });

    // Poll for result
    const poll = setInterval(async () => {
      const s = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id });
      if (s && s.status === "done") {
        clearInterval(poll);
        drawGauge(canvas, s.percentage);
        pctLabel.textContent = `${s.percentage}%`;
        statusLabel.textContent = "Scan complete";
        scanBtn.disabled = false;
        scanBtn.textContent = "Scan again";
        renderBreakdown(s.results, breakdown, sentenceList);
      }
    }, 500);
  });
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
