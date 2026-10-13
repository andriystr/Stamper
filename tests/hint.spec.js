// Hint after five wrong attempts on the same position.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const trainerText = page => activeTrainer(page).locator('.text');
const wrongToken = page => activeTrainer(page).locator('.text .wrong');
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
			tx.objectStore('cards').put({ id: 1, name: 'Підказка', texts: [{ title: 'Т', body }] });
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

// One wrong attempt: type the wrong token and the space, then remove the red token with Backspace.
async function wrongAttempt(page, word) {
	await page.keyboard.type(`${word} `);
	await expect(wrongToken(page)).toHaveText(word);
	await page.keyboard.press('Backspace');
	await expect(wrongToken(page)).toHaveCount(0);
}

test('H1: the hint appears after the 5th attempt, when the red token is removed', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	for (let i = 0; i < 4; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(0);

	await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveAttribute('data-hint', 'Перший');
	// The grey text is drawn by ::after from data-hint, so check what is actually rendered.
	const drawn = await hint(page).evaluate(el => getComputedStyle(el, '::after').content);
	expect(drawn).toBe('"Перший"');
});

test('H2: typing a letter removes the hint, and the text is what was typed', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	for (let i = 0; i < 5; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(1);

	await page.keyboard.type('П');
	await expect(hint(page)).toHaveCount(0);
	await expect(trainerText(page)).toHaveText('П');
});

test('H3: the hint is not part of the text', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	for (let i = 0; i < 5; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(1);

	expect(await trainerText(page).innerText()).toBe('');
	await activeTrainer(page).locator('.action-check-text').click();
	await expect(activeTrainer(page).locator('.action-again-text')).toBeVisible();
	await expect(trainerText(page).locator('.hint')).toHaveCount(0);
});

test('H4: after a hint, five more attempts are needed for the next hint', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	for (let i = 0; i < 5; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(1);
	await page.keyboard.type('П');
	await page.keyboard.press('Backspace');

	for (let i = 0; i < 4; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(0);

	await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveAttribute('data-hint', 'Перший');
});

test('H5: the count restarts at the next position', async ({ page }) => {
	await openTrainer(page, 'Перший текст.');
	for (let i = 0; i < 3; i++) await wrongAttempt(page, 'Другий');
	await page.keyboard.type('Перший ');

	// Two wrong attempts on the next position: 3 + 2 would be 5 without the restart.
	for (let i = 0; i < 2; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveCount(0);

	for (let i = 0; i < 3; i++) await wrongAttempt(page, 'Другий');
	await expect(hint(page)).toHaveAttribute('data-hint', 'текст');
});
