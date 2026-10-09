#!/usr/bin/env node
// bin/mcp.mjs - ScraperCity MCP Server (stdio transport)
// Connect from Claude Code / Cursor / any MCP client.
//
// The SCRAPER tools are generated from scraperConfigs.ts (see lib/catalog.generated.mjs)
// and dispatched generically: the tool's args are POSTed straight to its /api/v1/scrape
// endpoint. Nothing per-scraper is hand-written here — add a scraper to the config and it
// shows up automatically on the next publish. Only the non-scraper utility/DB tools below
// are hand-defined.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as sc from '../lib/client.mjs'
import { TOOLS as SCRAPER_TOOLS, ENDPOINT_BY_TOOL } from '../lib/catalog.generated.mjs'

const server = new Server({ name: 'scrapercity', version: '1.0.0' }, { capabilities: { tools: {} } })

// ── Non-scraper tools (utility + database), hand-defined ──────
const UTILITY_TOOLS = [
  {
    name: 'check_wallet',
    description: 'Check account balance, plan, and billing info. Call this FIRST to verify credits before running any scrape.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_runs',
    description: 'List recent scraper runs with status, lead counts, and costs.',
    inputSchema: { type: 'object', properties: {
      hours: { type: 'number', description: 'How many hours back to look (default 24, max 168)', default: 24 },
      limit: { type: 'number', description: 'Max runs to return (default 20, max 100)', default: 20 }
    } }
  },
  {
    name: 'check_run_status',
    description: 'Check the status of a scraper run. Returns status (RUNNING/SUCCEEDED/FAILED/CANCELLED), lead count, and download URL when complete.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: 'The run ID returned when starting a scrape' } }, required: ['runId'] }
  },
  {
    name: 'download_results',
    description: 'Download the CSV results of a completed scraper run. Only works when status is SUCCEEDED.',
    inputSchema: { type: 'object', properties: {
      runId: { type: 'string', description: 'The run ID to download results for' },
      outputPath: { type: 'string', description: 'File path to save CSV (default: {runId}.csv)' }
    }, required: ['runId'] }
  },
  {
    name: 'cancel_run',
    description: 'Cancel a running scraper job.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: 'The run ID to cancel' } }, required: ['runId'] }
  },
  {
    name: 'query_lead_database',
    description: 'Query the B2B lead database directly. Returns contacts with names, emails, phones, titles, companies (plus company website, revenue, HQ location and keywords). Up to 100 per request. Included with the $149/mo plan (100,000 new leads a day; leads you already have do not count again). For a daily pull of only new leads set excludeDelivered=true. For big pulls page with after: send after="0" first, then the pagination.next_after from each response until it is null. Have a saved people-search URL? Pass it as url to search with its filters right away (search_translation in the response says what was applied).',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'A people-search URL (the address of a people search with its filters). Its filters become the search; any other filter you pass overrides the matching one.' },
      title: { type: 'string', description: 'Job title filter, comma separated for several (partial match, e.g. "CEO, Founder")' },
      industry: { type: 'array', items: { type: 'string' }, description: 'Company industries (any match)' },
      country: { type: 'array', items: { type: 'string' }, description: 'Person countries, full names like "United States" (US, USA, UK, UAE also work)' },
      state: { type: 'array', items: { type: 'string' }, description: 'Person states' },
      city: { type: 'string', description: 'Person city, comma separated for several' },
      companyName: { type: 'string', description: 'Company name' },
      companyDomain: { type: 'string', description: 'Company domain(s), comma separated' },
      seniority: { type: 'array', items: { type: 'string' }, description: 'e.g. ["vp", "director", "c_suite"]' },
      department: { type: 'array', items: { type: 'string' }, description: 'e.g. ["sales", "engineering"]' },
      minEmployees: { type: 'number', description: 'Minimum company employee count' },
      maxEmployees: { type: 'number', description: 'Maximum company employee count' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Company keywords/tags, any match (e.g. ["saas", "fintech"])' },
      revenueMin: { type: 'number', description: 'Minimum company annual revenue, USD' },
      revenueMax: { type: 'number', description: 'Maximum company annual revenue, USD' },
      companyCountry: { type: 'array', items: { type: 'string' }, description: 'Company HQ countries (not where the person is)' },
      companyState: { type: 'array', items: { type: 'string' }, description: 'Company HQ states' },
      companyCity: { type: 'string', description: 'Company HQ city' },
      notTitle: { type: 'string', description: 'Exclude titles containing any of these (comma separated)' },
      notKeywords: { type: 'array', items: { type: 'string' }, description: 'Exclude companies with any of these keywords' },
      notIndustry: { type: 'array', items: { type: 'string' }, description: 'Exclude these industries' },
      socialUrl: { type: 'string', description: 'Match a social profile URL' },
      hasEmail: { type: 'boolean', description: 'Only contacts with email' },
      hasPhone: { type: 'boolean', description: 'Only contacts with phone' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 },
      excludeDelivered: { type: 'boolean', description: 'Skip leads this account already has (from the API or unlocked in the dashboard). With this on, keep page at 1 or use after.' },
      after: { type: 'string', description: 'Cursor paging: return leads after this lead id. Use "0" to start, then the pagination.next_after from each response.' }
    } }
  },
  {
    name: 'query_local_business_database',
    description: 'Query the local business database directly. Returns businesses with phone numbers, emails, websites, addresses and ratings, many with a named contact person. Up to 100 per request. Included with the $149/mo plan (100,000 new businesses a day; businesses you already have do not count again). Set hasContact=true for only businesses with a named contact person. For a daily pull of only new businesses set excludeDelivered=true. For big pulls page with after: send after="0" first, then the pagination.next_after from each response until it is null. Search the way you would on Google Maps: keyword (what the businesses do or are called, e.g. ["thai restaurant"]) and location (cities, states, countries or postal codes, e.g. ["Houston TX", "Austin TX"]); searched_as in the response says how each was read. A search that finds nothing also returns lead_database: the same search in the Lead Database when it has 100+ people. Have a Google Maps search URL? Pass it as url to search with its keyword and place right away (search_translation in the response says what was applied).',
    inputSchema: { type: 'object', properties: {
      keyword: { type: 'array', items: { type: 'string' }, description: 'What the businesses do or are called, as typed on Google Maps, e.g. ["thai restaurant", "sushi"]. Matches business names and categories; any keyword. A place inside a keyword ("plumbers in Austin TX") is used as the location when no location is given.' },
      location: { type: 'array', items: { type: 'string' }, description: 'Cities, states, countries or postal codes, as typed, e.g. ["Houston TX", "78701", "Ontario", "Germany"] (up to 2,000; any of them).' },
      url: { type: 'string', description: 'A Google Maps search URL (the address of a search on Google Maps). Its keyword and place become the search; any other filter you pass overrides the matching one.' },
      category: { type: 'array', items: { type: 'string' }, description: 'Business categories, e.g. ["Dentist"]. A word also finds categories that contain it ("restaurant" finds "Mexican restaurant")' },
      country: { type: 'array', items: { type: 'string' }, description: 'Two-letter country codes, e.g. ["US"]' },
      state: { type: 'string', description: 'State or region, comma separated for several (US abbreviations work, e.g. "TX")' },
      city: { type: 'string', description: 'City (partial match)' },
      postalCode: { type: 'string', description: 'Postal or zip code' },
      box: { type: 'string', description: 'A map area as "minLat,minLng,maxLat,maxLng" (e.g. "30.1,-97.9,30.5,-97.5"). Only businesses inside it.' },
      query: { type: 'string', description: 'Search business names and descriptions' },
      title: { type: 'string', description: 'Business name, comma separated for several (partial match)' },
      notCategory: { type: 'array', items: { type: 'string' }, description: 'Exclude these business categories' },
      minRating: { type: 'number', description: 'Minimum Google rating (1-5)' },
      maxRating: { type: 'number', description: 'Maximum Google rating (1-5)' },
      minReviews: { type: 'number', description: 'Minimum number of reviews' },
      maxReviews: { type: 'number', description: 'Maximum number of reviews' },
      hasEmail: { type: 'boolean', description: 'Only businesses with an email address' },
      hasPhone: { type: 'boolean', description: 'Only businesses with a phone number' },
      hasWebsite: { type: 'boolean', description: 'Only businesses with a website' },
      hasContact: { type: 'boolean', description: 'Only businesses with a named contact person' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 },
      excludeDelivered: { type: 'boolean', description: 'Skip businesses this account already has (from the API or unlocked in the dashboard). With this on, keep page at 1 or use after.' },
      after: { type: 'string', description: 'Cursor paging: return businesses after this id. Use "0" to start, then the pagination.next_after from each response.' }
    } }
  }
]

