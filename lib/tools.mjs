// lib/tools.mjs - the one tool list and the one dispatcher, shared by the MCP server (bin/mcp.mjs)
// and the JavaScript SDK (lib/index.mjs). The Python SDK gets the same list through
// scripts/generate.mjs (python/scrapercity/_catalog.py).
//
// Scraper tools are generated from the app's scraperConfigs.ts and dispatched generically: their
// args are POSTed straight to their /api/v1/scrape endpoint. The hand-written tools (account, runs,
// databases, lookalikes) live in lib/utilityTools.mjs and are dispatched below.
import * as sc from './client.mjs'
import { TOOLS as SCRAPER_TOOLS, ENDPOINT_BY_TOOL } from './catalog.generated.mjs'
import { UTILITY_TOOLS } from './utilityTools.mjs'

export const TOOLS = [...UTILITY_TOOLS, ...SCRAPER_TOOLS]

// The database routes take booleans as the string 'true' and leave a false one out.
function dbParams(args, flags) {
  const params = { ...args }
  for (const k of flags) {
    if (params[k]) params[k] = 'true'
    else delete params[k]
  }
  if (params.after !== undefined && params.after !== null) params.after = String(params.after)
  return params
}

const UTILITY_HANDLERS = {
  check_wallet: () => sc.wallet(),
  list_runs: (a) => sc.runs(a.hours || 24, a.limit || 20),
  check_run_status: (a) => sc.status(a.runId),
  download_results: async (a) => {
    const dl = await sc.download(a.runId, a.outputPath)
    return { success: true, path: dl.path, sizeKB: Math.round(dl.bytes / 1024) }
  },
  cancel_run: (a) => sc.cancel(a.runId),
  plan_search: (a) => sc.planSearch(a.query, a.database),
  find_lookalike_groups: (a) => sc.lookalikeStart(a.domains),
  get_lookalike_groups: (a) => sc.lookalikeJob(a.id),
  download_lookalike_csv: async (a) => {
    const dl = await sc.lookalikeCsv(a.id, a.outputPath)
    return { success: true, path: dl.path, sizeKB: Math.round(dl.bytes / 1024) }
  },
  query_lead_database: (a) => sc.dbLeads(dbParams(a, ['hasEmail', 'hasPhone', 'excludeDelivered'])),
  query_local_business_database: (a) =>
    sc.dbLocalBusinesses(dbParams(a, ['hasEmail', 'hasPhone', 'hasWebsite', 'hasContact', 'excludeDelivered'])),
  query_ecommerce_database: (a) =>
    sc.dbEcommerce(dbParams(a, ['hasEmail', 'hasPhone', 'hasInstagram', 'hasFacebook', 'hasTiktok', 'excludeDelivered'])),
}

for (const t of UTILITY_TOOLS) {
  if (!UTILITY_HANDLERS[t.name]) throw new Error(`lib/tools.mjs: no handler for tool ${t.name}`)
}

// Run any tool by name with the same arguments an MCP client would send. Returns the API's answer.
export async function callTool(name, args = {}) {
  if (ENDPOINT_BY_TOOL[name]) return sc.postEndpoint(ENDPOINT_BY_TOOL[name], args)
  const h = UTILITY_HANDLERS[name]
  if (!h) throw new Error(`Unknown tool: ${name}`)
  return h(args || {})
}

// The tool list in OpenAI function-calling format (chat.completions / responses `tools`).
export function openaiTools() {
  return TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

// The tool list in Anthropic Messages API format (`tools` on messages.create).
export function anthropicTools() {
  return TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
}
