// background.js
// Manifest V3 service worker
// Manages per-tab state and renders the speedometer badge icon

const tabState = {};  // { [tabId]: { percentage, status } }

// Icon rendering

function drawSpeedometerIcon(percentage) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = 48;

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fill();

  // Arc track (gray)
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 8, Math.PI, Math.PI * 2);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.stroke();

  // Arc fill, color based on percentage
  const fraction = percentage / 100;
  const startAngle = Math.PI;
  const endAngle = Math.PI + fraction * Math.PI;
  let arcColor;
  if (percentage < 33) arcColor = "#22c55e";            // green
  else if (percentage < 66) arcColor = "#f59e0b";       // amber
  else arcColor = "#ef4444";                            // red

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 8, startAngle, endAngle);
  ctx.strokeStyle = arcColor;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.stroke();

  // Needle
  const needleAngle = Math.PI + fraction * Math.PI;
  const needleLength = radius - 14;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + Math.cos(needleAngle) * needleLength,
    cy + Math.sin(needleAngle) * needleLength
  );
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Percentage label
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(percentage)}%`, cx, cy - radius + 28);

  return ctx.getImageData(0, 0, size, size);
}

async function updateIcon(tabId, percentage) {
  const imageData = drawSpeedometerIcon(percentage);
  await chrome.action.setIcon({ tabId, imageData: { 128: imageData } });
}

// Message handling

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === "SCAN_COMPLETE") {
    const { percentage, results } = message;
    tabState[tabId] = { percentage, results, status: "done" };
    updateIcon(tabId, percentage);
    sendResponse({ ok: true });
  }

  if (message.type === "GET_STATE") {
    sendResponse(tabState[message.tabId] || { percentage: 0, results: [], status: "idle" });
  }

  if (message.type === "TRIGGER_SCAN") {
    tabState[message.tabId] = { percentage: 0, results: [], status: "scanning" };
    chrome.tabs.sendMessage(message.tabId, { type: "RUN_SCAN" });
    sendResponse({ ok: true });
  }

  return true;  // keep message channel open for async responses
});

// Clear state when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    delete tabState[tabId];
    updateIcon(tabId, 0);
  }
});