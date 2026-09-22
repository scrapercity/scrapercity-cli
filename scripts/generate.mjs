#!/usr/bin/env node
// scripts/generate.mjs — Single-source-of-truth generator for the ScraperCity MCP.
//
// The MCP scraper tools are a PURE PROJECTION of scraperConfigs.ts. Each scraper's
// name, description, params (input schema), endpoint and price are GENERATED from the
// config — there is no hand-written tool list. Add a scraper to the config and its MCP
// tool appears on the next publish; remove it and the tool disappears. Self-healing.
//
// Cross-checked against src/config/scrapers.ts (the live actor registry) + the special
// handlers in [slug].ts, so the config, the registry and the MCP can't diverge.
//
// Usage:  node scripts/generate.mjs [--check]
// Sources (override with env): SCRAPERCITY_CONFIG, SCRAPERCITY_REGISTRY.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CHECK = process.argv.includes('--check')
const log = (...a) => console.log('[generate]', ...a)
const fail = (m) => { console.error('\n[generate] ERROR: ' + m + '\n'); process.exit(1) }

// ── Preserve existing tool NAMES; new scrapers auto-name as scrape_<slug> ──────
const NAME_OVERRIDE = {
  'email-validator': 'validate_emails',
  'email-finder': 'find_emails',
  'mobile-finder': 'find_mobiles',
  'skip-trace': 'find_people',
  'criminal-records': 'search_criminal_records',
  'airbnb-email': 'scrape_airbnb',
  'bizbuysell-scraper': 'scrape_bizbuysell',
  'yelp-scraper': 'scrape_yelp',
  'angi-angies-list-scraper': 'scrape_angi',
  'crexi-scraper': 'scrape_crexi',
}
const toolName = (key) => NAME_OVERRIDE[key] || 'scrape_' + key.replace(/-/g, '_')

// ── Live-registry cross-check config ──────────────────────────
const SPECIAL_HANDLERS = ['criminal-records', 'email-finder', 'mobile-finder'] // live, not in registry
const RETIRED = ['apollo-filters']  // handler returns 503 — intentionally disabled, not in the config
// Scrapers that are real products but whose PUBLIC /api/v1/ path is currently broken
// (works in the dashboard, throws "Launch failed" over the API — e.g. yelp, property-lookup).
// These still SHIP as tools: the MCP is a projection of the config, and they self-heal the
// moment the API (or the docs) is fixed in phase 2. NOT removed — a v1 failure is an app bug
// to fix, not a dead scraper. So this exclusion list is intentionally empty.
const DASHBOARD_ONLY = []
const SLUG_ALIAS = { 'skip-trace': 'people-finder', 'techstack': 'builtwith' }
const canon = (s) => SLUG_ALIAS[s] || s
// Canonical products that are NOT POST /api/v1/scrape/ scrapers (excluded from tools).
const NON_SCRAPER = ['buy-credits', 'database-leads', 'database-enrichment', 'database-local-businesses', 'database-ecommerce']

// ── Price source of truth = the PRICE_PER_*_MICRO env vars ─────
// The backend charges from these (generic path via registry.priceEnv, special handlers
// via their own reads). So the MCP price is DERIVED from the env, and doc prices are
// validated against it. Registry scrapers use registry[key].priceEnv; the rest map here.
const SPECIAL_PRICE_ENV = {
  'email-finder': 'PRICE_PER_EMAIL_FINDER_MICRO',
  'mobile-finder': 'PRICE_PER_MOBILE_FINDER_MICRO',
}
const FIXED_PRICE_MICRO = { 'criminal-records': 1000000 } // handler-hardcoded $1.00

function loadEnv() {
  const cands = [
    process.env.SCRAPERCITY_ENV,
    path.resolve(ROOT, '../scrapercity/.env.local'),
    path.resolve(ROOT, '../../scrapercity/.env.local'),
  ].filter(Boolean)
  for (const c of cands) {
    if (!fs.existsSync(c)) continue
    const m = {}
    for (const line of fs.readFileSync(c, 'utf-8').split('\n')) {
      const mm = /^\s*(PRICE_PER_[A-Z0-9_]+)\s*=\s*(\d+)/.exec(line)
      if (mm) m[mm[1]] = parseInt(mm[2], 10)
    }
    return { path: c, env: m }
  }
  return { path: null, env: {} }
}
function priceMicroForKey(key, registry, env) {
  const reg = registry[key] && registry[key].priceEnv
  if (reg && env[reg] != null) return env[reg]
  const sp = SPECIAL_PRICE_ENV[key]
  if (sp && env[sp] != null) return env[sp]
  if (FIXED_PRICE_MICRO[key] != null) return FIXED_PRICE_MICRO[key]
  return null
}
const fmtDollars = (micro) => ('$' + (micro / 1_000_000).toFixed(4)).replace(/0+$/, '').replace(/\.$/, '')
function formatEnvPrice(configPrice, micro) {
  const s = fmtDollars(micro)
  return /\$[\d,]+(\.\d+)?/.test(configPrice) ? configPrice.replace(/\$[\d,]+(\.\d+)?/, s) : `${s} (${configPrice})`
}
function parsePriceMicro(configPrice) {
  const mm = /\$([\d,]+(?:\.\d+)?)/.exec(configPrice || '')
  return mm ? Math.round(parseFloat(mm[1].replace(/,/g, '')) * 1_000_000) : null
}