const TOOLS = [...UTILITY_TOOLS, ...SCRAPER_TOOLS]

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  try {
    let result
    // Generated scraper tools: POST args straight to the canonical endpoint.
    if (ENDPOINT_BY_TOOL[name]) {
      result = await sc.postEndpoint(ENDPOINT_BY_TOOL[name], args)
    } else {
      switch (name) {
        case 'check_wallet': result = await sc.wallet(); break
        case 'list_runs': result = await sc.runs(args.hours || 24, args.limit || 20); break
        case 'check_run_status': result = await sc.status(args.runId); break
        case 'download_results': {
          const dl = await sc.download(args.runId, args.outputPath)
          result = { success: true, path: dl.path, sizeKB: Math.round(dl.bytes / 1024) }
          break
        }
        case 'cancel_run': result = await sc.cancel(args.runId); break
        case 'query_lead_database': {
          const params = { ...args }
          if (params.hasEmail) params.hasEmail = 'true'
          if (params.hasPhone) params.hasPhone = 'true'
          if (params.excludeDelivered) params.excludeDelivered = 'true'
          else delete params.excludeDelivered
          if (params.after !== undefined && params.after !== null) params.after = String(params.after)
          result = await sc.dbLeads(params)
          break
        }
        case 'query_local_business_database': {
          const params = { ...args }
          for (const k of ['hasEmail', 'hasPhone', 'hasWebsite', 'hasContact', 'excludeDelivered']) {
            if (params[k]) params[k] = 'true'
            else delete params[k]
          }
          if (params.after !== undefined && params.after !== null) params.after = String(params.after)
          result = await sc.dbLocalBusinesses(params)
          break
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
