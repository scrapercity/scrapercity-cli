// test/sdk.test.mjs - run with: node --test test/sdk.test.mjs
// The JavaScript SDK: `import ... from 'scrapercity'` resolves, the key can be set in code, every tool
// runs through callTool the same way the MCP runs it, and the MCP serves exactly the same list.
// No request leaves the machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function withFetch(run, reply = { ok: true }) {
  const calls = []
  const prev = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', auth: opts.headers?.Authorization, body: opts.body ? JSON.parse(opts.body) : null })
    return new Response(JSON.stringify(reply), { status: 200 })
  }
  try { await run() } finally { globalThis.fetch = prev }
  return calls
}

test('the package imports by name and exposes the client, the tools and the helpers', async () => {
  const sdk = await import('scrapercity')
  for (const k of ['configure', 'wallet', 'runs', 'status', 'dbLeads', 'planSearch', 'pollUntilDone', 'TOOLS', 'callTool', 'openaiTools', 'anthropicTools', 'ENDPOINT_BY_TOOL']) {
    assert.ok(sdk[k], `missing export ${k}`)
  }
  const deep = await import('scrapercity/lib/client.mjs')
  assert.equal(typeof deep.wallet, 'function')
  const { createRequire } = await import('module')
  const pkg = createRequire(import.meta.url)('scrapercity/package.json')
  assert.equal(pkg.name, 'scrapercity')
})

test('configure({ apiKey }) wins over the env var', async () => {
  const sdk = await import('scrapercity')
  process.env.SCRAPERCITY_API_KEY = 'from-env'
  sdk.configure({ apiKey: 'from-code' })
  const calls = await withFetch(() => sdk.wallet())
  assert.equal(calls[0].auth, 'Bearer from-code')
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/wallet')
  sdk.configure({ apiKey: null })
  const calls2 = await withFetch(() => sdk.wallet())
  assert.equal(calls2[0].auth, 'Bearer from-env')
})

test('callTool sends a scraper tool to its endpoint and a database tool with string booleans', async () => {
  const sdk = await import('scrapercity')
  process.env.SCRAPERCITY_API_KEY = 'k'
  const calls = await withFetch(async () => {
    await sdk.callTool('scrape_maps', { searchStringsArray: ['dentists'], locationQuery: 'Austin, TX' })
    await sdk.callTool('query_lead_database', { title: 'CEO', hasEmail: true, hasPhone: false, excludeDelivered: false, after: 0, limit: 1 })
    await sdk.callTool('check_run_status', { runId: 'r1' })
  })
  assert.equal(calls[0].method, 'POST')
  assert.equal(new URL(calls[0].url).pathname, sdk.ENDPOINT_BY_TOOL.scrape_maps)
  assert.deepEqual(calls[0].body, { searchStringsArray: ['dentists'], locationQuery: 'Austin, TX' })
  const u = new URL(calls[1].url)
  assert.equal(u.pathname, '/api/v1/database/leads')
  assert.equal(u.searchParams.get('hasEmail'), 'true')
  assert.equal(u.searchParams.get('hasPhone'), null)
  assert.equal(u.searchParams.get('excludeDelivered'), null)
  assert.equal(u.searchParams.get('after'), '0')
  assert.equal(new URL(calls[2].url).pathname, '/api/v1/scrape/status/r1')
  await assert.rejects(() => sdk.callTool('no_such_tool', {}), /Unknown tool: no_such_tool/)
})

test('tool names are unique, property names valid, and the OpenAI and Anthropic lists carry every tool', async () => {
  const sdk = await import('scrapercity')
  const names = sdk.TOOLS.map(t => t.name)
  assert.equal(new Set(names).size, names.length)
  for (const t of sdk.TOOLS) for (const k of Object.keys(t.inputSchema.properties || {})) assert.match(k, /^[a-zA-Z0-9_.-]{1,64}$/)
  assert.deepEqual(sdk.openaiTools().map(t => t.function.name), names)
  assert.deepEqual(sdk.anthropicTools().map(t => t.name), names)
  assert.deepEqual(sdk.openaiTools()[0].function.parameters, sdk.TOOLS[0].inputSchema)
})

test('the MCP server lists exactly the SDK tool list', async () => {
  const { TOOLS } = await import('scrapercity')
  const p = spawn('node', [path.join(ROOT, 'bin/mcp.mjs')], { env: { ...process.env, SCRAPERCITY_API_KEY: 'k' } })
  let buf = '', err = ''
  p.stderr.on('data', d => { err += d })
  const send = (m) => p.stdin.write(JSON.stringify(m) + '\n')
  let t
  const listed = await new Promise((resolve, reject) => {
    t = setTimeout(() => reject(new Error('no tools/list answer in 20s. server stderr: ' + err.slice(0, 500))), 20000)
    p.stdout.on('data', d => {
      buf += d
      for (const line of buf.split('\n').slice(0, -1)) {
        let m; try { m = JSON.parse(line) } catch { continue }
        if (m.id === 2) return resolve(m.result.tools)
      }
    })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  }).finally(() => { clearTimeout(t); p.kill() })
  assert.deepEqual(listed.map(t => t.name), TOOLS.map(t => t.name))
})
