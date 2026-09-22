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
    description: 'Query the B2B lead database directly. Returns contacts with names, emails, phones, titles, companies. 100 per request, paginate with page param. Included with the $149/mo plan.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string', description: 'Job title filter' },
      industry: { type: 'string', description: 'Company industry' },
      country: { type: 'string', description: 'Person country' },
      state: { type: 'string', description: 'Person state' },
      city: { type: 'string', description: 'Person city' },
      companyName: { type: 'string', description: 'Company name' },
      companyDomain: { type: 'string', description: 'Company domain' },
      seniority: { type: 'string', description: 'e.g. "vp", "director", "c_suite"' },
      department: { type: 'string', description: 'e.g. "sales", "engineering"' },
      hasEmail: { type: 'boolean', description: 'Only contacts with email' },
      hasPhone: { type: 'boolean', description: 'Only contacts with phone' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 }
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
          result = await sc.dbLeads(params)
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
