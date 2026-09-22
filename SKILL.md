# ScraperCity - B2B Lead Generation

## Setup
```bash
export SCRAPERCITY_API_KEY="your_key"   # get from app.scrapercity.com/dashboard/api-docs
npx scrapercity wallet                   # verify balance
```

## Core Pattern
Every scraper follows: **start → poll → download**
```
POST /api/v1/scrape/{slug}  →  { runId }
GET  /api/v1/scrape/status/{runId}  →  { status, handled, outputUrl }
GET  /api/downloads/{runId}  →  CSV file
```
Auth: `Authorization: Bearer $SCRAPERCITY_API_KEY` on all requests.

## Pricing (auto-generated from the live catalog — do not edit)

<!-- GENERATED:pricing:start -->
| Tool | Endpoint | Price |
|------|----------|-------|
| `scrape_apollo` | /api/v1/scrape/apollo | $0.0039 per lead |
| `scrape_website_finder` | /api/v1/scrape/website-finder | $0.0499 per contact found |
| `find_people` | /api/v1/scrape/skip-trace | $0.0199 per result (searches with 0 matches are billed as 1 result) |
| `scrape_distress_list` | /api/v1/scrape/distress-list | $0.05 per property |
| `validate_emails` | /api/v1/scrape/email-validator | $0.0072 per email |
| `scrape_maps` | /api/v1/scrape/maps | $0.01 per business |
| `scrape_airbnb` | /api/v1/scrape/airbnb-email | $0.019 per result ($19.00 per 1,000) |
| `scrape_bizbuysell` | /api/v1/scrape/bizbuysell-scraper | $0.0099 per listing |
| `scrape_crexi` | /api/v1/scrape/crexi-scraper | $0.029 per property |
| `scrape_angi` | /api/v1/scrape/angi-angies-list-scraper | $0.0099 per listing |
| `scrape_yelp` | /api/v1/scrape/yelp-scraper | $0.0099 per result |
| `scrape_zillow_agents` | /api/v1/scrape/zillow-agents | $0.029 per agent |
| `scrape_property_lookup` | /api/v1/scrape/property-lookup | $0.15 per property (+$0.10 for owner contact) |
| `search_criminal_records` | /api/v1/scrape/criminal-records | .00 per search (only charged if records found) |
| `scrape_store_leads` | /api/v1/scrape/store-leads | $0.0039 per lead |
| `scrape_builtwith` | /api/v1/scrape/techstack | $4.99 per technology |
| `find_emails` | /api/v1/scrape/email-finder | $0.05 per email found (FREE if not found) |
| `find_mobiles` | /api/v1/scrape/mobile-finder | $0.25 per number found (FREE if not found) |
<!-- GENERATED:pricing:end -->

## All Scrapers (POST to /api/v1/scrape/{slug})

