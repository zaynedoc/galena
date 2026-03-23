# Galena — AI Text Detector

A Chrome extension that detects AI-generated text on any webpage. Highlights flagged sentences in yellow and shows an overall confidence score via a speedometer gauge, all while running locally on your machine!

## How It Works

1. A **Python backend** (FastAPI) runs a RoBERTa-based classifier on `https://127.0.0.1:8000`
2. The **Chrome extension** extracts visible text, sends it to the local backend, and highlights AI-flagged sentences
3. A **speedometer icon** updates in real-time showing the page's overall AI percentage

No data leaves your machine. The model weights are cached locally after first download.

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Google Chrome | 114+ |
| Git | Any |

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Generate SSL Certificate (one-time)

The extension requires HTTPS. Generate a self-signed cert:

```bash
cd backend
mkdir certs

# Windows (use Git's openssl)
& "C:\Program Files\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"

# macOS / Linux
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
```

Then open `https://127.0.0.1:8000/health` in Chrome and click **Advanced → Proceed** to trust the cert (one-time step).

### 3. Start the Server

```bash
cd backend
.\venv\Scripts\Activate.ps1   # or source venv/bin/activate

uvicorn main:app --host 127.0.0.1 --port 8000 --ssl-keyfile certs/key.pem --ssl-certfile certs/cert.pem
```

First launch downloads the model (~500 MB). Subsequent starts are instant.

### 4. Load the Extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin the extension in the toolbar

### 5. Use It

- Navigate to any text-heavy webpage
- Click the extension icon → **Scan this page**
- Yellow highlights appear on AI-flagged sentences
- The popup shows a speedometer gauge and sentence breakdown

## Configuration

Edit `backend/.env` (copy from `.env.example` if missing):

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_THRESHOLD` | `0.75` | Sentences scoring ≥ this are flagged as AI. Lower = more aggressive. |
| `TRANSFORMERS_OFFLINE` | `0` | Set to `1` after first download to prevent network calls. |

Restart the server after changing `.env`.

## Project Structure

```
galena/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── detector.py           # Model loading & inference
│   ├── requirements.txt
│   ├── .env.example
│   └── certs/                # SSL certs (git-ignored)
└── extension/
    ├── manifest.json         # Chrome MV3 manifest
    ├── background.js         # Service worker + icon rendering
    ├── content.js            # Text extraction + highlighting
    ├── popup.html/css/js     # Popup UI
    └── icons/                # Static fallback icons
```

## Model

Default: [`Hello-SimpleAI/chatgpt-detector-roberta`](https://huggingface.co/Hello-SimpleAI/chatgpt-detector-roberta) — a RoBERTa-base model fine-tuned on ChatGPT vs. human text (~500 MB).

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.