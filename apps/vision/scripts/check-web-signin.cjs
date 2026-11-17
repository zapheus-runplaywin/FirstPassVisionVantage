// Checks Vision's web sign-in in a real browser, against a stand-in for the
// club's Supabase project (no network, no real accounts). Run by hand:
//
//   cd apps/vision
//   npx expo export --platform web --output-dir dist
//   npx expo serve --port 8790 &
//   node scripts/check-web-signin.cjs
//
// Needs Playwright with Chromium (not a dependency of this repo). Not run in
// CI, to save Actions minutes; the logic it drives is unit-tested in
// src/lib/__tests__/webAuth.test.ts.
const { chromium } = require('playwright');
const BASE = process.env.VISION_URL ?? 'http://localhost:8790';
// The club in app.json whose project the browser would talk to.
const SB = 'https://gfadnwpxyartrfkrhhlr.supabase.co';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:'u1',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,email:'coach@example.com'})+'.sig';
const results = [];
const check = (name, ok, extra='') => { results.push(`${ok?'PASS':'FAIL'} ${name} ${extra}`); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const calls = [];
  await page.route(SB + '/**', async (route) => {
    const url = route.request().url(); calls.push(route.request().method()+' '+url.replace(SB,''));
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r1', user: { id: 'u1', email: 'coach@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }) });
    if (url.includes('/rest/v1/rpc/follow_game')) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: "You can't follow this game" }) });
    if (url.includes('/auth/v1/authorize')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>google</h1>' });
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  page.on('pageerror', e => results.push('PAGEERROR ' + e.message));
  const text = async () => page.locator('body').innerText();

  await page.goto(BASE + '/auth-callback?code=x'); await page.waitForTimeout(1500);
  check('callback with no club asks for the club', (await text()).includes('Choose your club, then sign in again.'));

  await page.evaluate(() => localStorage.setItem('firstpass-vision:club', 'THUNDER'));
  await page.goto(BASE + '/auth-callback'); await page.waitForTimeout(1500);
  check('callback with no code says sign-in did not finish', (await text()).includes("Sign-in didn't finish"));

  await page.goto(BASE + '/auth-callback?error=access_denied&error_description=Cancelled+by+you'); await page.waitForTimeout(1500);
  check('callback shows the error', (await text()).includes('Cancelled by you'));

  await page.goto(BASE + '/game?id=g-123'); await page.waitForTimeout(2000);
  const u = new URL(page.url());
  check('signed-out game link goes to sign-in with next', u.pathname === '/' && u.searchParams.get('next') === '/game?id=g-123', page.url());
  const t = await text();
  check('sign-in screen shows shared-computer line', t.includes('not a shared one'));

  await page.getByRole('button', { name: 'Sign in with Google' }).click(); await page.waitForTimeout(2000);
  const auth = new URL(page.url());
  check('whole page goes to Supabase authorize', auth.href.startsWith(SB + '/auth/v1/authorize'), auth.href.slice(0,80));
  check('redirect is this site /auth-callback', auth.searchParams.get('redirect_to') === BASE + '/auth-callback', auth.searchParams.get('redirect_to'));
  check('PKCE challenge sent', !!auth.searchParams.get('code_challenge'));

  calls.length = 0;
  await page.goto(BASE + '/auth-callback?code=good-code'); await page.waitForTimeout(3000);
  check('after the swap, back on the game the coach was opening', (new URL(page.url()).pathname + new URL(page.url()).search) === '/game?id=g-123', page.url());
  check('code swapped exactly once', calls.filter(c => c.includes('/auth/v1/token')).length === 1, JSON.stringify(calls.filter(c=>c.includes('token'))));
  check('game asks HQ via follow_game and shows refusal', (await text()).includes("can't follow this game") || (await text()).includes("isn't one you can see"), (await text()).slice(0,200));
  check('code not left in history (replace)', !(await page.evaluate(() => history.length > 0 && location.search.includes('code'))));

  calls.length = 0;
  await page.goto(BASE + '/auth-callback?code=good-code'); await page.waitForTimeout(2500);
  check('reload of callback when signed in: no second swap', calls.filter(c => c.includes('/auth/v1/token')).length === 0 && new URL(page.url()).pathname !== '/auth-callback', page.url());

  await page.goto(BASE + '/game?id=g-123'); await page.waitForTimeout(2000);
  const signOut = page.getByRole('button', { name: 'Sign out' });
  check('Sign out visible on game screen', await signOut.count() > 0);

  await page.goto(BASE + '/'); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForTimeout(2000);
  check('after sign out, on sign-in screen', (await text()).includes('Sign in with Google'));
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth')));
  check('session removed from browser storage', stored.length === 0, JSON.stringify(stored));
  await page.goBack(); await page.waitForTimeout(2000);
  check('back after sign-out shows no games', !(await text()).includes('Games') || (await text()).includes('Sign in with Google'), (await text()).slice(0,120));
  console.log(results.join('\n'));
  await b.close();
  if (results.some((r) => !r.startsWith('PASS'))) process.exit(1);
})();