| Slug | Input | Cost | Speed |
|------|-------|------|-------|
| `apollo` | `{url, count, fileName}` | $0.0039/lead | ~4 DAYS (use webhook) |
| `apollo-filters` | `{seniorityLevel, functionDept, companyIndustry, personCountry, personState, companySize, personTitles[], companyDomains[], count}` | $0.0039/lead | ~4 DAYS |
| `maps` | `{searchStringsArray:["query"], locationQuery, maxCrawledPlacesPerSearch}` | $0.01/place | 5-30 min |
| `email-validator` | `{emails:["a@b.com"]}` | $0.0036/email | 1-10 min |
| `email-finder` | `{contacts:[{first_name,last_name,domain}], autoValidateEmails, autoFindMobiles}` | $0.05/contact | 1-10 min |
| `mobile-finder` | `{inputs:["linkedin.com/in/x","email@co.com"]}` | $0.25/input | 1-5 min |
| `people-finder` | `{name:[], email:[], phone_number:[], street_citystatezip:[], max_results}` | $0.02/result | 2-10 min |
| `store-leads` | `{platform, countryCode, totalLeads, emails:true, phones:true}` | $0.0039/lead | instant |
| `builtwith` | `{technology}` | $4.99 flat | 1-5 min |
| `criminal-records` | `{name, state, dob}` | $1.00 if found | 2-5 min |
| `airbnb-email` | `{mode:"city", city:["Miami, FL"], maxResults:100}` | $0.0001/listing | 10-30 min |
| `youtube-email` | `{channels:["@Handle","https://youtube.com/@X"]}` | per channel | 5-15 min |
| `website-finder` | `{domains:["acme.com"], jobTitle:"CEO"}` | per domain | 5-15 min |
| `yelp-scraper` | `{searchTerms:["plumbers"], locations:["Denver, CO"], searchLimit:10}` | $0.01/listing | 5-15 min |
| `angi-angies-list-scraper` | `{keyword, zipCodes:["80202"], maxItems:100}` | $0.01/listing | 5-15 min |
| `zillow-agents` | `{location:"Denver, CO", specialty, searchLimit:10}` | per agent | 5-15 min |
| `bizbuysell-scraper` | `{startUrls:["<search-url>"], maxItems:100}` | $0.01/listing | 5-15 min |
| `crexi-scraper` | `{startUrls:["<search-url>"]}` | $0.029/listing | 5-15 min |
| `property-lookup` | `{addresses:["123 Main St, City, ST 12345"], includeOwnerContact:false}` | $0.15/address | 2-10 min |

## ⚠ Apollo Delivery
Apollo scrapes take **up to 4 days** to deliver. Do NOT poll in a loop.
- Set up a webhook at `app.scrapercity.com/dashboard/webhooks`
- Webhook fires when results are ready with `{runId, fileName, leadsCount}`
- If you must poll, check once per hour max

## Other Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/wallet` | Balance, plan, billing |
| GET | `/api/v1/runs?hours=24&limit=50` | Recent runs |
| POST | `/api/v1/scrape/cancel/{runId}` | Cancel running job |
| GET | `/api/v1/scrape/logs/{runId}` | Run logs |
| GET | `/api/v1/apollo-status` | Apollo service health |
| GET | `/api/v1/database/leads?title=CTO&country=US&hasEmail=true&page=1&limit=100` | Lead DB ($649 plan, 100k/day) |
| GET | `/api/v1/database/local-businesses?...` | Local biz DB ($649 plan) |
| GET | `/api/v1/database/ecommerce?...` | Ecommerce DB ($649 plan) |

## Status Values
`RUNNING` → `SUCCEEDED` or `FAILED` or `CANCELLED`

## Error Codes
- `401` - bad or missing API key
- `402` - insufficient balance (check wallet first)
- `403` - account cancelled or charge processing
- `409` - duplicate request (same search submitted recently)
- `429` - rate limited / duplicate within 30s
- `503` - service temporarily unavailable

## CLI Shorthand
```bash
scrapercity maps -q "plumbers" -l "Denver, CO" --limit 500
scrapercity yelp -q "dentists" -l "Austin, TX"
scrapercity airbnb --city "Miami, FL" --limit 200
scrapercity youtube-email @MrBeast @PewDiePie
scrapercity website-finder acme.com example.com --title "CEO"
scrapercity angi -q "electricians" --zips "90210,90211"
scrapercity zillow-agents -l "Denver, CO"
scrapercity bizbuysell <bizbuysell-search-url>
scrapercity crexi <crexi-search-url>
scrapercity property-lookup "123 Main St, Denver, CO 80202" --owner-contact
scrapercity poll <runId>          # polls until done
scrapercity download <runId>      # saves CSV
```

## Tips
- Always check `wallet` before large scrapes to avoid 402 errors
- Apollo URL must be from apollo.io People search - other pages rejected
- Maps: split large metro areas into sub-cities for better coverage
- Email validator: dedupes automatically, only charges for unique emails
- Store leads: zero COGS (cached DB), instant results
- Yelp/Angi: can also pass directUrls instead of search terms
- YouTube: accepts both @handles and full channel URLs
- Website finder: domains only, no https:// prefix needed
- Property lookup: full address with city, state, zip required
- Downloads return CSV with all available fields
