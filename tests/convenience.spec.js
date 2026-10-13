// Convenience improvements.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeEditor = page => page.locator('.frame-wrapper.active .frame.edit-card');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');

async function openApp(page) {
	await page.goto('/');
	await expect(activeMenu(page)).toBeVisible();
}

async function seedCards(page, cards) {
	await page.evaluate(async cards => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readwrite');
			cards.forEach(card => tx.objectStore('cards').put(card));
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	}, cards);
}

test('C1: deleting a card or a text asks first; cancel keeps it', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{
		id: 4,
		name: 'Важлива картка',
		texts: [{ title: 'Перший', body: 'Перший текст.' }, { title: 'Другий', body: 'Другий текст.' }],
	}]);
	await page.reload();

	// Cancel the card delete: the card stays.
	await activeMenu(page).locator('.card', { hasText: 'Важлива картка' }).locator('.action-edit-text').click();
	await expect(activeEditor(page)).toBeVisible();
	page.once('dialog', dialog => {
		expect(dialog.type()).toBe('confirm');
		dialog.dismiss();
	});
	await page.locator('header .right').click();
	await expect(activeEditor(page)).toBeVisible();
	await expect(activeEditor(page).locator('.editor')).toHaveCount(2);

	// Cancel the text delete: the text stays.
	page.once('dialog', dialog => dialog.dismiss());
	await activeEditor(page).locator('.action-delete-text').first().click();
	await expect(activeEditor(page).locator('.editor')).toHaveCount(2);

	// Back to the menu: the card is still there.
	await page.locator('header .left').click();
	await expect(activeMenu(page).locator('.card')).toHaveCount(1);

	// Accept the card delete: the card is removed.
	await activeMenu(page).locator('.card').locator('.action-edit-text').click();
	page.once('dialog', dialog => dialog.accept());
	await page.locator('header .right').click();
	await expect(activeMenu(page)).toBeVisible();
	await expect(activeMenu(page).locator('.card')).toHaveCount(0);
});

test('C2: the Memory check screen shows the position of the text', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{
		id: 6,
		name: 'Позиція',
		texts: [{ title: 'Перший', body: 'Перший.' }, { title: 'Другий', body: 'Другий.' }],
	}]);
	await page.reload();
	await activeMenu(page).locator('.card', { hasText: 'Позиція' }).click();

	await expect(activeTrainer(page).locator('.progress')).toHaveText('1 з 2');
	await activeTrainer(page).locator('.action-next-text').click();
	await expect(activeTrainer(page).locator('.progress')).toHaveText('2 з 2');
});

test('C3: Ctrl+Enter runs the check, and the Check button shows the shortcut', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{ id: 7, name: 'Швидко', texts: [{ title: 'Т', body: 'Текст для перевірки.' }] }]);
	await page.reload();
	await activeMenu(page).locator('.card', { hasText: 'Швидко' }).click();

	await expect(activeTrainer(page).locator('.action-check-text')).toHaveAttribute('title', 'Ctrl+Enter');
	await activeTrainer(page).locator('.text').click();
	await page.keyboard.type('Текст для перевірки.');
	await page.keyboard.press('Control+Enter');

	await expect(activeTrainer(page).locator('.action-again-text')).toBeVisible();
	await expect(activeTrainer(page).locator('.action-check-text')).toBeHidden();
});

test('C4: each card in the menu shows its number of texts', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [
		{ id: 8, name: 'Два тексти', texts: [{ title: 'a', body: 'a' }, { title: 'b', body: 'b' }] },
		{ id: 9, name: 'Один текст', texts: [{ title: 'a', body: 'a' }] },
	]);
	await page.reload();

	await expect(activeMenu(page).locator('.card', { hasText: 'Два тексти' }).locator('.card-meta')).toHaveText('Текстів: 2');
	await expect(activeMenu(page).locator('.card', { hasText: 'Один текст' }).locator('.card-meta')).toHaveText('Текстів: 1');
});
