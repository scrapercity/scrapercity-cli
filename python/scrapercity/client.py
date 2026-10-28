"""ScraperCity API client.

Every endpoint has a method, and every tool the ScraperCity MCP server offers can be run by name
with ``call_tool``. The tool list is generated from the live API docs on each release
(``scrapercity._catalog``), so new scrapers show up here without a code change.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from scrapercity._catalog import ENDPOINT_BY_TOOL, ENDPOINTS, TOOLS, VERSION

BASE_URL = "https://app.scrapercity.com"
USER_AGENT = f"scrapercity-python/{VERSION}"

# A query string past ~16KB is refused by the server before the search runs, so a long database
# search (a big Apollo or Google Maps URL, long title lists) goes as a POST with a JSON body.
_LONG_QUERY = 6000


class ScraperCityError(RuntimeError):
    """An error answer from the ScraperCity API. ``status`` is the HTTP code, ``data`` the body."""

    def __init__(self, message: str, status: Optional[int] = None, data: Any = None):
        super().__init__(message)
        self.status = status
        self.data = data


def _ep(key: str, fallback: str) -> str:
    return ENDPOINTS.get(key, fallback)


def _query_items(params: dict) -> list:
    items = []
    for k, v in params.items():
        if v is None or v == "" or v is False:
            continue
        if isinstance(v, (list, tuple)):
            items.extend((k, "true" if x is True else str(x)) for x in v)
        elif v is True:
            items.append((k, "true"))
        else:
            items.append((k, str(v)))
    return items


class ScraperCity:
    """ScraperCity API client for B2B lead generation.

    Usage:
        from scrapercity import ScraperCity
        sc = ScraperCity("your-api-key")   # or set SCRAPERCITY_API_KEY
        sc.wallet()
        sc.call_tool("query_lead_database", {"title": "CEO", "limit": 10})
    """

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: float = 120):
        self.api_key = api_key or os.environ.get("SCRAPERCITY_API_KEY") or self._load_rc()
        if not self.api_key:
            raise ValueError(
                "No API key. Pass api_key= or set SCRAPERCITY_API_KEY env var. "
                "Get yours at scrapercity.com"
            )
        self.base_url = (base_url or os.environ.get("SCRAPERCITY_BASE_URL") or BASE_URL).rstrip("/")
        self.timeout = timeout

    def _load_rc(self) -> Optional[str]:
        rc = Path.home() / ".scrapercityrc"
        if rc.exists():
            try:
                return json.loads(rc.read_text()).get("apiKey")
            except Exception:
                return None
        return None

    # ── HTTP ───────────────────────────────────────────────────
    def _url(self, path: str) -> str:
        return path if path.startswith("http") else f"{self.base_url}{path}"

    def _open(self, method: str, path: str, body: Optional[dict] = None):
        data = json.dumps(body).encode() if body is not None and method != "GET" else None
        req = Request(self._url(path), data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", USER_AGENT)
        try:
            return urlopen(req, timeout=self.timeout)
        except HTTPError as e:
            text = e.read().decode(errors="replace")
            try:
                err = json.loads(text)
            except Exception:
                err = {"raw": text}
            msg = (err.get("error") or err.get("message")) if isinstance(err, dict) else None
            raise ScraperCityError(msg or f"HTTP {e.code}", e.code, err) from e

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> Any:
        with self._open(method, path, body) as resp:
            raw = resp.read()
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw.decode(errors="replace")}

    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, body: Optional[dict] = None) -> Any:
        return self._request("POST", path, body if body is not None else {})

    def _save(self, path: str, out: str) -> dict:
        with self._open("GET", path) as resp:
            data = resp.read()
        Path(out).write_bytes(data)
        return {"path": out, "bytes": len(data)}

    def _db(self, key: str, fallback: str, params: dict, post_when_long: bool = True) -> Any:
        endpoint = _ep(key, fallback)
        items = _query_items(params)
        qs = urlencode(items)
        if post_when_long and len(qs) > _LONG_QUERY:
            body = {k: v for k, v in params.items() if v is not None and v != "" and v is not False}
            body = {k: ("true" if v is True else v) for k, v in body.items()}
            return self._post(endpoint, body)
        return self._get(f"{endpoint}?{qs}" if qs else endpoint)

    # ── Tools (the same list the MCP server serves) ─────────────
    @staticmethod
    def tools() -> list:
        """Every tool, with name, description and JSON-schema inputSchema."""
        return TOOLS

    def call_tool(self, name: str, args: Optional[dict] = None) -> Any:
        """Run any ScraperCity tool by name with the arguments an MCP client would send."""
        from scrapercity.tools import call_tool

        return call_tool(self, name, args or {})

    # ── Wallet & Runs ──────────────────────────────────────────
    def wallet(self) -> dict:
        """Check account balance, plan, and billing info."""
        return self._get("/api/v1/wallet")

    def runs(self, hours: int = 24, limit: int = 50) -> dict:
        """List recent scraper runs."""
        return self._get(f"/api/v1/runs?hours={hours}&limit={limit}")

    # ── Status / Download / Cancel / Logs ──────────────────────
    def status(self, run_id: str) -> dict:
        """Check status of a scraper run."""
        return self._get(f"/api/v1/scrape/status/{quote(str(run_id), safe='')}")

    def cancel(self, run_id: str) -> dict:
        """Cancel a running scraper job."""
        return self._post(f"/api/v1/scrape/cancel/{quote(str(run_id), safe='')}", {})

    def logs(self, run_id: str) -> dict:
        """Read the log lines of a scraper run."""
        return self._get(f"/api/v1/scrape/logs/{quote(str(run_id), safe='')}")

    def download(self, run_id: str, output_path: Optional[str] = None) -> dict:
        """Download CSV results of a completed run."""
        return self._save(f"/api/downloads/{quote(str(run_id), safe='')}", output_path or f"{run_id}.csv")

    def poll_until_done(self, run_id: str, interval: int = 15, timeout: int = 3600) -> dict:
        """Poll a run until it completes. Returns final status."""
        start = time.time()
        while time.time() - start < timeout:
            s = self.status(run_id)
            if s.get("status") == "SUCCEEDED":
                return s
            if s.get("status") in ("FAILED", "CANCELLED"):
                raise RuntimeError(f"Run {run_id} ended: {s.get('status')} - {s.get('statusMessage', '')}")
            time.sleep(interval)
        raise TimeoutError(f"Timed out after {timeout}s waiting for {run_id}")

    # ── Generic ────────────────────────────────────────────────
    def scrape(self, slug: str, body: dict) -> dict:
        """Start any scraper by its slug (POST /api/v1/scrape/<slug>)."""
        return self._post(_ep(slug, f"/api/v1/scrape/{slug}"), body)

    # ── Apollo ─────────────────────────────────────────────────
    def scrape_apollo(self, url: str, count: int = 1000, file_name: str = "") -> dict:
        """Scrape B2B contacts from Apollo.io using a search URL."""
        return self._post(_ep("apollo", "/api/v1/scrape/apollo"), {"url": url, "count": count, "fileName": file_name})

    def apollo_status(self) -> dict:
        """How Apollo orders are being delivered right now."""
        return self._get("/api/v1/apollo-status")

    def scrape_apollo_filters(self, **filters) -> dict:
        """Retired: the filter endpoint is switched off. Use scrape_apollo with a search URL."""
        return self._post("/api/v1/scrape/apollo-filters", filters)

    # ── Maps ───────────────────────────────────────────────────
    def scrape_maps(self, query, location: str, limit: int = 500) -> dict:
        """Scrape businesses from Google Maps."""
        q = [query] if isinstance(query, str) else list(query)
        return self._post(_ep("maps", "/api/v1/scrape/maps"), {
            "searchStringsArray": q,
            "locationQuery": location,
            "maxCrawledPlacesPerSearch": limit,
        })

    # ── Email Validator / Finder / Mobile Finder ───────────────
    def validate_emails(self, emails: list) -> dict:
        """Validate email addresses for deliverability."""
        return self._post(_ep("email-validator", "/api/v1/scrape/email-validator"), {"emails": emails})

    def find_emails(self, contacts: list, validate: bool = False, mobiles: bool = False) -> dict:
        """Find business email addresses from name + company."""
        return self._post(_ep("email-finder", "/api/v1/scrape/email-finder"), {
            "contacts": contacts,
            "autoValidateEmails": validate,
            "autoFindMobiles": mobiles,
        })

    def find_mobiles(self, inputs: list) -> dict:
        """Find mobile numbers from LinkedIn URLs or work emails."""
        return self._post(_ep("mobile-finder", "/api/v1/scrape/mobile-finder"), {"inputs": inputs})

    # ── People Finder / Skip Trace ─────────────────────────────
    def find_people(self, **params) -> dict:
        """Skip trace - look up personal info by name, email, phone, or address."""
        return self._post(_ep("skip-trace", "/api/v1/scrape/skip-trace"), params)

    # ── Other scrapers ─────────────────────────────────────────
    def scrape_store_leads(self, **params) -> dict:
        """Get ecommerce store data (Shopify, WooCommerce, etc)."""
        return self._post(_ep("store-leads", "/api/v1/scrape/store-leads"), params)

    def scrape_builtwith(self, technology: str, file_name: str = "") -> dict:
        """Find websites using a specific technology."""
        return self._post(_ep("builtwith", "/api/v1/scrape/techstack"), {"technology": technology, "fileName": file_name})

    def search_criminal_records(self, name: str, state: str = "", dob: str = "") -> dict:
        """Search criminal records by name."""
        return self._post(_ep("criminal-records", "/api/v1/scrape/criminal-records"), {"name": name, "state": state, "dob": dob})

    def scrape_airbnb(self, **params) -> dict:
        """Scrape Airbnb host emails by city or listing URL."""
        return self._post(_ep("airbnb-email", "/api/v1/scrape/airbnb-email"), params)

    def scrape_youtube_email(self, channels: list) -> dict:
        """Find business emails for YouTube channels."""
        return self._post(_ep("youtube-email", "/api/v1/scrape/youtube-email"), {"channels": channels})

    def scrape_website_finder(self, domains: list, job_title: str = "") -> dict:
        """Find contact info from website domains."""
        return self._post(_ep("website-finder", "/api/v1/scrape/website-finder"), {"domains": domains, "jobTitle": job_title})

    def scrape_yelp(self, **params) -> dict:
        """Scrape business listings from Yelp."""
        return self._post(_ep("yelp-scraper", "/api/v1/scrape/yelp-scraper"), params)

    def scrape_angi(self, keyword: str, zip_codes: Optional[list] = None, max_items: int = 100) -> dict:
        """Scrape from Angi (Angie's List)."""
        return self._post(_ep("angi-angies-list-scraper", "/api/v1/scrape/angi-angies-list-scraper"), {
            "keyword": keyword, "zipCodes": zip_codes or [], "maxItems": max_items,
        })

    def scrape_zillow_agents(self, location: str, **opts) -> dict:
        """Scrape real estate agents from Zillow."""
        return self._post(_ep("zillow-agents", "/api/v1/scrape/zillow-agents"), {"location": location, **opts})

    def scrape_bizbuysell(self, start_urls: list, max_items: int = 100) -> dict:
        """Scrape business-for-sale listings."""
        return self._post(_ep("bizbuysell-scraper", "/api/v1/scrape/bizbuysell-scraper"), {"startUrls": start_urls, "maxItems": max_items})

    def scrape_crexi(self, start_urls: list) -> dict:
        """Scrape commercial real estate from Crexi."""
        return self._post(_ep("crexi-scraper", "/api/v1/scrape/crexi-scraper"), {"startUrls": start_urls})

    def scrape_property_lookup(self, addresses: list, include_owner: bool = False) -> dict:
        """Look up property data by address."""
        return self._post(_ep("property-lookup", "/api/v1/scrape/property-lookup"), {
            "addresses": addresses, "includeOwnerContact": include_owner,
        })

    def scrape_distress_list(self, **params) -> dict:
        """Find distressed properties (Deal Finder)."""
        return self._post(_ep("distress-list", "/api/v1/scrape/distress-list"), params)

    # ── Databases ($149/mo plan and up) ────────────────────────
    def query_leads(self, **params) -> dict:
        """Query the B2B lead database (people at companies)."""
        return self._db("database-leads", "/api/v1/database/leads", params)

    def query_local_businesses(self, **params) -> dict:
        """Query the local business database."""
        return self._db("database-local-businesses", "/api/v1/database/local-businesses", params)

    def query_ecommerce(self, **params) -> dict:
        """Query the ecommerce store database."""
        return self._db("database-ecommerce", "/api/v1/database/ecommerce", params, post_when_long=False)

    def plan_search(self, query: str, database: Optional[str] = None) -> dict:
        """Turn plain English into ready-to-run database searches. database: 'leads', 'local' or 'ecommerce'."""
        body = {"query": query}
        if database:
            body["database"] = database
        return self._post(_ep("database-plan", "/api/v1/database/plan"), body)

    # ── Lookalike groups ($149/mo plan and up) ─────────────────
    def lookalike_start(self, domains: list) -> dict:
        """Group your customers (websites or work emails) into lookalike audiences. Returns the job."""
        return self._post(_ep("autoleads-lookalike", "/api/v1/autoleads/lookalike"), {"domains": domains})

    def lookalike_job(self, job_id: str) -> dict:
        """Read a lookalike job: status, percent and, when done, the groups."""
        return self._get(f"{_ep('autoleads-lookalike', '/api/v1/autoleads/lookalike')}?id={quote(str(job_id), safe='')}")

    def lookalike_csv(self, job_id: str, output_path: Optional[str] = None) -> dict:
        """Save a finished lookalike job as a CSV file."""
        path = f"{_ep('autoleads-lookalike', '/api/v1/autoleads/lookalike')}?id={quote(str(job_id), safe='')}&format=csv"
        return self._save(path, output_path or f"lookalike-{job_id}.csv")

    # ── Generated tools ────────────────────────────────────────
    def post_endpoint(self, endpoint: str, body: dict) -> Any:
        """POST a body straight to a full endpoint path (how generated scraper tools run)."""
        return self._post(endpoint, body)


def tool_endpoint(name: str) -> Optional[str]:
    """The endpoint a generated scraper tool posts to, or None for a hand-written tool."""
    return ENDPOINT_BY_TOOL.get(name)
