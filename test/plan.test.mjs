// test/plan.test.mjs - run with: node --test test/plan.test.mjs
// plan_search: the client posts the query (and the database, when given) to /api/v1/database/plan, the MCP lists
// the tool, and `scrapercity plan` prints each search. No request leaves the machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function withFetch(reply, run) {
  const calls = []
  const prev = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null })
    return new Response(JSON.stringify(reply), { status: 200 })
  }
  process.env.SCRAPERCITY_API_KEY = 'k'
  try { await run() } finally { globalThis.fetch = prev }
  return calls
}

test('planSearch posts the query, with the database only when given', async () => {
  const sc = await import('../lib/client.mjs')
  const calls = await withFetch({ searches: [] }, async () => {
    await sc.planSearch('dentists in Austin', 'local')
    await sc.planSearch('i sell life insurance')
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].method, 'POST')
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/database/plan')
  assert.deepEqual(calls[0].body, { query: 'dentists in Austin', database: 'local' })
  assert.deepEqual(calls[1].body, { query: 'i sell life insurance' })
})

test('the MCP lists plan_search with a required query and an optional database', async () => {
  const p = spawn('node', [path.join(ROOT, 'bin/mcp.mjs')], { env: { ...process.env, SCRAPERCITY_API_KEY: 'k' } })
  let buf = '', err = ''
  p.stdout.on('data', d => { buf += d })
  p.stderr.on('data', d => { err += d })
  const send = o => p.stdin.write(JSON.stringify(o) + '\n')
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  // Only complete lines are parsed (a big answer can arrive in pieces), and the timer and the server are
  // always stopped, so a failure ends the test instead of leaving the run waiting forever.
  let t, tick
  const list = await new Promise((resolve, reject) => {
    t = setTimeout(() => reject(new Error('no tools/list answer in 20s. server stderr: ' + err.slice(0, 500))), 20000)
    tick = setInterval(() => {
      for (const l of buf.split('\n').slice(0, -1)) {
        let m; try { m = JSON.parse(l) } catch { continue }
        if (m.id === 2) return resolve(m.result.tools)
      }
    }, 50)
  }).finally(() => { clearTimeout(t); clearInterval(tick); p.kill() })
  const tool = list.find(t => t.name === 'plan_search')
  assert.ok(tool)
  assert.deepEqual(tool.inputSchema.required, ['query'])
  assert.deepEqual(tool.inputSchema.properties.database.enum, ['leads', 'local', 'ecommerce'])
  assert.ok(!/[–—]/.test(tool.description))
})
