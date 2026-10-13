// Live token check in Memory check.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const trainerText = page => activeTrainer(page).locator('.text');
const wrongToken = page => activeTrainer(page).locator('.text .wrong');

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
			tx.objectStore('cards').put({ id: 1, name: 'Тест', texts: [{ title: 'Т', body }] });
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

test('V1: a finished wrong word is red and is not accepted', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	await page.keyboard.type('Другий ');

	await expect(wrongToken(page)).toHaveText('Другий');
	await expect(trainerText(page)).toHaveText('Другий');
});

test('V2: while blocked only Backspace works; it removes the whole wrong token', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	await page.keyboard.type('Другий ');
	await expect(wrongToken(page)).toHaveText('Другий');

	await page.keyboard.type('ще');
	await expect(trainerText(page)).toHaveText('Другий');

	await page.keyboard.press('Backspace');
	await expect(wrongToken(page)).toHaveCount(0);
	await expect(trainerText(page)).toHaveText('');

	await page.keyboard.type('Перший текст.');
	await expect(trainerText(page)).toHaveText('Перший текст.');
	await expect(wrongToken(page)).toHaveCount(0);
});

test('V3: a word is not judged while it is still being typed', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	await page.keyboard.type('Перш');

	await expect(wrongToken(page)).toHaveCount(0);
	await expect(trainerText(page)).toHaveText('Перш');
});

test('V4: apostrophe and dash variants are equal', async ({ page }) => {
	await openTrainer(page, 'Пам’ять Слово-слово.');
	// The learner uses a plain apostrophe and an en dash; the expected text uses ’ and -.
	await page.keyboard.type("Пам'ять Слово–слово.");
	// The whole text is typed with the other variants: no wrong token, and the text is complete (locked).
	await expect(wrongToken(page)).toHaveCount(0);
	await expect(trainerText(page)).toHaveClass(/locked/);
	await expect(trainerText(page)).toHaveText('Пам’ять Слово-слово.');
});

test('V4b: a dash between words does not split the word', async ({ page }) => {
	await openTrainer(page, 'Слово-слово.');
	// Spaces around the dash make it a separate token, so this word is wrong.
	await page.keyboard.type('Слово ');
	await expect(wrongToken(page)).toHaveText('Слово');
});

test('V5: one vibration per wrong token, when vibration is available', async ({ page }) => {
	await page.addInitScript(() => {
		window.__vibrations = 0;
		Object.defineProperty(navigator, 'vibrate', {
			configurable: true,
			value: () => { window.__vibrations++; return true; },
		});
	});
	await openTrainer(page, 'Перший текст.');
	await page.keyboard.type('Другий ');
	await expect(wrongToken(page)).toHaveText('Другий');

	expect(await page.evaluate(() => window.__vibrations)).toBe(1);
});

test('V5b: without vibration support a wrong token still works and nothing fails', async ({ page }) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
	});
	await openTrainer(page, 'Перший текст.');
	await page.keyboard.type('Другий ');

	await expect(wrongToken(page)).toHaveText('Другий');
	expect(errors).toEqual([]);
});

test('V7: comparison is case-sensitive', async ({ page }) => {
	await openTrainer(page, 'Слово потім.');
	await page.keyboard.type('слово ');

	await expect(wrongToken(page)).toHaveText('слово');
});

test('V8: a punctuation mark is its own token', async ({ page }) => {
	await openTrainer(page, 'Так, це.');
	await page.keyboard.type('Так.');
	// The full stop does not match the comma; it is judged when the space is typed.
	await page.keyboard.type(' ');

	await expect(wrongToken(page)).toHaveText('.');
	await expect(trainerText(page)).toHaveText('Так.');
});
