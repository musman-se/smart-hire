"""Smoke test for the liveness endpoint.

ASGITransport drives the app in-process — no server, no port, no Docker. This is why
liveness deliberately does not touch the database: the test stays fast and hermetic.
"""

from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_liveness_returns_ok() -> None:
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
