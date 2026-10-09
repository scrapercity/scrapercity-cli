// test/fetch-capture.mjs - preloaded with `node --import` by the tests: replaces fetch so no request leaves the
// machine, and writes each request (url, method, body) as a JSON line to the file in $SC_CAPTURE.
import fs from 'fs'

globalThis.fetch = async (url, opts = {}) => {
  fs.appendFileSync(process.env.SC_CAPTURE, JSON.stringify({ url: String(url), method: opts.method || 'GET', body: opts.body ?? null }) + '\n')
  return new Response(JSON.stringify({ data: [], pagination: { total: 0, page: 1, totalPages: 0, next_after: null } }), { status: 200 })
}
