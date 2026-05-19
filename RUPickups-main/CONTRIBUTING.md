# Contributing

## Local quality checks before opening a PR

Run these from repository root:

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pytest
```

### Frontend

```bash
cd frontend
npm install
npm run lint
npm run coverage
```

## Expected CI checks

Pull requests run `.github/workflows/tests.yml` automatically:

- backend tests with coverage gate
- frontend tests with coverage gate
- upload of coverage artifacts for both stacks

If CI fails, reproduce locally with the commands above before requesting review.

## Writing tests in this repo

- Prefer unit tests for pure logic and route-level integration tests for API behavior.
- Mock external dependencies (Supabase/network) to keep tests deterministic.
- Add tests for new behavior and for bug fixes to prevent regressions.
