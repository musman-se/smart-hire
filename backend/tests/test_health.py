"""Smoke test for the liveness endpoint.

ASGITransport drives the app in-process — no server, no port, no Docker. This is why
liveness deliberately does not touch the database: the test stays fast and hermetic.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_liveness_returns_ok() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_is_degraded_not_down_without_temporal_or_redis(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Postgres is the only dependency the API cannot work without. Temporal or Redis
    being down is reported, with a 200, so an orchestrator keeps the API in rotation."""
    from app import health

    async def unreachable() -> bool:
        return False

    monkeypatch.setattr(health, "temporal_is_reachable", unreachable)
    monkeypatch.setattr(health, "redis_is_reachable", unreachable)

    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "database": "reachable",
        "temporal": "unreachable",
        "redis": "unreachable",
    }
