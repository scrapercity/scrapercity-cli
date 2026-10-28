"""Run any ScraperCity tool by name, exactly as the ScraperCity MCP server runs it.

The tool list (``TOOLS``) is generated from the live API docs on each release. Scraper tools are
POSTed straight to their endpoint; the hand-written tools (account, runs, databases, lookalikes) are
dispatched below. ``npm run generate`` in the release stops if a hand-written tool has no handler
here, so this list cannot fall behind the MCP server.
"""
from __future__ import annotations

from typing import Any, Callable, Dict

from scrapercity._catalog import ENDPOINT_BY_TOOL, TOOLS

TOOL_NAMES = [t["name"] for t in TOOLS]


def _arg(a: dict, camel: str, snake: str, default: Any = None) -> Any:
    """Read an argument by its MCP name (runId) or its Python name (run_id)."""
    if a.get(camel) is not None:
        return a[camel]
    if a.get(snake) is not None:
        return a[snake]
    return default


def _db_params(a: dict, flags: list) -> dict:
    params = dict(a)
    for k in flags:
        if params.get(k):
            params[k] = "true"
        else:
            params.pop(k, None)
    if params.get("after") is not None:
        params["after"] = str(params["after"])
    return params


def _download(sc, a):
    dl = sc.download(_arg(a, "runId", "run_id"), _arg(a, "outputPath", "output_path"))
    return {"success": True, "path": dl["path"], "sizeKB": round(dl["bytes"] / 1024)}


def _lookalike_csv(sc, a):
    dl = sc.lookalike_csv(a.get("id"), _arg(a, "outputPath", "output_path"))
    return {"success": True, "path": dl["path"], "sizeKB": round(dl["bytes"] / 1024)}


_UTILITY_HANDLERS: Dict[str, Callable] = {
    "check_wallet": lambda sc, a: sc.wallet(),
    "list_runs": lambda sc, a: sc.runs(a.get("hours") or 24, a.get("limit") or 20),
    "check_run_status": lambda sc, a: sc.status(_arg(a, "runId", "run_id")),
    "download_results": _download,
    "cancel_run": lambda sc, a: sc.cancel(_arg(a, "runId", "run_id")),
    "plan_search": lambda sc, a: sc.plan_search(a.get("query"), a.get("database")),
    "find_lookalike_groups": lambda sc, a: sc.lookalike_start(a.get("domains")),
    "get_lookalike_groups": lambda sc, a: sc.lookalike_job(a.get("id")),
    "download_lookalike_csv": _lookalike_csv,
    "query_lead_database": lambda sc, a: sc.query_leads(**_db_params(a, ["hasEmail", "hasPhone", "excludeDelivered"])),
    "query_local_business_database": lambda sc, a: sc.query_local_businesses(
        **_db_params(a, ["hasEmail", "hasPhone", "hasWebsite", "hasContact", "excludeDelivered"])),
    "query_ecommerce_database": lambda sc, a: sc.query_ecommerce(
        **_db_params(a, ["hasEmail", "hasPhone", "hasInstagram", "hasFacebook", "hasTiktok", "excludeDelivered"])),
}


def call_tool(sc, name: str, args: dict) -> Any:
    """Run tool ``name`` with ``args`` on client ``sc``. Returns the API's answer."""
    args = dict(args or {})
    endpoint = ENDPOINT_BY_TOOL.get(name)
    if endpoint:
        return sc.post_endpoint(endpoint, args)
    handler = _UTILITY_HANDLERS.get(name)
    if handler is None:
        raise ValueError(f"Unknown tool: {name}")
    return handler(sc, args)


_missing = [n for n in TOOL_NAMES if n not in ENDPOINT_BY_TOOL and n not in _UTILITY_HANDLERS]
if _missing:  # pragma: no cover - the release's generate step stops before this can ship
    raise ImportError(f"scrapercity.tools: no handler for {', '.join(_missing)}")
