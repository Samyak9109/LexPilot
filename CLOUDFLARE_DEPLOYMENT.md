# Cloudflare Deployment Guide

## Architecture Options

| Component | Recommended Platform | Reason |
|-----------|---------------------|--------|
| **Frontend (React/Vite)** | Cloudflare Pages | Static assets, free tier, edge caching |
| **Express API** | Cloudflare Workers (with caveats) OR Render/Railway | Workers need Node.js compat; MongoDB/multer/bcrypt don't work natively |
| **FastAPI (Python)** | Cloudflare Workers (via Python Workers) OR Render/Railway | Python Workers in beta; limited package support |

## Option A: Hybrid (Recommended for MVP)
- **Frontend** → Cloudflare Pages
- **Express + FastAPI** → Render (existing `render.yaml`) or Railway
- **MongoDB** → MongoDB Atlas (unchanged)

This keeps your working backend unchanged and only moves the static frontend.

## Option B: Full Cloudflare Workers (Requires Backend Rewrite)

### Express → Workers Changes Needed:
1. **MongoDB** → Use Cloudflare D1 (SQLite) or external HTTP API to Atlas
2. **bcrypt** → Use Web Crypto API (`crypto.subtle`)
3. **jsonwebtoken** → Use `jose` npm package (Edge-compatible)
4. **multer** → Use native `FormData` parsing in Workers
5. **axios** → Use native `fetch`
6. **express** → Use `itty-router` or `hono` (Edge-compatible routers)

### FastAPI → Workers Changes Needed:
1. **Python Workers** are in beta (Pyodide-based)
2. **Limited packages**: No `motor`, `pymongo`, `langchain`, `langgraph`
3. Would need to rewrite pipeline in JavaScript/TypeScript or use external API

## Quick Start: Option A (Frontend on Pages)

### 1. Build frontend locally
```bash
cd frontend
npm run build
# Output in frontend/dist/
```

### 2. Deploy to Cloudflare Pages
```bash
# Option 1: Wrangler (CI/CD)
npx wrangler pages deploy frontend/dist --project-name=lexpilot-frontend

# Option 2: Dashboard
# 1. Go to dash.cloudflare.com → Pages → Create project
# 2. Connect GitHub repo
# 3. Build settings:
#    - Build command: npm run build
#    - Build output directory: dist
#    - Root directory: frontend
```

### 3. Update API base URL
In Cloudflare Pages dashboard → Settings → Environment variables:
```
VITE_API_URL = https://your-express-backend.onrender.com
```

### 4. Configure CORS on Express
In `backend-express/index.js`, update `ALLOWED_ORIGINS`:
```bash
# Add to Render environment variables
ALLOWED_ORIGINS=https://lexpilot-frontend.pages.dev,https://your-custom-domain.com
```

## Quick Start: Option B (Workers - Experimental)

### Prerequisites
```bash
npm install -g wrangler
wrangler login
```

### Backend Worker Structure
```
backend-express/
├── worker-entry.js      # Cloudflare Worker entry (hono/itty-router)
├── wrangler.jsonc       # Worker config
├── package.json         # Edge-compatible deps only
└── src/
    ├── routes/
    ├── middleware/
    └── db/              # D1 or HTTP client for Atlas
```

### Deploy
```bash
cd backend-express
npm run build:worker
wrangler deploy
```

## Environment Variables Needed

### Frontend (Pages)
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend.workers.dev` or Render URL |

### Express Backend (Workers or Render)
| Variable | Source |
|----------|--------|
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `INTERNAL_SECRET` | Shared secret (generate) |
| `FASTAPI_URL` | `https://your-fastapi.workers.dev` or Render URL |
| `ALLOWED_ORIGINS` | Comma-separated: `https://lexpilot-frontend.pages.dev,https://your-domain.com` |
| `POSTHOG_API_KEY` | Optional |
| `GEMINI_API_KEY` | For FastAPI |

### FastAPI Backend (Workers or Render)
| Variable | Source |
|----------|--------|
| `GEMINI_API_KEY` | Google AI Studio |
| `MONGODB_URI` | MongoDB Atlas |
| `INTERNAL_SECRET` | Must match Express |

## DNS / Custom Domain
1. Cloudflare Pages → Custom domains → Add your domain
2. Workers → Triggers → Custom domains → Add subdomain (e.g., `api.yourdomain.com`)
3. DNS records managed automatically by Cloudflare

## Current Status
- ✅ Frontend builds to static assets (`npm run build`)
- ✅ `frontend/wrangler.jsonc` configured for Pages
- ⚠️ Backend Workers need rewrite (see Option B)
- ✅ `render.yaml` works for current Render deployment