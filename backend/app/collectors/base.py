from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseCollector(ABC):
    """Base interface for data collectors."""

    @abstractmethod
    async def fetch(self) -> Optional[Any]:
        """Fetch data from external source. Returns normalized data or None on failure."""
        pass

    @abstractmethod
    async def run(self) -> bool:
        """Fetch and persist to DB. Returns True on success."""
        pass
