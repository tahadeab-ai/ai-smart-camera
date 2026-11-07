"""Standardized error envelopes and common schemas."""

from typing import Any
from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Detailed error object."""

    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error description")
    details: Any | None = Field(default=None, description="Optional diagnostic details")


class ErrorResponse(BaseModel):
    """Standardized JSON error envelope following platform standards."""

    error: ErrorDetail
