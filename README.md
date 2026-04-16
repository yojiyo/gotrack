# GoTrack - Setup Guide (New PC)

GoTrack is an HR system with:
- FastAPI backend (`main.py`)
- Electron desktop frontend (`main.js`)
- SQLite database (`gotrack.db`)

This guide is for running the project on another machine from scratch.

---

## Prerequisites

Install:
- Node.js 20.x or 22.x LTS
- Python 3.12+

Recommended checks:

```bash
node -v
npm -v
python --version
```

---

## 1) Clone / Copy Project

Open terminal in the project root (where `package.json`, `main.py`, and `requirements.txt` exist).

---

## 2) Configure Environment Variables

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Set these values in `.env`:

| Variable | Description |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `SENDER_EMAIL` | Gmail sender account |
| `SENDER_PASSWORD` | Gmail App Password |
| `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth account ID |
| `ZOOM_CLIENT_ID` | Zoom client ID |
| `ZOOM_CLIENT_SECRET` | Zoom client secret |
| `BASE_URL` | App base URL (default: `http://127.0.0.1:8000`) |

---

## 3) Backend Setup (FastAPI)

Create and activate a virtual environment:

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Run backend:

```bash
uvicorn main:app --reload
```

Backend runs at:
- [http://127.0.0.1:8000](http://127.0.0.1:8000)

Keep this terminal open.

---

## 4) Frontend Setup (Electron)

Open a **new terminal** in the same project root.

Install Node dependencies:

```bash
npm install --include=dev
```

Start Electron app:

```bash
npm start
```

If you get:
`'electron' is not recognized...`

run:

```bash
npm install --include=dev
npx electron .
```

---

## 5) Default Login

| Role | Email | Password |
| --- | --- | --- |
| HR Manager | `admin@gocloud.com` | `admin` |
| Employee | `employee@gocloud.com` | `employee` |

Change default credentials after first login.

---

## 6) Common Issues

### 404 on profile pages or new routes
Restart backend after pulling code changes:

```bash
uvicorn main:app --reload
```

### Electron starts but UI cannot load backend data
Make sure FastAPI is running first on port `8000`.

### Fresh install and broken Node modules
Windows PowerShell:

```powershell
rmdir /s /q node_modules
del package-lock.json
npm install --include=dev
```

---

## Tech Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: Electron + Vanilla JS/HTML/CSS
- Integrations: Cloudinary, Gmail SMTP, Zoom API