// ── Load a TS data module by stripping its types ──────────────
async function loadTs(file, exportName, stripAnnotation) {
  let src = fs.readFileSync(file, 'utf-8')
  src = src.replace(/^export type [\s\S]*?^};[ \t]*$/gm, '')
  src = src.replace(stripAnnotation, `export const ${exportName} =`)
  src = src.replace(/^\s*import\s+type\b.*$/gm, '')
  const tmp = path.join(os.tmpdir(), `sc-${exportName}-${process.pid}-${Date.now()}.mjs`)
  fs.writeFileSync(tmp, src)
  try {
    const mod = await import(pathToFileURL(tmp).href)
    const val = mod[exportName]
    if (!val || typeof val !== 'object') fail(`${file}: '${exportName}' export empty/invalid.`)
    return val
  } catch (e) { fail(`Failed to load ${file}: ${e.message}`) }
  finally { try { fs.unlinkSync(tmp) } catch {} }
}
function findFile(env, ...rels) {
  const cands = [process.env[env], ...rels.map(r => path.resolve(ROOT, r))].filter(Boolean)
  for (const c of cands) if (fs.existsSync(c)) return c
  fail(`Could not find source for ${env}. Set ${env} or clone the app repo beside this one.\n  Looked: ${cands.join(', ')}`)
}

// ── param (config) -> JSON-schema property ────────────────────
function paramSchema(p) {
  const base = (t) => ({ string: 'string', number: 'number', boolean: 'boolean', object: 'object' }[t] || 'string')
  let s
  if (/\[\]$/.test(p.type)) s = { type: 'array', items: { type: base(p.type.slice(0, -2)) } }
  else s = { type: base(p.type) }
  if (p.description) s.description = p.description
  return s
}
const planNote = (price) => { const m = /Included with (\$[\d,]+\/mo)/i.exec(price); return m ? m[1] : null }

