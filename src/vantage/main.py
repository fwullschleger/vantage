import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from vantage.routers import api, socket
from vantage.services.perf import APP_VERSION, GIT_SHA, PerfMiddleware
from vantage.services.watcher import watch_multi_repo, watch_repo
from vantage.settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import time as _time

    t_start = _time.monotonic()
    logger.info("Vantage v%s (git %s) starting up", APP_VERSION, GIT_SHA)

    def _phase(name: str, t0: float) -> float:
        now = _time.monotonic()
        logger.info("[startup] %s done (%.0fms)", name, (now - t0) * 1000)
        return now

    # Warm the repo activity cache BEFORE accepting requests so that
    # the very first /api/repos call returns instantly.
    if settings.multi_repo:
        from vantage.routers.api import warm_repo_cache

        t0 = _time.monotonic()
        await warm_repo_cache()
        t0 = _phase("warm_repo_cache", t0)

    # Start file watcher
    t0 = _time.monotonic()
    if settings.multi_repo:
        watcher_task = asyncio.create_task(watch_multi_repo())
    else:
        watcher_task = asyncio.create_task(watch_repo())
    t0 = _phase("file_watcher", t0)

    # Start background cache refresh (multi-repo only)
    refresh_task = None
    if settings.multi_repo:
        from vantage.routers.api import refresh_repo_cache_loop

        refresh_task = asyncio.create_task(refresh_repo_cache_loop())
        t0 = _phase("refresh_loop", t0)

    logger.info("[startup] ready (total %.0fms)", (_time.monotonic() - t_start) * 1000)
    yield

    # Shutdown
    watcher_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await watcher_task
    if refresh_task:
        refresh_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await refresh_task


app = FastAPI(title="Vantage", lifespan=lifespan)
app.add_middleware(PerfMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(api.router, prefix="/api")
app.include_router(socket.router, prefix="/api")

# Mount frontend static files
# Try multiple locations:
# 1. Bundled in package (for installed package)
# 2. Development location (for dev mode)
frontend_dist = None
possible_paths = [
    # Bundled in package
    os.path.join(os.path.dirname(__file__), "frontend_dist"),
    # Development location
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist"),
]

for path in possible_paths:
    if os.path.isdir(path):
        frontend_dist = path
        break

if frontend_dist:
    app.mount(
        "/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets"
    )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Allow API routes to pass through if they weren't caught above (though they should be by include_router)
        if full_path.startswith("api"):
            return {"error": "Not found"}

        # Serve index.html for SPA routing
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:

    @app.get("/")
    async def root():
        return {
            "message": "Vantage API is running. Frontend not found. Run 'npm run build' in frontend/ directory to serve UI."
        }
