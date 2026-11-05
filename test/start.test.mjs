// test/start.test.mjs - run with: node --test test/start.test.mjs
// start_here (v1.0.36): the one tool that works with no API key. It posts to /api/v1/start without an Authorization
// header when there is no key (with one when there is), a busy answer (429) comes back as data, it is the first tool
// the MCP lists, and every other call with no key points to it. No request leaves the machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Runs code in a fresh node with no key anywhere: no SCRAPERCITY_API_KEY and an empty home (no ~/.scrapercityrc),
// so the test holds on a machine that is logged in. fetch is replaced; the code prints its result as JSON.
function runNoKey(code) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-nokey-'))
  const script = `
    const calls = []
    globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null }); return new Response(JSON.stringify({ mode: 'tour' }), { status: 200 }) }
    const sc = await import(${JSON.stringify(path.join(ROOT, 'lib/client.mjs'))})
    const out = {}
    ${code}
    out.calls = calls
    console.log(JSON.stringify(out))`
  const env = { PATH: process.env.PATH, HOME: home }
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }))
}

async function withFetch(status, reply, run) {
  const calls = []
  const prev = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null })
    return new Response(JSON.stringify(reply), { status })
  }
  try { await run() } finally { globalThis.fetch = prev }
  return calls
}

test('start_here with no key: no Authorization header, the query in the body', () => {
  const r = runNoKey(`out.result = await sc.startHere('dentists in Austin')`)
  const c = r.calls[0]
  assert.equal(new URL(c.url).pathname, '/api/v1/start')
  assert.equal(c.method, 'POST')
  assert.deepEqual(c.body, { query: 'dentists in Austin' })
  assert.equal(c.headers.Authorization, undefined)
  assert.equal(r.result.mode, 'tour')
})

test('start_here with a key sends it; a busy answer comes back as data', async () => {
  const sc = await import('../lib/client.mjs')
  sc.configure({ apiKey: 'k1' })
  let out
  const calls = await withFetch(429, { mode: 'tour', error: 'busy' }, async () => { out = await sc.startHere() })
  sc.configure({ apiKey: '' })
  assert.equal(calls[0].headers.Authorization, 'Bearer k1')
  assert.deepEqual(calls[0].body, {})
  assert.equal(out.error, 'busy')
})

test('start_here is the first tool, dispatched without a key', async () => {
  const { TOOLS, callTool } = await import('../lib/tools.mjs')
  assert.equal(TOOLS[0].name, 'start_here')
  assert.match(TOOLS[0].description, /^START HERE/)
  assert.equal(TOOLS[0].inputSchema.required, undefined)
  const calls = await withFetch(200, { ok: 1 }, async () => { await callTool('start_here', { query: 'acme.com' }) })
  assert.deepEqual(calls[0].body, { query: 'acme.com' })
})

test('any other call with no key points to start_here and signup', () => {
  const r = runNoKey(`try { await sc.wallet() } catch (e) { out.error = e.message }`)
  assert.match(r.error, /start_here/)
  assert.match(r.error, /\/signup/)
  assert.equal(r.calls.length, 0)
})

test('a key the API refuses: the error says where to go next', async () => {
  const sc = await import('../lib/client.mjs')
  sc.configure({ apiKey: 'bad' })
  await withFetch(401, { error: 'Invalid or missing API key.', get_started: {} }, async () => {
    await assert.rejects(sc.wallet(), (e) => e.status === 401 && /start_here/.test(e.message) && !!e.data.get_started)
  })
  sc.configure({ apiKey: '' })
})
