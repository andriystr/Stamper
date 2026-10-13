// The app icon: one file, icon.png, referenced from the page, the manifest and the service worker.
const { test, expect } = require('@playwright/test');

test('I1: icon.png is served as a PNG, and every reference points to it', async ({ page, request }) => {
	const icon = await request.get('/icon.png');
	expect(icon.status()).toBe(200);
	expect(icon.headers()['content-type']).toContain('image/png');

	const oldIcon = await request.get('/favicon.png');
	expect(oldIcon.status(), 'the old favicon.png is still served').toBe(404);

	await page.goto('/');
	await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'icon.png');

	const manifest = await (await request.get('/manifest.json')).json();
	expect(manifest.icons.length).toBeGreaterThan(0);
	for (const entry of manifest.icons) {
		expect(entry.src).toBe('icon.png');
	}

	const serviceWorker = await (await request.get('/sw.js')).text();
	expect(serviceWorker).toContain("'icon.png'");
	expect(serviceWorker).not.toContain('favicon.png');
});
