import asyncio
import logging
from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from vantage.services.socket_manager import manager
from vantage.version import BUILD_VERSION

logger = logging.getLogger(__name__)

router = APIRouter()


async def _warm_caches() -> None:
    """Proactively warm expensive caches when a client reconnects.

    Runs git status + recent files for each configured repo in a background
    thread so the first real API requests hit warm caches instead of
    triggering 30-70s cold walks.
    """
    try:
        from vantage.services.git_service import GitService
        from vantage.settings import get_daemon_config, settings

        daemon_config = get_daemon_config()
        if daemon_config:
            repos = [(r.name, r.path) for r in daemon_config.repos]
        else:
            repos = [("default", settings.target_repo)]

        loop = asyncio.get_event_loop()
        for name, path in repos:
            try:
                git = GitService(path, exclude_dirs=settings.exclude_dirs)
                # Warm status cache
                await loop.run_in_executor(None, git.get_working_dir_status)
                # Warm recent files cache
                await loop.run_in_executor(
                    None, lambda g=git: g.get_recently_changed_files(limit=20)
                )
                logger.info("Cache warmed for repo %s", name)
            except Exception:
                logger.debug("Cache warming failed for repo %s", name, exc_info=True)
    except Exception:
        logger.debug("Cache warming skipped", exc_info=True)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Only accept WebSocket connections from localhost origins
    origin = websocket.headers.get("origin", "")
    if origin:
        parsed = urlparse(origin)
        if parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            logger.warning("WebSocket rejected: origin %s not allowed", origin)
            await websocket.close(code=1008, reason="Origin not allowed")
            return
    await manager.connect(websocket)
    # Send hello with protocol version so frontend can detect stale code
    logger.info("Sending hello (version=%s)", BUILD_VERSION)
    await websocket.send_json({"type": "hello", "version": BUILD_VERSION})
    # Proactively warm caches so first API calls are fast after idle
    if len(manager.active_connections) == 1:
        # First client connecting — warm caches in background
        asyncio.create_task(_warm_caches())
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect as exc:
        logger.info(
            "WebSocket client disconnected: code=%s reason=%s", exc.code, exc.reason or "(none)"
        )
        manager.disconnect(websocket)
    except Exception:
        logger.exception("WebSocket connection error")
        manager.disconnect(websocket)
