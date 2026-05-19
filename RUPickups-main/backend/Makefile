PYTEST := pytest

.PHONY: test test-unit test-integration test-lobby-routes

test:
	$(PYTEST)

test-unit:
	$(PYTEST) tests/unit -q --cov-reset --cov=app.core.auth --cov-report=term-missing --cov-report=xml:coverage-unit.xml --cov-fail-under=70

test-integration:
	$(PYTEST) tests/integration -q --cov-reset --cov=app.api.routes.health_route --cov=app.api.routes.lobby_route --cov=app.api.routes.matches_route --cov-report=term-missing --cov-report=xml:coverage-integration.xml --cov-fail-under=70

test-lobby-routes:
	$(PYTEST) tests/integration/test_lobby_routes.py -q
