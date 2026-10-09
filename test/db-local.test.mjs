// test/db-local.test.mjs - run with: node --test test/db-local.test.mjs
// The Local Business Database in the client and the CLI: a long search goes as a POST with a JSON body (as the
// Lead Database does), and db-local passes --url, --title, --not-category and --box. No request leaves the machine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CAPTURE_MOD = path.join(ROOT, 'test', 'fetch-capture.mjs')

function capture(fn) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-')), 'req.jsonl')
  fs.writeFileSync(file, '')
  return { file, read: () => fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) }
}

async function withFetch(run) {
  const calls = []
  const prev = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null })
    return new Response('{"data":[]}', { status: 200 })
  }
  process.env.SCRAPERCITY_API_KEY = 'k'
  try { await run() } finally { globalThis.fetch = prev }
  return calls
}

test('dbLocalBusinesses: a short search is a GET with repeated keys', async () => {
  const sc = await import('../lib/client.mjs')
  const calls = await withFetch(() => sc.dbLocalBusinesses({ category: ['Dentist', 'Orthodontist'], notCategory: ['Hospital'], city: 'Austin', box: '30.1,-97.9,30.5,-97.5', hasEmail: 'true', page: undefined }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  const u = new URL(calls[0].url)
  assert.equal(u.pathname, '/api/v1/database/local-businesses')
  assert.deepEqual(u.searchParams.getAll('category'), ['Dentist', 'Orthodontist'])
  assert.deepEqual(u.searchParams.getAll('notCategory'), ['Hospital'])
  assert.equal(u.searchParams.get('box'), '30.1,-97.9,30.5,-97.5')
  assert.equal(u.searchParams.has('page'), false)
})

test('dbLocalBusinesses: a long search switches to POST with a JSON body (arrays stay arrays)', async () => {
  const sc = await import('../lib/client.mjs')
  const longUrl = 'https://www.google.com/maps/search/dentists+in+Austin,+TX/@30.26,-97.74,12z/data=' + 'x'.repeat(7000)
  const calls = await withFetch(() => sc.dbLocalBusinesses({ url: longUrl, notCategory: ['Hospital', 'Clinic'], limit: 100, after: '' }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/database/local-businesses')
  assert.equal(new URL(calls[0].url).search, '')
  assert.deepEqual(calls[0].body, { url: longUrl, notCategory: ['Hospital', 'Clinic'], limit: 100 })
})

test('dbLeads still switches to POST for a long search (unchanged)', async () => {
  const sc = await import('../lib/client.mjs')
  const calls = await withFetch(() => sc.dbLeads({ url: 'https://example.com/?' + 'y'.repeat(7000) }))
  assert.equal(calls[0].method, 'POST')
})

test('CLI db-local passes --url, --title, --not-category (comma list) and --box', () => {
  const c = capture()
  execFileSync(process.execPath, ['--import', CAPTURE_MOD, path.join(ROOT, 'bin', 'cli.mjs'), 'db-local',
    '--url', 'https://www.google.com/maps/search/plumbers+in+Denver,+CO', '--title', 'Joe', '--not-category', 'Hospital, Clinic',
    '--box', '30.1,-97.9,30.5,-97.5', '--has-email'],
  { env: { ...process.env, SC_CAPTURE: c.file, SCRAPERCITY_API_KEY: 'k' }, stdio: 'pipe' })
  const [r] = c.read()
  assert.equal(r.method, 'GET')
  const u = new URL(r.url)
  assert.equal(u.pathname, '/api/v1/database/local-businesses')
  assert.equal(u.searchParams.get('url'), 'https://www.google.com/maps/search/plumbers+in+Denver,+CO')
  assert.equal(u.searchParams.get('title'), 'Joe')
  assert.deepEqual(u.searchParams.getAll('notCategory'), ['Hospital', 'Clinic'])
  assert.equal(u.searchParams.get('box'), '30.1,-97.9,30.5,-97.5')
  assert.equal(u.searchParams.get('hasEmail'), 'true')
})

test('CLI db-local prints what a search URL could not use', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-')), 'stub.mjs')
  fs.writeFileSync(file, `globalThis.fetch = async () => new Response(JSON.stringify({ data: [], pagination: { total: 5, page: 1, totalPages: 1, next_after: null }, search_translation: { applied: ['Category: plumber'], approximated: [], not_supported: ['Keyword: open now'] } }), { status: 200 })\n`)
  const out = execFileSync(process.execPath, ['--import', file, path.join(ROOT, 'bin', 'cli.mjs'), 'db-local', '--url', 'https://www.google.com/maps/search/plumbers'],
    { env: { ...process.env, SCRAPERCITY_API_KEY: 'k' }, stdio: 'pipe' }).toString()
  assert.match(out, /Not supported from the search URL: Keyword: open now/)
})

test('CLI db-local: --keyword as typed and --location (semicolons, a place keeps its own commas)', () => {
  const c = capture()
  execFileSync(process.execPath, ['--import', CAPTURE_MOD, path.join(ROOT, 'bin', 'cli.mjs'), 'db-local',
    '--keyword', 'thai restaurant, sushi', '--location', 'Houston, TX; Austin, TX;78701'],
  { env: { ...process.env, SC_CAPTURE: c.file, SCRAPERCITY_API_KEY: 'k' }, stdio: 'pipe' })
  const u = new URL(c.read()[0].url)
  // the list goes as typed; the server splits it (and keeps "plumbers in Austin, TX" whole)
  assert.deepEqual(u.searchParams.getAll('keyword'), ['thai restaurant, sushi'])
  assert.deepEqual(u.searchParams.getAll('location'), ['Houston, TX', 'Austin, TX', '78701'])
})

test('CLI db-local prints how places were read and the Lead Database suggestion', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-')), 'stub.mjs')
  fs.writeFileSync(file, `globalThis.fetch = async () => new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, totalPages: 0, next_after: null }, searched_as: { keywords: [{ text: 'zzz', words: ['zzz'], categories: [], matches_nothing: true }], places: [{ text: 'Houston TX', read_as: 'Houston, Texas, US', kind: 'city' }, { text: 'Nowhere', read_as: 'Nowhere', kind: 'city', not_found: true }] }, lead_database: { count: 420, read_as: 'job title', filters: {}, dashboard_url: 'https://app.scrapercity.com/dashboard/lead-database?title=zzz' } }), { status: 200 })\n`)
  const out = execFileSync(process.execPath, ['--import', file, path.join(ROOT, 'bin', 'cli.mjs'), 'db-local', '--keyword', 'zzz', '--location', 'Houston TX;Nowhere'],
    { env: { ...process.env, SCRAPERCITY_API_KEY: 'k' }, stdio: 'pipe' }).toString()
  assert.match(out, /Places: Houston, Texas, US; Nowhere \(not found\)/)
  assert.match(out, /Keywords no business name or category has: zzz/)
  assert.match(out, /Lead Database has 420 people for this search by job title: https:\/\/app\.scrapercity\.com\/dashboard\/lead-database\?title=zzz/)
})

test('MCP query_local_business_database takes keyword and location (valid property names)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'bin', 'mcp.mjs'), 'utf-8')
  assert.match(src, /keyword: \{ type: 'array', items: \{ type: 'string' \}/)
  assert.match(src, /location: \{ type: 'array', items: \{ type: 'string' \}/)
})
