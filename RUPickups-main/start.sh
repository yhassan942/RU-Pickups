#!/usr/bin/env bash
# RUPickups – start backend + frontend with one command (handles setup from scratch)
# Usage: ./start.sh   (or: bash start.sh)

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ""
    echo "Stopping backend (PID $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ---- Setup (from scratch) ----

# Backend venv
if [[ ! -d "$ROOT/backend/venv" ]]; then
  echo "Creating backend virtual environment..."
  (cd "$ROOT/backend" && python3 -m venv venv)
fi

# Backend dependencies
echo "Ensuring backend dependencies are installed..."
(cd "$ROOT/backend" && source venv/bin/activate && pip install -q -r requirements.txt)

# Backend .env
NEED_ENV=0
if [[ ! -f "$ROOT/backend/.env" ]]; then
  if [[ -f "$ROOT/backend/.env.example" ]]; then
    echo "Creating backend/.env from .env.example."
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  else
    touch "$ROOT/backend/.env"
    echo "Created empty backend/.env."
  fi
  NEED_ENV=1
fi

# Frontend .env
if [[ ! -f "$ROOT/frontend/.env" ]]; then
  if [[ -f "$ROOT/frontend/.env.example" ]]; then
    echo "Creating frontend/.env from .env.example."
    cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
  else
    touch "$ROOT/frontend/.env"
    echo "Created empty frontend/.env."
  fi
  NEED_ENV=1
fi

if [[ "$NEED_ENV" -eq 1 ]]; then
  echo ""
  echo "Edit backend/.env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET)"
  echo "and frontend/.env (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY), then run ./start.sh again."
  exit 1
fi

# Frontend dependencies
HAS_NODE_MODULES=false
HAS_TYPES_JEST=false
if [[ -d "$ROOT/frontend/node_modules" ]]; then
  HAS_NODE_MODULES=true
fi
if (cd "$ROOT/frontend" && npm ls @types/jest --depth=0 >/dev/null 2>&1); then
  HAS_TYPES_JEST=true
fi

if [[ "$HAS_NODE_MODULES" != true || "$HAS_TYPES_JEST" != true ]]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT/frontend" && npm install)
fi

# ---- Run ----

echo "Starting backend (FastAPI) at http://127.0.0.1:8000 ..."
(
  cd "$ROOT/backend"
  source venv/bin/activate
  exec uvicorn app.main:app --reload
) &
BACKEND_PID=$!

# Give backend a moment to bind
sleep 2

echo "Starting frontend (Expo)..."
echo ""
cd "$ROOT/frontend"
npx expo start
