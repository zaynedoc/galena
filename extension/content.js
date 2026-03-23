// content.js
// Injected into every webpage
// Extracts text, calls backend, highlights AI sentences

const BACKEND_URL = "https://127.0.0.1:8000/detect";
const HIGHLIGHT_CLASS = "ai-detector-highlight";
const HIGHLIGHT_STYLE = `
  .${HIGHLIGHT_CLASS} {
    background-color: rgba(250, 204, 21, 0.45) !important;
    border-bottom: 2px solid rgba(234, 179, 8, 0.8) !important;
    border-radius: 2px;
    cursor: help;
    transition: background-color 0.2s ease;
  }
  .${HIGHLIGHT_CLASS}:hover {
    background-color: rgba(250, 204, 21, 0.7) !important;
  }
  .${HIGHLIGHT_CLASS}::after {
    content: attr(data-ai-prob);
    position: absolute;
    bottom: 100%;
    left: 0;
    background: #1a1a2e;
    color: #fff;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .${HIGHLIGHT_CLASS}:hover::after {
    opacity: 1;
  }
`;

// Text extraction

function extractSentences() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip invisible, script, style, and form elements
        const tag = parent.tagName.toLowerCase();
        if (["script", "style", "noscript", "textarea", "input", "code", "pre"].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.offsetParent === null && parent.tagName !== "BODY") {
          return NodeFilter.FILTER_REJECT;
        }

        const text = node.textContent.trim();
        return text.length > 20 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  return textNodes;
}

function splitIntoSentences(text) {
  // Simple sentence splitter — splits on . ! ? followed by space or end
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

// Highlighting

function injectStyles() {
  if (document.getElementById("ai-detector-styles")) return;
  const style = document.createElement("style");
  style.id = "ai-detector-styles";
  style.textContent = HIGHLIGHT_STYLE;
  document.head.appendChild(style);
}

function removeHighlights() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
}

function highlightSentence(textNode, sentence, probability) {
  const nodeText = textNode.textContent;
  const index = nodeText.indexOf(sentence);
  if (index === -1) return;

  const before = nodeText.slice(0, index);
  const after = nodeText.slice(index + sentence.length);

  const mark = document.createElement("mark");
  mark.className = HIGHLIGHT_CLASS;
  mark.textContent = sentence;
  mark.style.position = "relative";
  mark.dataset.aiProb = `AI: ${Math.round(probability * 100)}%`;
  mark.title = `AI probability: ${Math.round(probability * 100)}%`;

  const parent = textNode.parentNode;
  parent.insertBefore(document.createTextNode(before), textNode);
  parent.insertBefore(mark, textNode);
  parent.insertBefore(document.createTextNode(after), textNode);
  parent.removeChild(textNode);
}

// Main scan

async function runScan() {
  injectStyles();
  removeHighlights();

  const textNodes = extractSentences();

  // Build a flat list of { node, sentence } pairs
  const pairs = [];
  for (const node of textNodes) {
    const sentences = splitIntoSentences(node.textContent);
    for (const sentence of sentences) {
      pairs.push({ node, sentence });
    }
  }

  if (pairs.length === 0) {
    chrome.runtime.sendMessage({
      type: "SCAN_COMPLETE",
      percentage: 0,
      results: []
    });
    return;
  }

  let response;
  try {
    response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences: pairs.map(p => p.sentence) })
    });
  } catch (err) {
    console.error("[AI Detector] Could not reach backend:", err);
    return;
  }

  if (!response.ok) {
    console.error("[AI Detector] Backend error:", response.status);
    return;
  }

  const data = await response.json();

  // Apply highlights: iterate results and match back to nodes
  data.results.forEach((result, i) => {
    if (result.is_ai && pairs[i]) {
      highlightSentence(pairs[i].node, pairs[i].sentence, result.ai_probability);
    }
  });

  chrome.runtime.sendMessage({
    type: "SCAN_COMPLETE",
    percentage: data.overall_ai_percentage,
    results: data.results
  });
}

// Message listener

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "RUN_SCAN") {
    runScan();
  }
});