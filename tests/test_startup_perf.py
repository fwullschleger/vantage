"""Tests for startup performance.

The /api/repos endpoint must respond instantly (from cache) to avoid
flashing the wrong UI on the frontend.  These tests ensure the cache
machinery works and that the endpoint returns quickly.
"""

import time

import pytest
from fastapi.testclient import TestClient

from vantage.main import app
from vantage.routers.api import (
    warm_repo_cache,
)

client = TestClient(app)


def test_repos_endpoint_responds_quickly():
    """GET /api/repos must return in <100ms (single-repo mode)."""
    t0 = time.monotonic()
    response = client.get("/api/repos")
    elapsed_ms = (time.monotonic() - t0) * 1000
    assert response.status_code == 200
    assert elapsed_ms < 100, f"/api/repos took {elapsed_ms:.0f}ms (limit: 100ms)"


def test_repos_returns_valid_structure():
    """GET /api/repos returns a list of RepoInfo objects."""
    response = client.get("/api/repos")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Each entry must have at least a 'name' field
    for repo in data:
        assert "name" in repo


@pytest.mark.asyncio
async def test_warm_repo_cache_completes():
    """warm_repo_cache() should complete without errors."""
    await warm_repo_cache()
    # In single-repo mode cache may be empty (no daemon config),
    # but it should not raise.


def test_health_responds_quickly():
    """GET /api/health must return in <50ms — basic sanity for cold start."""
    t0 = time.monotonic()
    response = client.get("/api/health")
    elapsed_ms = (time.monotonic() - t0) * 1000
    assert response.status_code == 200
    assert elapsed_ms < 50, f"/api/health took {elapsed_ms:.0f}ms (limit: 50ms)"
