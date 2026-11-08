"""In-memory sliding window rate limiter for protecting sensitive endpoints."""

import logging
import threading
import time
from collections import defaultdict, deque
from typing import Callable

from fastapi import HTTPException, Request, Response, status

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate limiter tracking request timestamps per client key."""

    def __init__(self, requests_per_minute: int = 10, window_seconds: float = 60.0) -> None:
        self.requests_per_minute = requests_per_minute
        self.window_seconds = window_seconds
        self._history: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _get_client_key(self, request: Request) -> str:
        """Extracts client IP, checking X-Forwarded-For before socket host."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    def check(self, request: Request, response: Response | None = None) -> None:
        """Enforces rate limiting. Raises HTTP 429 if quota is exceeded."""
        client_key = self._get_client_key(request)
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            timestamps = self._history[client_key]
            # Prune timestamps outside the rolling window
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()

            if len(timestamps) >= self.requests_per_minute:
                # Calculate remaining seconds until the oldest request leaves the window
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

    def reset(self) -> None:
        """Clears all tracking history (primarily for tests)."""
        with self._lock:
            self._history.clear()


# Default endpoint rate limiters (10 requests per minute)
image_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=10, window_seconds=60.0)
ticket_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=10, window_seconds=60.0)
