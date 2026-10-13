// Spaces are tokens.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const trainerText = page => activeTrainer(page).locator('.text');
const wrongToken = page => activeTrainer(page).locator('.text .wrong');
const wrongSpace = page => activeTrainer(page).locator('.text .wrong-space');
const hint = page => activeTrainer(page).locator('.text .hint');

async function openTrainer(page, body) {
	await page.goto('/');
	await expect(activeMenu(page)).toBeVisible();
	await page.evaluate(async body => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readwrite');
			tx.objectStore('cards').put({ id: 1, name: 'Пробіли', texts: [{ title: 'Т', body }] });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	}, body);
	await page.reload();
	await activeMenu(page).locator('.card').first().click();
	await expect(activeTrainer(page)).toBeVisible();
	await trainerText(page).click();
}

test('S1: a space where the text has none is red at once and blocks typing', async ({ page }) => {
	await openTrainer(page, 'І сказав я йому: так.');
	await page.keyboard.type('І сказав я йому ');

	await expect(wrongSpace(page)).toHaveCount(1);
	const background = await wrongSpace(page).evaluate(el => getComputedStyle(el).backgroundColor);
	expect(background).not.toBe('rgba(0, 0, 0, 0)');

	await page.keyboard.type(':');
	await expect(wrongSpace(page)).toHaveCount(1);
	await expect(trainerText(page)).not.toHaveText(/йому:/);
});

test('S1b: Backspace removes the red space; the mark can then be typed', async ({ page }) => {
	await openTrainer(page, 'І сказав я йому: так.');
	await page.keyboard.type('І сказав я йому ');
	await expect(wrongSpace(page)).toHaveCount(1);

	await page.keyboard.press('Backspace');
	await expect(wrongSpace(page)).toHaveCount(0);
	await page.keyboard.type(': так.');
	await expect(trainerText(page)).toHaveText('І сказав я йому: так.');
	await expect(wrongSpace(page)).toHaveCount(0);
});

test('S2: the spaces the text has are accepted', async ({ page }) => {
	await openTrainer(page, 'йому, сказав.');
	await page.keyboard.type('йому, сказав.');

	await expect(wrongToken(page)).toHaveCount(0);
	await expect(wrongSpace(page)).toHaveCount(0);
	await expect(trainerText(page)).toHaveText('йому, сказав.');
});

test('S3: spaces after the last token are allowed', async ({ page }) => {
	await openTrainer(page, 'Так.');
	await page.keyboard.type('Так. ');

	await expect(wrongSpace(page)).toHaveCount(0);
	await expect(wrongToken(page)).toHaveCount(0);
});

test('S4: five wrong tokens where a space is expected give the hint "␣"', async ({ page }) => {
	await openTrainer(page, 'йому сказав.');
	await page.keyboard.type('йому');
	// A comma where the text has a space: a wrong token at the space position.
	for (let i = 0; i < 5; i++) {
		await page.keyboard.type(', ');
		await expect(wrongToken(page)).toHaveText(',');
		await page.keyboard.press('Backspace');
		await expect(wrongToken(page)).toHaveCount(0);
	}
	await expect(hint(page)).toHaveAttribute('data-hint', '␣');
});
