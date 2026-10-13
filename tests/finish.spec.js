// Two states in Memory check: the text is shown, or the learner types.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const trainerText = page => activeTrainer(page).locator('.text');
const isTyping = page => trainerText(page).evaluate(el => el.hasAttribute('contenteditable'));

async function openTrainer(page, texts) {
	await page.goto('/');
	await expect(activeMenu(page)).toBeVisible();
	await page.evaluate(async texts => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readwrite');
			tx.objectStore('cards').put({ id: 1, name: 'Завершення', texts });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	}, texts);
	await page.reload();
	await activeMenu(page).locator('.card').first().click();
	await expect(activeTrainer(page)).toBeVisible();
}

test('F1: the trainer has no Check or Again button', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);

	await expect(activeTrainer(page).locator('.action-check-text')).toHaveCount(0);
	await expect(activeTrainer(page).locator('.action-again-text')).toHaveCount(0);
});

test('F2: the text opens as shown text, not as an input field', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);

	await expect(trainerText(page)).toHaveText('Перший текст.');
	expect(await isTyping(page)).toBe(false);
});

test('F3: a click on the shown text starts typing with an empty field', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);
	await trainerText(page).click();

	expect(await isTyping(page)).toBe(true);
	await expect(trainerText(page)).toHaveText('');
});

test('F4: when the whole text is typed, the shown text comes back', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);
	await trainerText(page).click();
	await page.keyboard.type('Перший текст.');

	expect(await isTyping(page)).toBe(false);
	await expect(trainerText(page)).toHaveText('Перший текст.');
});

test('F4b: the shown text comes back again after a second typing', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);
	await trainerText(page).click();
	await page.keyboard.type('Перший текст.');
	expect(await isTyping(page)).toBe(false);

	await trainerText(page).click();
	await expect(trainerText(page)).toHaveText('');
	await page.keyboard.type('Перший текст.');
	expect(await isTyping(page)).toBe(false);
	await expect(trainerText(page)).toHaveText('Перший текст.');
});

test('F5: a text that ends with a word comes back after a following space', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст' }]);
	await trainerText(page).click();
	await page.keyboard.type('Перший текст');
	expect(await isTyping(page)).toBe(true);

	await page.keyboard.type(' ');
	expect(await isTyping(page)).toBe(false);
	await expect(trainerText(page)).toHaveText('Перший текст');
});

test('F6: Next shows the next text as shown text', async ({ page }) => {
	await openTrainer(page, [
		{ title: 'Перший', body: 'Перший текст.' },
		{ title: 'Другий', body: 'Другий текст.' },
	]);
	await activeTrainer(page).locator('.action-next-text').click();

	await expect(activeTrainer(page).locator('.title h3')).toHaveText('Другий');
	await expect(trainerText(page)).toHaveText('Другий текст.');
	expect(await isTyping(page)).toBe(false);
});
