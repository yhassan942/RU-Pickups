# RUPickups

RU Pickups is a mobile app + FastAPI backend for organizing and joining pickup games at Rutgers, backed by Supabase.

This root `README` explains how to set up the entire project (backend + frontend) on a Mac and get it running locally.

---

## 0. Prerequisites

Install if you don't already have:
- Git
- Python 3.11+
- Node.js 18+ and npm

---

## 1. Clone the repository

```bash
git clone git@github.com:jsoncruzsipiran/RUPickups.git
cd RUPickups
```

---

## 2. One-command setup & run (recommended)

The easiest way to get everything running is to use the provided `start.sh` script from the project root:

```bash
chmod +x start.sh        # only needed once
./start.sh
```

What `./start.sh` does:

- **Backend**
  - Creates a Python virtual environment in `backend/venv` (if it does not exist).
  - Installs backend dependencies from `backend/requirements.txt`.
  - Ensures `backend/.env` exists (copies from `.env.example` if present, otherwise creates an empty file).
- **Frontend (Expo app)**
  - Ensures `frontend/.env` exists (copies from `.env.example` if present, otherwise creates an empty file).
  - Installs frontend dependencies in `frontend/node_modules` (if missing) via `npm install`.
- **Run**
  - Starts the FastAPI backend with Uvicorn at `http://127.0.0.1:8000`.
  - Starts the Expo dev server in the `frontend/` directory.

### Important: first-run environment variables

On first run, if `.env` files are missing, the script will:

- Create `backend/.env` and `frontend/.env`.
- Print a message telling you to edit them and then **exit**.

You must then:

1. Open `backend/.env` and fill in your Supabase values:
  ```env
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_JWT_SECRET=your_jwt_secret
  ```
2. Open `frontend/.env` and fill in the Expo/Supabase values, for example:
  ```env
   EXPO_PUBLIC_SUPABASE_URL=your_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
  ```
3. Re-run:
  ```bash
   ./start.sh
  ```

Once everything is configured correctly, the backend and frontend will start automatically.

Important note to teachers/TA : Please check the database instructions section to find what to put in the env files.

---

## 3. Running backend and frontend manually (optional)

If you prefer not to use `start.sh`, you can manage each part yourself.

### Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
```

Run the server:

```bash
uvicorn app.main:app --reload
```

Verify it is working:

- Health check: `http://127.0.0.1:8000/health`
- DB check: `http://127.0.0.1:8000/health/db`

### Frontend (Expo)

```bash
cd frontend
npm install
```

Create `frontend/.env` (if not already created by `start.sh`):

```env
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Start the Expo dev server:

```bash
npx expo start
```

Then connect using:

- The web (localhost:8081)
- iOS simulator (TBD)
- Android emulator (Pixel 6 via Android Studio, see below)
- A physical device via Expo Go (TBD)

---

## 4. Running it as an Android Application: run on Pixel 6 emulator (Android Studio)

On macOS, the easiest way to run the app on Android is with the Android Studio emulator:

1. **Install / open Android Studio**
   - Download Android Studio from the official site if you don’t already have it.
   - Launch Android Studio (any project is fine).
2. **Create a Pixel 6 virtual device**
   - In Android Studio, open **Tools → Device Manager**.
   - Click **“Create device…”**, choose **Pixel 6**, and click **Next**.
   - Download a recent system image (e.g. Android 14/15, ARM64), then click **Next → Finish**.
3. **Start the emulator**
   - In Device Manager, click the **▶** (Run) icon next to the Pixel 6 AVD.
   - Wait until the emulator is fully booted.
4. **Run the app**
   - From the project root, run the setup script if you haven’t yet:
     ```bash
     ./start.sh
     ```
   - On first run, `start.sh` will create `backend/.env` and `frontend/.env` and prompt you to fill in:
     - Supabase keys (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, etc.).
     - Optionally, per‑platform API URLs in `frontend/.env`:
       - `EXPO_PUBLIC_API_BASE_URL_WEB=http://localhost:8000`
       - `EXPO_PUBLIC_API_BASE_URL_ANDROID=http://10.0.2.2:8000`
   - After editing the env files, run:
     ```bash
     ./start.sh
     ```
   - When the Expo dev server is running and the Pixel 6 emulator is open, press **`a`** in the Expo terminal (or run `npx expo start --android`) to launch the app on the emulator.

