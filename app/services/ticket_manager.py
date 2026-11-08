"""Single-use time-limited ticket manager for WebSocket authentication."""

import logging
import secrets
import threading
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Ticket:
    """Represents a temporary single-use WebSocket connection ticket."""

    ticket_id: str
    expires_at: float
    client_id: str | None = None


class TicketManager:
    """Thread-safe in-memory store for single-use WebSocket authentication tickets."""

    def __init__(self, ttl_seconds: float = 30.0) -> None:
        self.ttl_seconds = ttl_seconds
        self._tickets: dict[str, Ticket] = {}
        self._lock = threading.Lock()

    def _cleanup_expired_locked(self, now: float) -> None:
        """Removes expired tickets from memory. Must be called while holding self._lock."""
        expired = [tid for tid, t in self._tickets.items() if t.expires_at < now]
        for tid in expired:
            del self._tickets[tid]

    def create_ticket(self, client_id: str | None = None) -> str:
        """Issues a new cryptographically random single-use ticket with a 30-second TTL."""
        now = time.time()
        ticket_id = secrets.token_urlsafe(32)
        ticket = Ticket(
            ticket_id=ticket_id,
            expires_at=now + self.ttl_seconds,
            client_id=client_id,
        )

        with self._lock:
            self._cleanup_expired_locked(now)
            self._tickets[ticket_id] = ticket

        logger.debug("Issued single-use WS ticket (TTL: %.1fs): %s...", self.ttl_seconds, ticket_id[:8])
        return ticket_id

    def consume_ticket(self, ticket_id: str) -> bool:
        """Atomically validates and consumes a ticket. Returns True if valid, False otherwise."""
        if not ticket_id:
            return False

        now = time.time()
        with self._lock:
            ticket = self._tickets.pop(ticket_id, None)
            if ticket is None:
                logger.warning("Ticket validation failed: ticket not found or already consumed.")
                return False

            if ticket.expires_at < now:
                logger.warning("Ticket validation failed: ticket expired.")
                return False

        logger.debug("Successfully consumed single-use WS ticket: %s...", ticket_id[:8])
        return True

    def clear(self) -> None:
        """Clears all active tickets (useful for test resets)."""
        with self._lock:
            self._tickets.clear()


# Global singleton instance
ticket_manager = TicketManager(ttl_seconds=30.0)
