# ScraperCity Python SDK

The official Python SDK for [ScraperCity](https://scrapercity.com): B2B lead generation for AI agents and developers. Query the Lead Database, the Local Business Database and the Ecommerce Store Database, scrape Google Maps and Apollo, find and validate emails, find mobile numbers, skip trace, and more, from plain Python or from any LangChain, LangGraph or OpenAI agent.

The SDK carries the same tool list as the [ScraperCity MCP server](https://scrapercity.com/mcp). It is regenerated from the live API docs on every release, so a new scraper or a new filter reaches Python the same day it reaches the MCP.

```bash
pip install scrapercity
pip install "scrapercity[langchain]"   # LangChain / LangGraph tools
pip install "scrapercity[openai]"      # OpenAI Agents SDK tools
```

Get your API key at [app.scrapercity.com/dashboard/api-docs](https://app.scrapercity.com/dashboard/api-docs), then `export SCRAPERCITY_API_KEY=your_key` (or pass it to `ScraperCity("your_key")`).

## Quick start

```python
from scrapercity import ScraperCity

sc = ScraperCity()  # reads SCRAPERCITY_API_KEY

print(sc.wallet())  # balance and plan

# Instant database search ($149/mo plan and up)
leads = sc.query_leads(title="Head of Marketing", country=["United States"], hasEmail=True, limit=25)

# Not sure of the filter values? Describe who you want in plain English.
plan = sc.plan_search("dentists in Austin, Texas")

# Scrapers run in the background: start, wait, download
run = sc.scrape_maps("plumbers", "Denver, CO", limit=200)
sc.poll_until_done(run["runId"])
sc.download(run["runId"], "plumbers.csv")
```

## Every tool by name

`ScraperCity.tools()` (or `scrapercity.TOOLS`) lists every tool with its name, description and JSON schema. Run any of them with the same arguments an MCP client would send:

```python
sc.call_tool("query_local_business_database", {"keyword": ["thai restaurant"], "location": ["Houston TX"], "hasEmail": True})
sc.call_tool("validate_emails", {"emails": ["jane@acme.com"]})
```

## LangChain and LangGraph

```python
from scrapercity import langchain_tools
from langgraph.prebuilt import create_react_agent

tools = langchain_tools()                     # every tool
# tools = langchain_tools(include=["plan_search", "query_lead_database"])
agent = create_react_agent(llm, tools)
agent.invoke({"messages": [("user", "Find 50 VPs of Sales at SaaS companies in Texas with emails")]})
```

## OpenAI Agents SDK and function calling

```python
from agents import Agent, Runner
from scrapercity.openai_tools import get_tools

agent = Agent(name="Lead finder", tools=get_tools())
Runner.run_sync(agent, "Find 100 roofing companies in Phoenix with phone numbers")
```

```python
import json
from openai import OpenAI
from scrapercity.openai_tools import get_function_definitions, handle_tool_call

client = OpenAI()
resp = client.chat.completions.create(model="gpt-4.1", messages=messages, tools=get_function_definitions())
for call in resp.choices[0].message.tool_calls or []:
    result = handle_tool_call(call.function.name, call.function.arguments)  # JSON string for the tool message
```

For the Responses API use `get_response_tools()`.

## Errors

A failed call raises `scrapercity.ScraperCityError` with the API's message, `.status` (the HTTP code) and `.data` (the answer body). `ScraperCityError` is a `RuntimeError`, so code written for older versions keeps working.

## Pricing

Scrapers charge per result from your credits. The database tools are included with the $149/mo plan and up. Prices below come from the live catalog on each release.

<!-- GENERATED:pricing:start -->
| Tool | Endpoint | Price |
|------|----------|-------|
| `scrape_apollo` | /api/v1/scrape/apollo | $0.0039 per lead |
| `scrape_website_finder` | /api/v1/scrape/website-finder | $0.0499 per contact found |
| `find_people` | /api/v1/scrape/skip-trace | $0.0199 per result (searches with 0 matches are billed as 1 result) |
| `scrape_distress_list` | /api/v1/scrape/distress-list | $0.05 per property |
| `validate_emails` | /api/v1/scrape/email-validator | $0.0017 per email |
| `scrape_maps` | /api/v1/scrape/maps | $0.0099 per business |
| `scrape_airbnb` | /api/v1/scrape/airbnb-email | $0.019 per result ($19.00 per 1,000) |
| `scrape_bizbuysell` | /api/v1/scrape/bizbuysell-scraper | $0.0099 per listing |
| `scrape_crexi` | /api/v1/scrape/crexi-scraper | $0.029 per property |
| `scrape_angi` | /api/v1/scrape/angi-angies-list-scraper | $0.0099 per listing |
| `scrape_yelp` | /api/v1/scrape/yelp-scraper | $0.0099 per result |
| `scrape_zillow_agents` | /api/v1/scrape/zillow-agents | $0.029 per agent |
| `scrape_property_lookup` | /api/v1/scrape/property-lookup | $0.15 per property (+$0.10 for owner contact) |
| `search_criminal_records` | /api/v1/scrape/criminal-records | $1.00 per search (only charged if records found) |
| `scrape_store_leads` | /api/v1/scrape/store-leads | $0.0039 per lead |
| `scrape_builtwith` | /api/v1/scrape/techstack | $4.99 per technology |
| `scrape_signals` | /api/v1/scrape/signals | $0.10 per company running ads, $0.03 per website checked, $0.05 per company hiring; minimum charge per search |
| `find_emails` | /api/v1/scrape/email-finder | $0.05 per email found (FREE if not found) |
| `find_mobiles` | /api/v1/scrape/mobile-finder | $0.25 per number found (FREE if not found) |
<!-- GENERATED:pricing:end -->

## Also from ScraperCity

- [JavaScript SDK, CLI and MCP server](https://www.npmjs.com/package/scrapercity): `npm install scrapercity`
- [SDK guide](https://scrapercity.com/sdk)
- [API reference](https://scrapercity.com/api-docs)
- [MCP server setup](https://scrapercity.com/mcp)

MIT License