---

## 5. Useful references

- **Backend docs**: see `backend/README.md` for more detailed backend setup and architecture.
- **Frontend docs**: see `frontend/README.md` for Expo-specific workflows.

Once both backend and frontend are running, you can develop features under `backend/app` and `frontend/app` as usual.

---

## 6. Running Tests and Coverage

Run tests from the project root. Backend and frontend tests are run separately.

### Backend tests (pytest + coverage gate)

From the repository root:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pytest
```

- Suite-specific coverage is generated as `backend/coverage-unit.xml` (unit) and `backend/coverage-integration.xml` (integration).
- Unit and integration suites use separate 70% coverage gates (per-suite).
- CI/PR checks enforce both gates.
- Backend `pytest` now prints coverage by default on every run.
- Use these commands when preparing your rubric test package:
  - unit suite (gated): `pytest tests/unit -q --cov-reset --cov=app.core.auth --cov-report=term-missing --cov-report=xml:coverage-unit.xml --cov-fail-under=70`
  - integration suite (gated): `pytest tests/integration -q --cov-reset --cov=app.api.routes.health_route --cov=app.api.routes.lobby_route --cov=app.api.routes.matches_route --cov-report=term-missing --cov-report=xml:coverage-integration.xml --cov-fail-under=70`
  - optional full-suite sanity run: `pytest`
- Targeted runs are supported, for example: `pytest tests/unit/test_auth.py -q`.

### Frontend tests (Jest + coverage gate)

From the repository root:

```bash
cd frontend
npm install
npm run test
```

Run frontend coverage:

```bash
cd frontend
npm run coverage
```

Optional targeted frontend runs:

```bash
cd frontend
npm test -- login.test.tsx
npm test -- layout-auth-routing.test.tsx
```

- Coverage output is generated under `frontend/coverage/`.
- The frontend suite enforces a global 70% minimum for statements/lines/functions.

### SDS use-case traceability for integration tests
#### Mapped use cases and expected results

- **Use case 3: Finding and joining a lobby**
  - File: `backend/tests/integration/test_lobby_routes.py`
  - Expected results verified by tests:
    - Join private lobby without unlock token returns `403` and an unlock-required message.
    - Join full lobby returns `409` with `"Lobby is full"`.
    - Unlocking private lobby with valid password returns `200` and `{"unlock_token": ...}`.

- **Use case 4: Ending a match**
  - File: `backend/tests/integration/test_matches_routes.py`
  - Expected results verified by tests:
    - Completing a missing/invalid match maps to `400` with `"Match not found."`.
    - Successful match creation path returns `201` with `"status": "scheduled"`.
    - Missing active match lookup returns `404` with `"No active match found"`.

### Latest automated results

- Every push and pull request runs both suites in GitHub Actions via `.github/workflows/tests.yml`.
- CI logs are the source of truth for latest pass/fail state.
- Coverage artifacts are uploaded on each run for backend (`coverage-unit.xml` and `coverage-integration.xml`) and frontend (`coverage/`).

---

## 7. Use of Artificial Intelligence

Artificial Intelligence has been used in the development of this application so far. We are at an early stage in the app and have thus used AI to make it easier to visualize the UI. A lot of our actual work comes with setting up the infrastructure, creating API calls, and connecting to the database on both the backend and frontend. However, smaller things like adjusting the margins or color of a box and more things that make it look "better" have been completed more efficiently with AI.
