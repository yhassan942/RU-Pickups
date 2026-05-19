# RU Pickups Backend

## Overview

The RU Pickups backend is built using **FastAPI** and communicates with a **Supabase PostgreSQL database**.
The system follows a **layered architecture** that separates responsibilities into routing, business logic, and database access layers.

This architecture improves maintainability and scalability by ensuring each part of the system has a clear role.

The backend is responsible for:

* Handling API requests from the frontend
* Validating user authentication through Supabase
* Executing application logic
* Reading and writing data to the Supabase database

---

# Architecture Overview

The backend is organized into several layers:

```
Client / Frontend
        │
        ▼
API Routes (FastAPI Endpoints)
        │
        ▼
Service Layer (Business Logic)
        │
        ▼
Repository Layer (Database Access)
        │
        ▼
Supabase PostgreSQL Database
```

Each layer is responsible for a specific part of the system.

---

# Project Structure

```
backend/
│
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── router.py
│   │   └── routes/
│   │
│   ├── services/
│   │
│   ├── repositories/
│   │
│   ├── models/
│   │
│   ├── core/
│   │
│   └── db/
│
├── requirements.txt
└── .env
```

---

# Application Entry Point

## `app/main.py`

`main.py` initializes the FastAPI application and configures middleware.

Key responsibilities:

* Create the FastAPI app instance
* Register the API router
* Configure CORS middleware
* Provide a basic health endpoint

---

# API Routing Layer

## `app/api/router.py`

This file aggregates all API route modules and attaches them to the main API router.

Each resource in the system has its own route file.

This keeps routing modular and easier to maintain.

---

# Route Layer

Route files are located in:

```
app/api/routes/
```

Each route file defines **HTTP endpoints** for a specific resource.

Routes handle:

* Request validation
* Authentication dependencies
* Calling the appropriate service functions

Routes should remain lightweight and delegate logic to services.

---

# Service Layer

Services are located in:

```
app/services/
```

The service layer contains the **core business logic** of the application.

Responsibilities include:

* Coordinating data operations
* Applying application rules
* Preparing data for the repository layer

Services act as the **bridge between routes and database operations**.

---

# Repository Layer

Repositories are located in:

```
app/repositories/
```

This layer is responsible for **direct interaction with the database**.

Responsibilities include:

* Running queries against Supabase
* Selecting, inserting, updating, or deleting data
* Returning raw database responses

Repositories isolate database logic from the rest of the system.

---

# Data Models

Models are defined in:

```
app/models/
```

These use **Pydantic** to validate request and response data.

Pydantic ensures that API inputs and outputs follow a strict schema.

---

# Authentication

Authentication is handled using **Supabase Auth**.

Implementation is located in:

```
app/core/auth.py
```

Protected routes require a **Bearer token**.

The token is verified using Supabase:

```python
supabase.auth.get_user(token)
```

If the token is valid, the user ID is extracted and passed into the route.

This ensures that only authenticated users can access certain endpoints.

---

# Database Connection

Database access is handled through Supabase clients.

Location:

```
app/db/
```

Two clients are provided.

### Standard Client

`supabase_client.py`

Used for general database queries.

### Admin Client

`supabase_admin_client.py`

Uses the **service role key** to perform privileged operations such as upserts.

The admin client is used when database operations require elevated permissions.

---

# Environment Variables

The backend requires the following environment variables:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
```

These are loaded through the `.env` file and accessed through the configuration module.

---

# Example Request Flow

Example: Fetch the authenticated user profile.

```
Frontend Request
   │
   ▼
GET /users/me
   │
   ▼
users_route.py
   │
   ▼
users_service.py
   │
   ▼
user_repository.py
   │
   ▼
Supabase PostgreSQL
```

This layered flow ensures separation of concerns and easier debugging.

---

# Running the Backend

### Install dependencies

```
pip install -r requirements.txt
```

### Run the server

```
uvicorn app.main:app --reload
```

The API will run locally at:

```
http://127.0.0.1:8000
```

Interactive documentation is available at:

```
http://127.0.0.1:8000/docs
```

---

# Backend Testing

Install dependencies and run all tests:

```
pip install -r requirements.txt
pytest
```

Run targeted subsets:

```
pytest tests/unit -q
pytest tests/integration -q
pytest tests/integration/test_lobby_routes.py -q
```

Coverage and quality gate:

* Coverage artifacts are generated as `coverage-unit.xml` and `coverage-integration.xml`
* Coverage summary is printed on every `pytest` run by default
* Unit suite gate (70%): `pytest tests/unit -q --cov-reset --cov=app.core.auth --cov-report=term-missing --cov-report=xml:coverage-unit.xml --cov-fail-under=70`
* Integration suite gate (70%): `pytest tests/integration -q --cov-reset --cov=app.api.routes.health_route --cov=app.api.routes.lobby_route --cov=app.api.routes.matches_route --cov-report=term-missing --cov-report=xml:coverage-integration.xml --cov-fail-under=70`
* Optional full-suite sanity run: `pytest`
* CI/PR enforces both suite-specific gates

Current high-value first-pass coverage focuses on:

* auth token validation behavior (`app/core/auth.py`)
* health/db route contract (`app/api/routes/health_route.py`)
* lobby join/unlock route behavior (`app/api/routes/lobby_route.py`)
* match lifecycle route/service behavior (`app/api/routes/matches_route.py`, `app/services/matches_service.py`)
* lobby service boundary checks and leave-lifecycle outcomes (`app/services/lobby_service.py`)

---

# Technology Stack

Backend framework:

* FastAPI

Database:

* Supabase PostgreSQL

Authentication:

* Supabase Auth (JWT)

Validation:

* Pydantic

Server:

* Uvicorn

---

# Design Goals

The backend architecture was designed to:

* Maintain **clear separation of concerns**
* Keep route handlers lightweight
* Centralize business logic in services
* Isolate database queries in repositories
* Support future scalability as more features are added

This structure ensures the backend remains organized as the RU Pickups platform grows.