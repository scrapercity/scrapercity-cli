"""ScraperCity - B2B lead generation for AI agents and Python developers.

    from scrapercity import ScraperCity
    sc = ScraperCity()                      # reads SCRAPERCITY_API_KEY
    sc.wallet()
    sc.call_tool("query_lead_database", {"title": "CEO", "limit": 10})

The tool list is the same one the ScraperCity MCP server serves, regenerated from the live API docs
on every release: ``scrapercity.TOOLS``.
"""
from scrapercity._catalog import TOOLS, VERSION
from scrapercity.client import ScraperCity, ScraperCityError

__version__ = VERSION
__all__ = ["ScraperCity", "ScraperCityError", "TOOLS", "langchain_tools", "__version__"]


def langchain_tools(api_key=None, include=None):
    """LangChain tools for every ScraperCity tool (needs: pip install scrapercity[langchain])."""
    from scrapercity.langchain_tools import get_tools
    # Importing the submodule rebinds this package's `langchain_tools` name to the module; put the
    # function back so scrapercity.langchain_tools() keeps working on the next call.
    globals()["langchain_tools"] = _langchain_tools
    return get_tools(api_key, include)


_langchain_tools = langchain_tools
