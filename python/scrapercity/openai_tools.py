"""OpenAI tools for ScraperCity: every tool the ScraperCity MCP server offers.

Usage with the OpenAI Agents SDK:
    from agents import Agent
    from scrapercity.openai_tools import get_tools
    agent = Agent(name="Lead Gen Agent", tools=get_tools())

Usage with OpenAI function calling (chat.completions or responses):
    from scrapercity.openai_tools import get_function_definitions, handle_tool_call
    tools = get_function_definitions()
    # Pass to client.chat.completions.create(tools=tools), then for each tool call:
    # result = handle_tool_call(call.function.name, json.loads(call.function.arguments))
"""
from __future__ import annotations

import json
from typing import Optional

from scrapercity._catalog import TOOLS
from scrapercity.client import ScraperCity

_client: Optional[ScraperCity] = None


def _get_client() -> ScraperCity:
    global _client
    if _client is None:
        _client = ScraperCity()
    return _client


def init(api_key: Optional[str] = None):
    """Set the API key the tools use (default: SCRAPERCITY_API_KEY)."""
    global _client
    _client = ScraperCity(api_key)


def get_function_definitions() -> list:
    """Every ScraperCity tool in OpenAI function-calling format (chat.completions `tools`)."""
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["inputSchema"]}}
        for t in TOOLS
    ]


def get_response_tools() -> list:
    """Every ScraperCity tool in the Responses API format (client.responses.create `tools`)."""
    return [
        {"type": "function", "name": t["name"], "description": t["description"], "parameters": t["inputSchema"]}
        for t in TOOLS
    ]


def handle_tool_call(function_name: str, arguments) -> str:
    """Run a tool call from the model. ``arguments`` may be a dict or the raw JSON string.

    Returns the result as a JSON string, ready to send back as the tool message.
    """
    if isinstance(arguments, str):
        arguments = json.loads(arguments or "{}")
    try:
        return json.dumps(_get_client().call_tool(function_name, arguments or {}), indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_tools(api_key: Optional[str] = None) -> list:
    """Every ScraperCity tool as an OpenAI Agents SDK FunctionTool.

    Usage:
        from agents import Agent
        from scrapercity.openai_tools import get_tools
        agent = Agent(name="Lead Gen", tools=get_tools())
    """
    try:
        from agents import FunctionTool
    except ImportError:
        raise ImportError("Install openai-agents: pip install scrapercity[openai]")

    if api_key:
        init(api_key)

    def make(name):
        async def on_invoke(ctx, args: str) -> str:
            import asyncio

            return await asyncio.to_thread(handle_tool_call, name, args)
        return on_invoke

    return [
        FunctionTool(
            name=t["name"],
            description=t["description"],
            params_json_schema=t["inputSchema"],
            on_invoke_tool=make(t["name"]),
            strict_json_schema=False,
        )
        for t in TOOLS
    ]
