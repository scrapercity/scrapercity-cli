// lib/utilityTools.mjs - the hand-written MCP tools (account, runs, databases, lookalikes).
// The scraper tools are generated (lib/catalog.generated.mjs). Both lists are shared by the MCP
// server, the JavaScript SDK (lib/index.mjs) and, through scripts/generate.mjs, the Python SDK.
// Every tool here needs a handler in lib/tools.mjs AND in python/scrapercity/tools.py:
// npm run generate stops if one is missing.
export const UTILITY_TOOLS = [
  {
    name: 'check_wallet',
    description: 'Check account balance, plan, and billing info. Call this FIRST to verify credits before running any scrape.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_runs',
    description: 'List recent scraper runs with status, lead counts, and costs.',
    inputSchema: { type: 'object', properties: {
      hours: { type: 'number', description: 'How many hours back to look (default 24, max 168)', default: 24 },
      limit: { type: 'number', description: 'Max runs to return (default 20, max 100)', default: 20 }
    } }
  },
  {
    name: 'check_run_status',
    description: 'Check the status of a scraper run. Returns status (RUNNING/SUCCEEDED/FAILED/CANCELLED), lead count, and download URL when complete.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: 'The run ID returned when starting a scrape' } }, required: ['runId'] }
  },
  {
    name: 'download_results',
    description: 'Download the CSV results of a completed scraper run. Only works when status is SUCCEEDED.',
    inputSchema: { type: 'object', properties: {
      runId: { type: 'string', description: 'The run ID to download results for' },
      outputPath: { type: 'string', description: 'File path to save CSV (default: {runId}.csv)' }
    }, required: ['runId'] }
  },
  {
    name: 'cancel_run',
    description: 'Cancel a running scraper job.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: 'The run ID to cancel' } }, required: ['runId'] }
  },
  {
    name: 'plan_search',
    description: 'Turn a plain-English request into ready-to-run database searches. Describe who you want ("dentists in Austin", "websites that use Shopify", "CEOs of SaaS companies in Texas") or what you sell ("I sell life insurance"). Returns a few searches, each with its database, filters set to values that database really has, how many records match (leaving out what this account already has), a dashboard link, and apiParams to pass as they are to the matching query tool: query_lead_database for database/leads, query_local_business_database for database/local-businesses, query_ecommerce_database for database/ecommerce. Included with the $149/mo plan, like the database tools. Use it before a database query whenever you are not sure of the exact filter values.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'What you are looking for or what you sell, in plain English' },
      database: { type: 'string', enum: ['leads', 'local', 'ecommerce'], description: 'Optional: plan in this database only (leads = people at companies, local = local businesses, ecommerce = online stores). Leave it out to let the planner pick the databases that fit.' }
    }, required: ['query'] }
  },
  {
    name: 'find_lookalike_groups',
    description: 'Group your customers into lookalike audiences. Send their websites or work emails (mike@acme.com reads acme.com and looks up Mike\'s title). Starts a background job and returns it with its id; then call get_lookalike_groups until status is done. Each group comes with ready-to-run database filters, a match count and the best tool to reach businesses like them. $0.01 per site read, from credits; your balance must cover $0.01 x every site. One job at a time. $149/mo plan and up.',
    inputSchema: { type: 'object', properties: {
      domains: { type: 'array', items: { type: 'string' }, description: 'Your customers\' websites, URLs or work emails. At least 3 company sites.' }
    }, required: ['domains'] }
  },
  {
    name: 'get_lookalike_groups',
    description: 'Read a lookalike job started with find_lookalike_groups: status (running, done, failed), percent, and when done the groups. Each group has name, description, sites (your customers in it), database (leads, local, ecommerce), filters, count and tool. Pass its filters to query_lead_database, query_local_business_database or query_ecommerce_database to pull the records.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'The job id from find_lookalike_groups' }
    }, required: ['id'] }
  },
  {
    name: 'download_lookalike_csv',
    description: 'Save a finished lookalike job (find_lookalike_groups) as a CSV file, one row per uploaded site: whether it was read, what it sells and to whom, business model, industry, keywords, size, country, the contacts from your upload with their titles, and its group. No extra charge.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'The job id from find_lookalike_groups' },
      outputPath: { type: 'string', description: 'File path to save the CSV (default: lookalike-{id}.csv)' }
    }, required: ['id'] }
  },
  {
    name: 'query_lead_database',
    description: 'Query the B2B lead database directly. Returns contacts with names, emails, phones, titles, LinkedIn, Twitter and Facebook profiles, companies (plus company website, phone, revenue, total funding, founded year, HQ location and keywords). Up to 100 per request. Included with the $149/mo plan (100,000 new leads a day; leads you already have do not count again). For a daily pull of only new leads set excludeDelivered=true. For big pulls page with after: send after="0" first, then the pagination.next_after from each response until it is null. Have a saved people-search URL? Pass it as url to search with its filters right away (search_translation in the response says what was applied). Target by the technologies a company\'s website runs: technologies (any of), technologiesAll (all of), notTechnologies (none of), e.g. technologiesAll ["Klaviyo", "PayPal", "Shopify"] with notTechnologies ["Facebook Pixel"].',
    inputSchema: { type: 'object', properties: {
      url: { type: 'string', description: 'A people-search URL (the address of a people search with its filters). Its filters become the search; any other filter you pass overrides the matching one.' },
      title: { type: 'string', description: 'Job title filter, comma separated for several (partial match, e.g. "CEO, Founder")' },
      industry: { type: 'array', items: { type: 'string' }, description: 'Company industries (any match)' },
      country: { type: 'array', items: { type: 'string' }, description: 'Person countries, full names like "United States" (US, USA, UK, UAE also work)' },
      state: { type: 'array', items: { type: 'string' }, description: 'Person states' },
      city: { type: 'string', description: 'Person city, comma separated for several' },
      companyName: { type: 'string', description: 'Company name' },
      companyDomain: { type: 'string', description: 'Company domain(s), comma separated' },
      seniority: { type: 'array', items: { type: 'string' }, description: 'e.g. ["vp", "director", "c_suite"]' },
      department: { type: 'array', items: { type: 'string' }, description: 'e.g. ["sales", "engineering"]' },
      minEmployees: { type: 'number', description: 'Minimum company employee count' },
      maxEmployees: { type: 'number', description: 'Maximum company employee count' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Company keywords/tags, any match (e.g. ["saas", "fintech"])' },
      revenueMin: { type: 'number', description: 'Minimum company annual revenue, USD' },
      revenueMax: { type: 'number', description: 'Maximum company annual revenue, USD' },
      companyCountry: { type: 'array', items: { type: 'string' }, description: 'Company HQ countries (not where the person is)' },
      companyState: { type: 'array', items: { type: 'string' }, description: 'Company HQ states' },
      companyCity: { type: 'string', description: 'Company HQ city' },
      notTitle: { type: 'string', description: 'Exclude titles containing any of these (comma separated)' },
      notKeywords: { type: 'array', items: { type: 'string' }, description: 'Exclude companies with any of these keywords' },
      notIndustry: { type: 'array', items: { type: 'string' }, description: 'Exclude these industries' },
      technologies: { type: 'array', items: { type: 'string' }, description: 'Companies whose website runs ANY of these technologies, e.g. ["HubSpot"]' },
      technologiesAll: { type: 'array', items: { type: 'string' }, description: 'Companies whose website runs ALL of these technologies, e.g. ["Klaviyo", "PayPal"] (keep it to 1-3)' },
      notTechnologies: { type: 'array', items: { type: 'string' }, description: 'Leave out companies whose website runs any of these technologies, e.g. ["Facebook Pixel"]' },
      socialUrl: { type: 'string', description: 'Match a social profile URL' },
      hasEmail: { type: 'boolean', description: 'Only contacts with email' },
      hasPhone: { type: 'boolean', description: 'Only contacts with phone' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 },
      excludeDelivered: { type: 'boolean', description: 'Skip leads this account already has (from the API or unlocked in the dashboard). With this on, keep page at 1 or use after.' },
      after: { type: 'string', description: 'Cursor paging: return leads after this lead id. Use "0" to start, then the pagination.next_after from each response.' }
    } }
  },
  {
    name: 'query_local_business_database',
    description: 'Query the local business database directly. Returns businesses with phone numbers, emails, websites, addresses and ratings, many with a named contact person. Up to 100 per request. Included with the $149/mo plan (100,000 new businesses a day; businesses you already have do not count again). Set hasContact=true for only businesses with a named contact person. For a daily pull of only new businesses set excludeDelivered=true. For big pulls page with after: send after="0" first, then the pagination.next_after from each response until it is null. Search the way you would on Google Maps: keyword (what the businesses do or are called, e.g. ["thai restaurant"]) and location (cities, states, countries or postal codes, e.g. ["Houston TX", "Austin TX"]); searched_as in the response says how each was read. A search that finds nothing also returns lead_database: the same search in the Lead Database when it has 100+ people. Have a Google Maps search URL? Pass it as url to search with its keyword and place right away (search_translation in the response says what was applied).',
    inputSchema: { type: 'object', properties: {
      keyword: { type: 'array', items: { type: 'string' }, description: 'What the businesses do or are called, as typed on Google Maps, e.g. ["thai restaurant", "sushi"]. Matches business names and categories; any keyword. A place inside a keyword ("plumbers in Austin TX") is used as the location when no location is given.' },
      location: { type: 'array', items: { type: 'string' }, description: 'Cities, states, countries or postal codes, as typed, e.g. ["Houston TX", "78701", "Ontario", "Germany"] (up to 2,000; any of them).' },
      url: { type: 'string', description: 'A Google Maps search URL (the address of a search on Google Maps). Its keyword and place become the search; any other filter you pass overrides the matching one.' },
      category: { type: 'array', items: { type: 'string' }, description: 'Business categories, e.g. ["Dentist"]. A word also finds categories that contain it ("restaurant" finds "Mexican restaurant")' },
      country: { type: 'array', items: { type: 'string' }, description: 'Two-letter country codes, e.g. ["US"]' },
      state: { type: 'string', description: 'State or region, comma separated for several (US abbreviations work, e.g. "TX")' },
      city: { type: 'string', description: 'City (partial match)' },
      postalCode: { type: 'string', description: 'Postal or zip code' },
      box: { type: 'string', description: 'A map area as "minLat,minLng,maxLat,maxLng" (e.g. "30.1,-97.9,30.5,-97.5"). Only businesses inside it.' },
      query: { type: 'string', description: 'Search business names and descriptions' },
      title: { type: 'string', description: 'Business name, comma separated for several (partial match)' },
      notCategory: { type: 'array', items: { type: 'string' }, description: 'Exclude these business categories' },
      minRating: { type: 'number', description: 'Minimum Google rating (1-5)' },
      maxRating: { type: 'number', description: 'Maximum Google rating (1-5)' },
      minReviews: { type: 'number', description: 'Minimum number of reviews' },
      maxReviews: { type: 'number', description: 'Maximum number of reviews' },
      hasEmail: { type: 'boolean', description: 'Only businesses with an email address' },
      hasPhone: { type: 'boolean', description: 'Only businesses with a phone number' },
      hasWebsite: { type: 'boolean', description: 'Only businesses with a website' },
      hasContact: { type: 'boolean', description: 'Only businesses with a named contact person' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 },
      excludeDelivered: { type: 'boolean', description: 'Skip businesses this account already has (from the API or unlocked in the dashboard). With this on, keep page at 1 or use after.' },
      after: { type: 'string', description: 'Cursor paging: return businesses after this id. Use "0" to start, then the pagination.next_after from each response.' }
    } }
  },
  {
    name: 'query_ecommerce_database',
    description: 'Query the ecommerce store database directly. Returns online stores with platform, estimated monthly sales and visits, employee count, emails, phones and social links. Up to 100 per request. Included with the $149/mo plan (100,000 new stores a day; stores you already have do not count again). For a daily pull of only new stores set excludeDelivered=true. For big pulls page with after: send after="0" first, then the pagination.next_after from each response until it is null. Combine technologies (any of), technologiesAll (all of) and notTechnologies (none of) for exact targeting, e.g. technologiesAll ["Klaviyo", "PayPal"] with notTechnologies ["Facebook Pixel"].',
    inputSchema: { type: 'object', properties: {
      platform: { type: 'array', items: { type: 'string' }, description: 'Ecommerce platforms, e.g. ["shopify", "woocommerce"] (any match)' },
      country: { type: 'array', items: { type: 'string' }, description: 'Two-letter country codes, e.g. ["US"]' },
      state: { type: 'string', description: 'State (partial match)' },
      city: { type: 'string', description: 'City (partial match)' },
      category: { type: 'array', items: { type: 'string' }, description: 'Store categories (any match)' },
      merchant: { type: 'string', description: 'Merchant name (partial match)' },
      domain: { type: 'string', description: 'Store domain(s), comma or space separated' },
      technologies: { type: 'array', items: { type: 'string' }, description: 'Technologies the store uses (any match)' },
      technologiesAll: { type: 'array', items: { type: 'string' }, description: 'Stores that run ALL of these technologies, e.g. ["Klaviyo", "PayPal"]' },
      notTechnologies: { type: 'array', items: { type: 'string' }, description: 'Leave out stores that run any of these technologies, e.g. ["Facebook Pixel"]' },
      planExclude: { type: 'array', items: { type: 'string' }, description: 'Exclude stores on these plan tiers, e.g. ["Shopify Plus"]' },
      salesMin: { type: 'number', description: 'Minimum estimated monthly sales, USD' },
      salesMax: { type: 'number', description: 'Maximum estimated monthly sales, USD' },
      visitsMin: { type: 'number', description: 'Minimum estimated monthly visits' },
      visitsMax: { type: 'number', description: 'Maximum estimated monthly visits' },
      employeesMin: { type: 'number', description: 'Minimum employee count' },
      employeesMax: { type: 'number', description: 'Maximum employee count' },
      hasEmail: { type: 'boolean', description: 'Only stores with an email address' },
      hasPhone: { type: 'boolean', description: 'Only stores with a phone number' },
      hasInstagram: { type: 'boolean', description: 'Only stores with Instagram' },
      hasFacebook: { type: 'boolean', description: 'Only stores with Facebook' },
      hasTiktok: { type: 'boolean', description: 'Only stores with TikTok' },
      page: { type: 'number', description: 'Page number (default 1)', default: 1 },
      limit: { type: 'number', description: 'Results per page (max 100)', default: 50 },
      excludeDelivered: { type: 'boolean', description: 'Skip stores this account already has (from the API or unlocked in the dashboard). With this on, keep page at 1 or use after.' },
      after: { type: 'string', description: 'Cursor paging: return stores after this id. Use "0" to start, then the pagination.next_after from each response.' }
    } }
  }
]
