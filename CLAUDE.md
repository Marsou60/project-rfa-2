# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RFA Excel Import - Application for importing Excel data and displaying RFA (Remise de Fin d'Année / Year-End Rebate) figures per client (Code Union). A monorepo with a Python FastAPI backend and React/Vite/Tauri frontend.

## Commands

### Backend (from `backend/` directory)

```bash
# Activate virtual environment
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --port 8000

# Run tests
pytest app/tests/
pytest app/tests/test_tier_engine.py  # Single test file
```

### Frontend (from `frontend/` directory)

```bash
# Install dependencies
npm install

# Development server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Tauri desktop app
npm run tauri:dev      # Development
npm run tauri:build    # Production build
```

## Architecture

### Tech Stack
- **Backend**: Python 3.11+, FastAPI, SQLModel, pandas, xhtml2pdf
- **Frontend**: React 18, Vite, Tailwind CSS, Axios
- **Desktop**: Tauri 2.9 (Rust)
- **Database**: SQLite (local) / PostgreSQL via Supabase (production)

### Project Structure

```
backend/
├── app/
│   ├── main.py          # FastAPI app entry point
│   ├── api.py           # All API routes
│   ├── models.py        # SQLModel database models
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── database.py      # DB config (SQLite/PostgreSQL auto-detection)
│   ├── storage.py       # In-memory import data storage
│   ├── core/            # Business logic (normalization, rules)
│   └── services/        # Feature services (RFA calc, PDF export, etc.)
├── contracts/           # JSON contract templates

frontend/
├── src/
│   ├── App.jsx          # Main router with role-based routing
│   ├── api/             # Axios client with token interceptors
│   ├── pages/           # Feature pages (Admin, Commercial, Client views)
│   ├── components/      # Reusable UI components
│   └── context/         # AuthContext, SupplierFilterContext
└── src-tauri/           # Tauri/Rust desktop configuration
```

### Key Patterns

**Database Dual-Mode**: Automatically uses SQLite locally or PostgreSQL when `DATABASE_URL` env var is set (production/Supabase).

**Authentication Flow**: Login returns JWT → stored in localStorage → Axios interceptor injects token → 401 triggers logout.

**Role-Based Access**:
- `ADMIN`: Full access
- `COMMERCIAL`: Client-space, genie, pure-data pages
- `ADHERENT`: Own client/group dashboard only (filtered by `linked_code_union`)

**Data Import Flow**: Excel/Google Sheets → backend normalizes headers (case/accent insensitive) → stores in-memory (`ImportData`) → frontend fetches via `/api/imports/{id}/entities`.

**Contract System**: Contracts define tier-based RFA rates per supplier (ACR, DCA, EXADIS, ALLIANCE). Assignments link contracts to clients/groups with priority. Overrides allow per-client customization.

### Key Services

- `tier_engine.py`: Applies tier-based pricing rules based on CA thresholds
- `contract_resolver.py`: Finds applicable contract for an entity
- `rfa_calculator.py`: Calculates RFA totals (Global + Tri-party)
- `pdf_export.py`: Generates client reports via HTML templates + xhtml2pdf
- `sheets_loader.py`: Loads data from Google Sheets API

### API Base URLs
- Development: `http://localhost:8000`
- Production: Railway deployment (set via `VITE_API_URL`)

### Deployment
- **Frontend**: Vercel (auto-deploy from main)
- **Backend**: Railway (Docker)
- **Desktop**: Tauri builds via GitHub releases with auto-update

## Environment Variables

### Backend
- `DATABASE_URL`: PostgreSQL connection string (Supabase)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google service account JSON
- `RFA_SHEETS_ID`: Google Sheets spreadsheet ID
- Supabase keys for image storage

### Frontend
- `VITE_API_URL`: Backend API URL
