#!/usr/bin/env node
// bin/mcp.mjs - ScraperCity MCP Server (stdio transport)
// Connect from Claude Code / Cursor / any MCP client.
//
// The tool list and the dispatcher live in lib/tools.mjs, shared with the JavaScript SDK
// (lib/index.mjs); scripts/generate.mjs writes the same list into the Python SDK. Scraper tools
// are generated from scraperConfigs.ts and POSTed straight to their /api/v1/scrape endpoint;
// the hand-written tools (account, runs, databases, lookalikes) are in lib/utilityTools.mjs.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS, callTool } from '../lib/tools.mjs'

const server = new Server({ name: 'scrapercity', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  try {
    const result = await callTool(name, args)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    if (/^Unknown tool: /.test(e.message)) return { content: [{ type: 'text', text: e.message }], isError: true }
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
