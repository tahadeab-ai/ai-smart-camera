"""Authentication endpoints for session access and WebSocket tickets."""

import logging

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import verify_access_token
from app.api.schemas.auth import WebSocketTicketResponse
from app.services.rate_limiter import ticket_rate_limiter
from app.services.ticket_manager import ticket_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/ws-ticket",
    response_model=WebSocketTicketResponse,
    dependencies=[Depends(verify_access_token)],
)
async def create_ws_ticket(request: Request) -> WebSocketTicketResponse:
    """Issues a short-lived, single-use ticket for WebSocket camera streaming.

    Requires valid master access token via 'X-Access-Token' or 'Authorization: Bearer <token>'.
    Protects master tokens from exposure in WebSocket handshake URLs, query parameters, or proxy logs.
    """
    ticket_rate_limiter.check(request)
    client_host = request.client.host if request.client else None
    ticket = ticket_manager.create_ticket(client_id=client_host)

    return WebSocketTicketResponse(ticket=ticket, expires_in=int(ticket_manager.ttl_seconds))
