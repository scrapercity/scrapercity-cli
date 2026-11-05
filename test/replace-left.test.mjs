// test/replace-left.test.mjs - run with: node --test test/replace-left.test.mjs
// Before sending (Nov 5 2026): the Lead Database tool takes replaceLeftContacts (a run that swaps contacts who have left for
// the person in that role now), every database tool tells the agent to check before sending, and the CLI takes
// --replace-left-contacts. No request leaves the machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAPTURE_MOD = path.join(ROOT, 'test', 'fetch-capture.mjs')

async function withFetch(run) {
  const calls = []
  const prev = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET' }); return new Response('{"data":[]}', { status: 200 }) }
  process.env.SCRAPERCITY_API_KEY = 'k'
  try { await run() } finally { globalThis.fetch = prev }
  return calls
}

test('query_lead_database sends replaceLeftContacts as a string boolean, and only when asked', async () => {
  const sdk = await import('scrapercity')
  const calls = await withFetch(async () => {
    await sdk.callTool('query_lead_database', { title: 'Owner', industry: ['construction'], replaceLeftContacts: true, limit: 5 })
    await sdk.callTool('query_lead_database', { title: 'Owner', limit: 5 })
  })
  assert.equal(new URL(calls[0].url).searchParams.get('replaceLeftContacts'), 'true')
  assert.equal(new URL(calls[1].url).searchParams.get('replaceLeftContacts'), null)
})

test('every database tool tells the agent to check the leads before sending; the Lead Database tool offers the replacement run', async () => {
  const { UTILITY_TOOLS } = await import('../lib/utilityTools.mjs')
  const tool = n => UTILITY_TOOLS.find(t => t.name === n)
  for (const n of ['query_lead_database', 'query_local_business_database', 'query_ecommerce_database']) {
    assert.match(tool(n).description, /^BEFORE YOU SEND ANY OUTREACH, DO THIS: 1\. /)
    assert.match(tool(n).description, /"valid" AND whose (email_)?checked_on (date )?is within the last 30 days/)
    assert.match(tool(n).description, /through validate_emails/)
    assert.match(tool(n).description, /Never send to "invalid"/)
    assert.equal(/[–—]/.test(tool(n).description), false)
  }
  const p = tool('query_lead_database').inputSchema.properties.replaceLeftContacts
  assert.equal(p.type, 'boolean')
  assert.match(p.description, /check_run_status/)
  assert.match(tool('query_lead_database').description, /replaceLeftContacts/)
})

test('the Python SDK carries the same query_lead_database and sends the setting as a string boolean', async () => {
  const { UTILITY_TOOLS } = await import('../lib/utilityTools.mjs')
  const py = fs.readFileSync(path.join(ROOT, 'python', 'scrapercity', '_catalog.py'), 'utf-8')
  const pyTools = JSON.parse(JSON.parse(py.match(/^TOOLS = json\.loads\((".*")\)$/m)[1]))
  assert.deepEqual(pyTools.find(t => t.name === 'query_lead_database'), UTILITY_TOOLS.find(t => t.name === 'query_lead_database'))
  assert.match(fs.readFileSync(path.join(ROOT, 'python', 'scrapercity', 'tools.py'), 'utf-8'), /"query_lead_database".*"replaceLeftContacts"/)
})

test('CLI db-leads passes --replace-left-contacts', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-')), 'req.jsonl')
  fs.writeFileSync(file, '')
  execFileSync(process.execPath, ['--import', CAPTURE_MOD, path.join(ROOT, 'bin', 'cli.mjs'), 'db-leads', '--title', 'Owner', '--replace-left-contacts'],
    { env: { ...process.env, SC_CAPTURE: file, SCRAPERCITY_API_KEY: 'k' }, stdio: 'pipe' })
  const [r] = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  const u = new URL(r.url)
  assert.equal(u.pathname, '/api/v1/database/leads')
  assert.equal(u.searchParams.get('replaceLeftContacts'), 'true')
})