async function main() {
  const cfgPath = findFile('SCRAPERCITY_CONFIG',
    '../scrapercity/src/components/ApiDocumentation/scraperConfigs.ts',
    '../../scrapercity/src/components/ApiDocumentation/scraperConfigs.ts')
  const regPath = findFile('SCRAPERCITY_REGISTRY',
    '../scrapercity/src/config/scrapers.ts', '../../scrapercity/src/config/scrapers.ts')
  log('config:', cfgPath)
  log('registry:', regPath)
  const cfg = await loadTs(cfgPath, 'scraperConfigs', /export const scraperConfigs\s*:\s*[^=]+=/)
  const registry = await loadTs(regPath, 'scrapers', /export const scrapers\s*:\s*[^=]+=/)

  // Endpoint sanity — malformed endpoint is a HARD FAIL (fix the config, don't route around).
  const bad = Object.entries(cfg).filter(([, c]) => c.endpoint && !/^\/api\/v1\//.test(c.endpoint))
  if (bad.length) fail('Malformed endpoint(s) in scraperConfigs.ts (must start with /api/v1/):\n    ' +
    bad.map(([k, c]) => `${k}: "${c.endpoint}"`).join('\n    ') + '\n  Fix the config and redeploy the app.')

  // Which config entries are POST /api/v1/scrape/ scrapers we expose as tools.
  const scraperKeys = Object.keys(cfg).filter(k =>
    /^\/api\/v1\/scrape\//.test(cfg[k].endpoint || '') &&
    !RETIRED.includes(k) && !DASHBOARD_ONLY.includes(k) && !NON_SCRAPER.includes(k))

  // Cross-check: exposed scraper set == live registry (+ special handlers).
  const liveCanon = new Set([...Object.keys(registry), ...SPECIAL_HANDLERS].map(canon))
  const toolCanon = new Set(scraperKeys.map(canon))
  const phantom = [...toolCanon].filter(s => !liveCanon.has(s))
  const missing = [...liveCanon].filter(s => !toolCanon.has(s) && !RETIRED.includes(s) && !DASHBOARD_ONLY.includes(s))
  if (phantom.length || missing.length) fail(
    'Config scraper set != live registry (src/config/scrapers.ts + handlers):\n' +
    (phantom.length ? '  PHANTOM (documented, not a live scraper): ' + phantom.join(', ') + '\n' : '') +
    (missing.length ? '  MISSING (live scraper, not documented): ' + missing.join(', ') + '\n' : '') +
    '  Reconcile scraperConfigs.ts with the registry.')

  // Build the generated tool defs + endpoint map — a pure projection of the config.
  const { path: envPath, env: ENVMAP } = loadEnv()
  const priceMismatches = []
  const TOOLS = []
  const ENDPOINT_BY_TOOL = {}
  const names = new Set()
  for (const key of scraperKeys) {
    const c = cfg[key]
    const name = toolName(key)
    if (names.has(name)) fail(`Duplicate generated tool name "${name}" (key ${key}). Add a NAME_OVERRIDE.`)
    names.add(name)
    const properties = {}, required = []
    for (const p of (c.parameters || [])) {
      properties[p.name] = paramSchema(p)
      if (p.required) required.push(p.name)
    }
    // Price: derive from the env micro (source of truth); fall back to the doc price.
    const micro = priceMicroForKey(key, registry, ENVMAP)
    const displayPrice = micro != null ? formatEnvPrice(c.price, micro) : c.price
    if (micro != null) {
      const docMicro = parsePriceMicro(c.price)
      if (docMicro != null && docMicro !== micro) {
        priceMismatches.push(`${key}: docs "${c.price}" (${fmtDollars(docMicro)}) vs charged ${fmtDollars(micro)} — fix the doc price`)
      }
    }
    const plan = planNote(c.price)
    const cost = plan ? `Included with the ${plan} plan.` : `Cost: ${displayPrice}.`
    const tool = {
      name,
      description: `${(c.description || c.name).trim()} ${cost}`,
      inputSchema: required.length ? { type: 'object', properties, required } : { type: 'object', properties },
    }
    TOOLS.push(tool)
    ENDPOINT_BY_TOOL[name] = c.endpoint
  }
  log(envPath ? `prices sourced from ${envPath}` : 'WARNING: no .env.local found — MCP prices fell back to scraperConfigs display values')

  // ENDPOINTS (by config slug) — still used by the CLI's per-command client fns.
  const ENDPOINTS = {}
  for (const [k, c] of Object.entries(cfg)) if (c.endpoint) ENDPOINTS[k] = c.endpoint

  const out =
    '// AUTO-GENERATED by scripts/generate.mjs — DO NOT EDIT BY HAND.\n' +
    '// Source of truth: scraperConfigs.ts (+ src/config/scrapers.ts). Regenerate: npm run generate\n' +
    `// Generated: ${new Date().toISOString()}\n` +
    'export const TOOLS = ' + JSON.stringify(TOOLS, null, 2) + '\n\n' +
    'export const ENDPOINT_BY_TOOL = ' + JSON.stringify(ENDPOINT_BY_TOOL, null, 2) + '\n\n' +
    'export const ENDPOINTS = ' + JSON.stringify(ENDPOINTS, null, 2) + '\n'
  const outPath = path.join(ROOT, 'lib', 'catalog.generated.mjs')
  const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf-8') : ''
  const norm = s => s.replace(/^\/\/ Generated:.*$/m, '')
  const changed = norm(prev) !== norm(out)
  fs.writeFileSync(outPath, out)
  log(`wrote lib/catalog.generated.mjs — ${TOOLS.length} scraper tools generated from the config`)

  // Regenerate doc pricing tables between markers.
  const rows = TOOLS.map(t => `| \`${t.name}\` | ${ENDPOINT_BY_TOOL[t.name]} | ${/Cost: (.*)\.$|the (\$[^ ]+) plan/.exec(t.description)?.[1] || t.description.split('Cost: ')[1]?.replace(/\.$/, '') || ''} |`).join('\n')
  const table = '| Tool | Endpoint | Price |\n|------|----------|-------|\n' + rows
  const START = '<!-- GENERATED:pricing:start -->', END = '<!-- GENERATED:pricing:end -->'
  for (const f of ['SKILL.md', 'AGENT_DOCS.txt', 'README.md']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    let s = fs.readFileSync(p, 'utf-8')
    if (s.includes(START) && s.includes(END)) {
      s = s.replace(new RegExp(START + '[\\s\\S]*?' + END), START + '\n' + table + '\n' + END)
      fs.writeFileSync(p, s); log(`regenerated pricing table in ${f}`)
    }
  }

  log('non-scraper canonical products (not exposed as scraper tools):')
  for (const k of NON_SCRAPER) if (cfg[k]) log(`   - ${k} (${cfg[k].name})`)
  if (priceMismatches.length) {
    log('PRICE MISMATCH — scraperConfigs docs disagree with the charged (env) price:')
    for (const m of priceMismatches) log(`   ! ${m}`)
  }
  if (DASHBOARD_ONLY.length) {
    log('DASHBOARD-ONLY — live in the registry but NOT usable over /api/v1/ yet:')
    for (const s of DASHBOARD_ONLY) log(`   ! ${s}  <-- re-appears in the MCP automatically once it works over /api/v1/ and is put back in scraperConfigs.ts`)
  }
  if (CHECK && changed) fail('catalog changed — regenerated. Commit lib/catalog.generated.mjs (+ regenerated docs), then re-publish.')
  log('OK')
}
main()
