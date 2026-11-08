"""In-memory sliding window rate limiter for protecting sensitive endpoints with bounded storage and trusted proxy handling."""

import logging
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, Response, status

from app.config import settings

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate limiter tracking request timestamps per client key with bounded memory."""

    def __init__(
        self,
        requests_per_minute: int = 10,
        window_seconds: float = 60.0,
        max_tracked_clients: int = 10000,
    ) -> None:
        self.requests_per_minute = requests_per_minute
        self.window_seconds = window_seconds
        self.max_tracked_clients = max_tracked_clients
        self._history: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _get_client_key(self, request: Request) -> str:
        """Extracts client IP safely.

        Only parses X-Forwarded-For if the immediate connecting peer is in settings.trusted_proxies.
        Otherwise uses direct peer IP to prevent header spoofing.
        """
        direct_ip = request.client.host if (request.client and request.client.host) else "unknown"

        # Check if direct peer is a trusted reverse proxy
        trusted = {p.strip() for p in settings.trusted_proxies}
        if direct_ip in trusted:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                # Use leftmost (client) IP in chain
                client_ip = forwarded.split(",")[0].strip()
                if client_ip:
                    return client_ip

        return direct_ip

    def _evict_stale_under_lock(self, now: float, cutoff: float) -> None:
        """Evicts expired keys or the oldest entry when capacity is reached. Must be called while holding _lock."""
        # 1. Clean all expired queues
        expired_keys = [k for k, timestamps in self._history.items() if not timestamps or timestamps[-1] < cutoff]
        for k in expired_keys:
            del self._history[k]

        # 2. If still at or above capacity, evict the entry with the oldest most recent activity
        if len(self._history) >= self.max_tracked_clients:
            oldest_key = min(
                self._history.keys(),
                key=lambda k: self._history[k][-1] if self._history[k] else 0,
            )
            del self._history[oldest_key]

    def check(self, request: Request, response: Response | None = None) -> None:
        """Enforces rate limiting. Raises HTTP 429 if quota is exceeded."""
        client_key = self._get_client_key(request)
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            # If client key is new and at capacity, evict
            if client_key not in self._history and len(self._history) >= self.max_tracked_clients:
                self._evict_stale_under_lock(now, cutoff)

            if client_key not in self._history:
                self._history[client_key] = deque()

            timestamps = self._history[client_key]

            # Prune timestamps outside rolling window
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()

            if len(timestamps) >= self.requests_per_minute:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + self.window_seconds - now))
                logger.warning(
                    "Rate limit exceeded for %s (%d requests in %.1fs). Retry after: %ds",
                    client_key,
                    len(timestamps),
                    self.window_seconds,
                    retry_after,
                )
                headers = {"Retry-After": str(retry_after)}
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Rate limit exceeded ({self.requests_per_minute} requests/min). Please try again later.",
                        "retry_after": retry_after,
                    },
                    headers=headers,
                )

            # Record current request timestamp
            timestamps.append(now)

    def cleanup_expired(self) -> int:
        """Removes all expired entries from memory. Returns number of keys evicted."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        evicted = 0
        with self._lock:
            expired_keys = [k for k, timestamps in self._history.items() if not timestamps or timestamps[-1] < cutoff]
            for k in expired_keys:
                del self._history[k]
                evicted += 1
        return evicted

    def reset(self) -> None:
        """Clears all tracking history (primarily for tests)."""
        with self._lock:
            self._history.clear()


# Default endpoint rate limiters (10 requests per minute, max 10,000 tracked clients)
image_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=10, window_seconds=60.0, max_tracked_clients=10000)
ticket_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=10, window_seconds=60.0, max_tracked_clients=10000)
