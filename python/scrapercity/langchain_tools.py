"""LangChain tools for ScraperCity: every tool the ScraperCity MCP server offers.

Usage with LangChain:
    from scrapercity import langchain_tools
    tools = langchain_tools()          # key from SCRAPERCITY_API_KEY, or langchain_tools("your-key")

Usage with LangGraph:
    from scrapercity import langchain_tools
    from langgraph.prebuilt import create_react_agent
    agent = create_react_agent(llm, langchain_tools())
"""
from __future__ import annotations

import json
from typing import Any, List, Optional

from scrapercity._catalog import TOOLS
from scrapercity.client import ScraperCity

_PY_TYPES = {"string": str, "number": float, "integer": int, "boolean": bool, "object": dict}


def _py_type(schema: dict) -> Any:
    t = schema.get("type")
    if t == "array":
        item = _py_type(schema.get("items") or {})
        return List[item]  # type: ignore[valid-type]
    return _PY_TYPES.get(t, Any)


def _args_model(tool: dict):
    from pydantic import Field, create_model

    schema = tool.get("inputSchema") or {}
    required = set(schema.get("required") or [])
    fields = {}
    for name, prop in (schema.get("properties") or {}).items():
        typ = _py_type(prop)
        desc = prop.get("description")
        if name in required:
            fields[name] = (typ, Field(..., description=desc))
        else:
            fields[name] = (Optional[typ], Field(None, description=desc))
    model_name = "".join(p.capitalize() for p in tool["name"].split("_")) + "Args"
    return create_model(model_name, **fields)


def get_tools(api_key: Optional[str] = None, include: Optional[list] = None) -> list:
    """Return LangChain tools for ScraperCity.

    Args:
        api_key: ScraperCity API key. Falls back to SCRAPERCITY_API_KEY env var.
        include: Optional list of tool names to keep (default: every tool).

    Returns:
        List of LangChain StructuredTools ready to use with any agent.
    """
    try:
        from langchain_core.tools import StructuredTool
    except ImportError:
        raise ImportError("Install langchain-core: pip install scrapercity[langchain]")

    sc = ScraperCity(api_key)
    tools = []
    for t in TOOLS:
        if include and t["name"] not in include:
            continue

        def run(_name=t["name"], **kwargs) -> str:
            args = {k: v for k, v in kwargs.items() if v is not None}
            try:
                return json.dumps(sc.call_tool(_name, args), indent=2)
            except Exception as e:  # the agent reads the error and can correct its call
                return json.dumps({"error": str(e)})

        tools.append(StructuredTool.from_function(
            func=run,
            name=t["name"],
            description=t["description"],
            args_schema=_args_model(t),
        ))
    return tools
