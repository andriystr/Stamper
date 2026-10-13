// Regression tests for the bugs from the audit of 2026-10-13.
const { test, expect } = require('@playwright/test');

const NO_TEXTS_IN_CARD = 'У цій картці немає текстів';
const NAME_REQUIRED = 'Назва картки не може бути порожньою';
const TEXT_REQUIRED = 'Додайте хоча б один текст';

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeEditor = page => page.locator('.frame-wrapper.active .frame.edit-card');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');

async function openApp(page) {
	await page.goto('/');
	await expect(activeMenu(page)).toBeVisible();
}

// Writes cards straight into the app's IndexedDB, so a test starts from a known state.
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

async function countStoredCards(page) {
	return page.evaluate(async () => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const count = await new Promise((resolve, reject) => {
			const request = db.transaction('cards', 'readonly').objectStore('cards').count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return count;
	});
}

test('R1: a card without texts opens in Memory check and says so, without errors', async ({ page }) => {
	const errors = [];
	page.on('pageerror', error => errors.push(error.message));

	await openApp(page);
	await seedCards(page, [{ id: 1, name: 'Порожня', texts: [] }]);
	await page.reload();
	await expect(activeMenu(page)).toBeVisible();

	await activeMenu(page).locator('.card', { hasText: 'Порожня' }).click();

	await expect(activeTrainer(page)).toBeVisible();
	await expect(activeTrainer(page).locator('.text')).toContainText(NO_TEXTS_IN_CARD);
	expect(errors).toEqual([]);
});

test('R2: text and card name are stored and shown exactly as typed', async ({ page }) => {
	const name = 'Тест <i>1</i>';
	const body = 'a <b>c</b> & d &amp;';

	await openApp(page);
	await page.locator('.frame.menu .action-add-text').click();
	await expect(activeEditor(page)).toBeVisible();

	await activeEditor(page).locator('.card-name').fill(name);
	await activeEditor(page).locator('.editor .text').fill(body);
	await activeEditor(page).locator('.action-save').click();
	await expect(activeMenu(page)).toBeVisible();

	await expect(activeMenu(page).locator('.card h3').first()).toHaveText(name);

	await activeMenu(page).locator('.card', { hasText: 'Тест' }).locator('.action-edit-text').click();
	await expect(activeEditor(page)).toBeVisible();
	await expect(activeEditor(page).locator('.editor .text')).toHaveText(body);
});

test('R3: saving a card with an empty name is refused and the editor stays open', async ({ page }) => {
	await openApp(page);
	await page.locator('.frame.menu .action-add-text').click();
	await expect(activeEditor(page)).toBeVisible();

	await activeEditor(page).locator('.card-name').fill('');
	await activeEditor(page).locator('.action-save').click();

	await expect(activeEditor(page)).toBeVisible();
	await expect(activeEditor(page)).toContainText(NAME_REQUIRED);
	expect(await countStoredCards(page)).toBe(0);
});

test('R4: saving a card with no texts is refused and the editor stays open', async ({ page }) => {
	await openApp(page);
	await page.locator('.frame.menu .action-add-text').click();
	await expect(activeEditor(page)).toBeVisible();

	// Deleting a text asks for confirmation (C1); accept it so the card really has no texts.
	await activeEditor(page).locator('.action-delete-text').click();
	await page.locator('[role="alertdialog"] .dialog-confirm').click();
	await activeEditor(page).locator('.action-save').click();

	await expect(activeEditor(page)).toBeVisible();
	await expect(activeEditor(page)).toContainText(TEXT_REQUIRED);
	expect(await countStoredCards(page)).toBe(0);
});

test('R5: Next and Back move between the texts of a card (no regression)', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{
		id: 2,
		name: 'Дві частини',
		texts: [
			{ title: 'Перший', body: 'Перший текст.' },
			{ title: 'Другий', body: 'Другий текст.' },
		],
	}]);
	await page.reload();
	await activeMenu(page).locator('.card', { hasText: 'Дві частини' }).click();

	await expect(activeTrainer(page).locator('.title h3')).toHaveText('Перший');
	await activeTrainer(page).locator('.action-next-text').click();
	await expect(activeTrainer(page).locator('.title h3')).toHaveText('Другий');
	await activeTrainer(page).locator('.action-back-text').click();
	await expect(activeTrainer(page).locator('.title h3')).toHaveText('Перший');
});

test('R6: the database keeps name "cards" and version 1, and stored cards are read', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{ id: 3, name: 'Старий запис', texts: [{ title: 't', body: 'b' }] }]);
	await page.reload();

	await expect(activeMenu(page).locator('.card h3', { hasText: 'Старий запис' })).toBeVisible();

	const databases = await page.evaluate(() => indexedDB.databases());
	expect(databases).toContainEqual(expect.objectContaining({ name: 'cards', version: 1 }));
});
