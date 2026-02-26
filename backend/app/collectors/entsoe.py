"""ENTSO-E Transparency Platform collector for day-ahead electricity prices."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from xml.etree import ElementTree

import httpx

from ..config import get_entsoe_config
from ..db import get_repository


class EntsoeCollector:
    """Fetch day-ahead prices from ENTSO-E Transparency Platform."""

    BASE_URL = "https://web-api.tp.entsoe.eu/api"

    def __init__(self, repo=None):
        """Init with optional Repository; uses get_repository() if None."""
        self.repo = repo or get_repository()
        self.config = get_entsoe_config()

    async def fetch(self) -> Optional[List[dict]]:
        """Fetch day-ahead prices. Returns list of {timestamp, spot_price_eur_mwh, source} or None."""
        token = self.config.get("token")
        if not token:
            print("[ENTSO-E] No token configured")
            return None

        zone = self.config.get("zone", "10YPT-REN------1")
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=1)).strftime("%Y%m%d%H%M")
        end = (now + timedelta(days=2)).strftime("%Y%m%d%H%M")

        params = {
            "securityToken": token,
            "documentType": "A44",  # Price document
            "in_Domain": zone,
            "out_Domain": zone,
            "periodStart": start,
            "periodEnd": end,
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(self.BASE_URL, params=params)
                r.raise_for_status()
                text = r.text
        except Exception as e:
            print(f"[ENTSO-E] Fetch failed: {e}")
            return None

        return self._parse_xml(text)

    def _parse_xml(self, xml_text: str) -> Optional[List[dict]]:
        """Parse IEC 62325-351 XML. Returns list of price dicts or None."""
        try:
            root = ElementTree.fromstring(xml_text)
            ns = {"ns": "urn:iec62325.351:tc57wg16:451-3:publicationdocument:7:0"}
            timeseries = root.find(".//ns:TimeSeries", ns)
            if timeseries is None:
                return None

            period = timeseries.find(".//ns:Period", ns)
            if period is None:
                return None

            start = period.find("ns:timeInterval/ns:start", ns)
            if start is None or start.text is None:
                return None

            # Parse start time (e.g. 2024-01-15T00:00Z)
            start_dt = datetime.fromisoformat(start.text.replace("Z", "+00:00"))
            resolution = period.find("ns:resolution", ns)
            resolution_min = 60  # default PT60M
            if resolution is not None and resolution.text:
                s = resolution.text
                if "PT15M" in s:
                    resolution_min = 15
                elif "PT30M" in s:
                    resolution_min = 30

            points = period.findall("ns:Point", ns)
            rows = []
            for i, pt in enumerate(points):
                pos = pt.find("ns:position", ns)
                price_el = pt.find("ns:price.amount", ns)
                if pos is None or price_el is None or price_el.text is None:
                    continue
                pos_num = int(pos.text) if pos.text else 0
                ts = start_dt + timedelta(minutes=resolution_min * (pos_num - 1))
                price = float(price_el.text)
                rows.append({
                    "timestamp": ts.isoformat(),
                    "spot_price_eur_mwh": price,
                    "source": "entsoe",
                })
            return rows
        except Exception as e:
            print(f"[ENTSO-E] Parse failed: {e}")
            return None

    async def run(self) -> bool:
        """Fetch and persist to energy_prices. Returns True on success."""
        rows = await self.fetch()
        if not rows:
            return False
        self.repo.insert_energy_prices_batch(rows)
        print(f"[ENTSO-E] Stored {len(rows)} price records")
        return True
