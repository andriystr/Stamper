// Finish typing: no Check button, locked text after completion.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const trainerText = page => activeTrainer(page).locator('.text');

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
	await trainerText(page).click();
}

test('F1: the trainer has no Check or Again button', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);

	await expect(activeTrainer(page).locator('.action-check-text')).toHaveCount(0);
	await expect(activeTrainer(page).locator('.action-again-text')).toHaveCount(0);
});

test('F2: complete text is shown as at opening and locked', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);
	await page.keyboard.type('Перший текст.');

	await expect(trainerText(page)).toHaveClass(/locked/);
	await expect(trainerText(page)).toHaveText('Перший текст.');

	await page.keyboard.type('ще');
	await expect(trainerText(page)).toHaveText('Перший текст.');
	await expect(trainerText(page)).toHaveClass(/locked/);
});

test('F3: Backspace in the locked state clears the text and typing starts again', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст.' }]);
	await page.keyboard.type('Перший текст.');
	await expect(trainerText(page)).toHaveClass(/locked/);

	await page.keyboard.press('Backspace');
	await expect(trainerText(page)).not.toHaveClass(/locked/);
	await expect(trainerText(page)).toHaveText('');

	await page.keyboard.type('Перший текст.');
	await expect(trainerText(page)).toHaveClass(/locked/);
});

test('F4: a text that ends with a word is locked only after a following space', async ({ page }) => {
	await openTrainer(page, [{ title: 'Т', body: 'Перший текст' }]);
	await page.keyboard.type('Перший текст');
	await expect(trainerText(page)).not.toHaveClass(/locked/);

	await page.keyboard.type(' ');
	await expect(trainerText(page)).toHaveClass(/locked/);
});

test('F5: Next shows the next text in the opening state', async ({ page }) => {
	await openTrainer(page, [
		{ title: 'Перший', body: 'Перший текст.' },
		{ title: 'Другий', body: 'Другий текст.' },
	]);
	await page.keyboard.type('Перший текст.');
	await expect(trainerText(page)).toHaveClass(/locked/);

	await activeTrainer(page).locator('.action-next-text').click();
	await expect(activeTrainer(page).locator('.title h3')).toHaveText('Другий');
	await expect(trainerText(page)).not.toHaveClass(/locked/);
	await expect(trainerText(page)).toHaveText('Другий текст.');
});
