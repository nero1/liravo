/**
 * Liravo API Endpoint Existence Tests
 * Scaffold — not real integration tests. Verifies routes are registered and respond.
 * Run: LIRAVO_BASE_URL=http://localhost:3000 npx tsx tests/api.test.ts
 */

const BASE_URL = process.env.LIRAVO_BASE_URL ?? 'http://localhost:3000';

interface EndpointCheck {
  method: string;
  path: string;
  expectedStatus: number;
  note?: string;
}

const endpoints: EndpointCheck[] = [
  // Health check
  { method: 'GET', path: '/api/health', expectedStatus: 200, note: 'Health endpoint' },

  // Auth (should redirect or return 405 for GET on POST routes)
  { method: 'GET', path: '/api/auth/callback', expectedStatus: 302, note: 'Auth callback — redirects without code' },

  // Books
  { method: 'GET', path: '/api/books/search?q=test', expectedStatus: 200, note: 'Book search' },

  // Stats (requires auth — expect 401)
  { method: 'GET', path: '/api/stats/reading', expectedStatus: 401, note: 'Reading stats — auth required' },

  // Subscriptions (requires auth — expect 401 on POST)
  { method: 'POST', path: '/api/subscriptions/create', expectedStatus: 401, note: 'Create subscription — auth required' },
  { method: 'POST', path: '/api/subscriptions/cancel', expectedStatus: 401, note: 'Cancel subscription — auth required' },

  // Earnings (requires auth)
  { method: 'GET', path: '/api/earnings', expectedStatus: 401, note: 'Earnings — auth required' },
  { method: 'POST', path: '/api/earnings/request-payout', expectedStatus: 401, note: 'Payout request — auth required' },

  // AI (requires auth)
  { method: 'POST', path: '/api/ai/taste-profile', expectedStatus: 401, note: 'Taste profile — auth required' },

  // Admin (requires auth + admin)
  { method: 'GET', path: '/api/admin/users', expectedStatus: 401, note: 'Admin users — auth required' },
  { method: 'GET', path: '/api/admin/feature-flags', expectedStatus: 401, note: 'Feature flags — auth required' },
  { method: 'GET', path: '/api/admin/affiliate-stores', expectedStatus: 401, note: 'Affiliate stores — auth required' },

  // Cron (requires CRON_SECRET)
  { method: 'POST', path: '/api/cron/taste-profiles', expectedStatus: 401, note: 'Taste profiles cron — secret required' },
  { method: 'POST', path: '/api/cron/affiliate-health', expectedStatus: 401, note: 'Affiliate health cron — secret required' },

  // Webhooks (requires secret)
  { method: 'POST', path: '/api/subscriptions/webhook', expectedStatus: 401, note: 'Subscription webhook — secret required' },
  { method: 'POST', path: '/api/webhooks/promoted-listings', expectedStatus: 401, note: 'Promoted listings webhook — secret required' },
];

async function runTests() {
  console.log(`\nAPI Endpoint Tests — ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const endpoint of endpoints) {
    const url = `${BASE_URL}${endpoint.path}`;
    try {
      const res = await fetch(url, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        // Don't follow redirects — we want to see the actual status
        redirect: 'manual',
      });

      const status = res.status;

      if (status === endpoint.expectedStatus) {
        console.log(`  PASS  [${endpoint.method}] ${endpoint.path} → ${status}`);
        if (endpoint.note) console.log(`        ${endpoint.note}`);
        passed++;
      } else {
        console.error(`  FAIL  [${endpoint.method}] ${endpoint.path}`);
        console.error(`        Expected: ${endpoint.expectedStatus}, Got: ${status}`);
        if (endpoint.note) console.error(`        ${endpoint.note}`);
        failed++;
      }
    } catch (err) {
      // Connection refused — server probably not running
      console.warn(`  SKIP  [${endpoint.method}] ${endpoint.path} — ${err instanceof Error ? err.message : 'Network error'}`);
      skipped++;
    }
  }

  console.log(`\n${passed + failed + skipped} checks: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
