"""Authentication and authorization schemas."""

from pydantic import BaseModel, Field


class WebSocketTicketResponse(BaseModel):
    """Response containing a single-use WebSocket authentication ticket."""

    ticket: str = Field(..., description="Cryptographically random single-use ticket")
    expires_in: int = Field(30, description="Ticket validity window in seconds")
