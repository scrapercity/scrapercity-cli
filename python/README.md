# ScraperCity Python SDK

The official Python SDK for [ScraperCity](https://scrapercity.com): B2B lead generation for AI agents and developers. Query the Lead Database, the Local Business Database and the Ecommerce Store Database, scrape Google Maps and Apollo, find and validate emails, find mobile numbers, skip trace, and more, from plain Python or from any LangChain, LangGraph or OpenAI agent.

The SDK carries the same tool list as the [ScraperCity MCP server](https://scrapercity.com/mcp). It is regenerated from the live API docs on every release, so a new scraper or a new filter reaches Python the same day it reaches the MCP.

```bash
pip install scrapercity
pip install "scrapercity[langchain]"   # LangChain / LangGraph tools
pip install "scrapercity[openai]"      # OpenAI Agents SDK tools
```

**No key yet?** `scrapercity.start_here("dentists in Austin")` needs none: a guided tour with what ScraperCity is, how to sign up, the plans and the trial with their live terms, and real searches with live counts. With a key, `ScraperCity().start_here(...)` plans for your account and returns the exact next call.

**The trial, plainly:** The trial is real usage, not a demo or a free tier: $5 of credit for 7 days that works on every tool and database at the normal prices, so you can pull real records on day one and judge the data. A card is required at signup. When the 7 days end, the plan picked at signup starts; cancel before then from billing and nothing more is charged. If the credit runs out sooner, database pulls wait (nothing is charged for them); a scraper run that goes past the credit starts the plan early. Planning searches and checking counts are free. start_here() returns the live terms.

Get your API key at [app.scrapercity.com/dashboard/api-docs](https://app.scrapercity.com/dashboard/api-docs), then `export SCRAPERCITY_API_KEY=your_key` (or pass it to `ScraperCity("your_key")`).

## Quick start

```python
from scrapercity import ScraperCity

sc = ScraperCity()  # reads SCRAPERCITY_API_KEY

print(sc.wallet())  # balance and plan

# Instant database search (included on $149/mo and up; per record from credits on a trial or $49)
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

Scrapers charge per result from your credits. The database tools are included with the $149/mo plan and up; on a trial or the $49 plan each new record is paid from credits. Prices below come from the live catalog on each release.

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
| `scrape_signals` | /api/v1/scrape/signals | $0.0094 per company running ads, $0.0009 per website per platform checked, $0.0043 per company hiring; minimum charge per search |
| `scrape_ucc_filings` | /api/v1/scrape/ucc-filings | $0.0028 per filing |
| `scrape_facebook_pages` | /api/v1/scrape/facebook-pages | $0.0012 per page from page links, $0.0028 per page from a search |
| `scrape_cold_email_sender` | /api/v1/scrape/cold-email-sender | $0.25 per person emailed (the first email plus one follow-up); a preview is free |
| `scrape_bulk_llm_prompts` | /api/v1/scrape/bulk-llm-prompts | $0.00005 per 1,000 tokens (prompts plus answers, the run's total), minimum charge $0.12 a run |
| `scrape_ai_for_every_row` | /api/v1/scrape/ai-for-every-row | $0.0019 per row answered, minimum charge $0.12 a run |
| `scrape_ai_image_upscaler` | /api/v1/scrape/ai-image-upscaler | $0.019 per image upscaled, minimum charge $0.058 a run |
| `scrape_ai_image_generator` | /api/v1/scrape/ai-image-generator | $0.0038 per image up to about 1.1 megapixels (a bigger image counts as 2), minimum charge $0.052 a run |
| `scrape_ai_web_scraper` | /api/v1/scrape/ai-web-scraper | $0.019 per page extracted |
| `scrape_search_results` | /api/v1/scrape/search-results | $0.00017 per search answered; $0.00126 per result page read when readPages is on |
| `scrape_website_to_markdown` | /api/v1/scrape/website-to-markdown | $0.00099 per page with text |
| `scrape_website_contacts` | /api/v1/scrape/website-contacts | $0.004 per website with an email or phone found |
| `find_job_posts` | /api/v1/scrape/job-scraper | $0.0009 per job post, decision maker included; minimum charge per search |
| `scrape_instagram_leads` | /api/v1/scrape/instagram-leads | $0.0023 per profile found by keyword or hashtag, $0.0006 per profile from your own list |
| `scrape_instagram_posts` | /api/v1/scrape/instagram-posts | $0.0015 per post |
| `scrape_instagram_comments` | /api/v1/scrape/instagram-comments | $0.0009 per comment |
| `scrape_instagram_followers` | /api/v1/scrape/instagram-followers | $0.0020 per account |
| `scrape_facebook_posts` | /api/v1/scrape/facebook-posts | $0.0032 per post |
| `scrape_facebook_comments` | /api/v1/scrape/facebook-comments | $0.0007 per comment |
| `scrape_facebook_reviews` | /api/v1/scrape/facebook-reviews | $0.0051 per review |
| `scrape_facebook_ads` | /api/v1/scrape/facebook-ads | $0.0006 per ad |
| `scrape_facebook_groups` | /api/v1/scrape/facebook-groups | $0.0051 per post |
| `scrape_facebook_marketplace` | /api/v1/scrape/facebook-marketplace | $0.0015 per listing |
| `scrape_facebook_events` | /api/v1/scrape/facebook-events | $0.0259 per event |
| `scrape_threads_posts` | /api/v1/scrape/threads-posts | $0.0047 per post by keyword, $0.0058 per post from profiles |
| `scrape_google_ads` | /api/v1/scrape/google-ads | $0.00142 per ad |
| `find_linkedin_post_engagers` | /api/v1/scrape/linkedin-post-engagers | $0.004 per person |
| `find_emails` | /api/v1/scrape/email-finder | $0.05 per email found (FREE if not found) |
| `find_mobiles` | /api/v1/scrape/mobile-finder | $0.25 per number found (FREE if not found) |
<!-- GENERATED:pricing:end -->

## Also from ScraperCity

- [JavaScript SDK, CLI and MCP server](https://www.npmjs.com/package/scrapercity): `npm install scrapercity`
- [SDK guide](https://scrapercity.com/sdk)
- [API reference](https://scrapercity.com/api-docs)
- [MCP server setup](https://scrapercity.com/mcp)

MIT License
