// The app's own confirmation dialog.
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeEditor = page => page.locator('.frame-wrapper.active .frame.edit-card');
const dialog = page => page.locator('[role="alertdialog"]');
const dialogCancel = page => dialog(page).locator('.dialog-cancel');
const dialogConfirm = page => dialog(page).locator('.dialog-confirm');

const CARD = {
	id: 4,
	name: 'Важлива картка',
	texts: [{ title: 'Перший', body: 'Перший текст.' }, { title: 'Другий', body: 'Другий текст.' }],
};

async function openEditor(page) {
	await page.addInitScript(() => {
		// Count calls to the browser's own confirm; the app must not use it.
		window.__nativeConfirmCalls = 0;
		window.confirm = () => { window.__nativeConfirmCalls++; return false; };
	});
	await page.goto('/');
	await page.evaluate(async card => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readwrite');
			tx.objectStore('cards').put(card);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	}, CARD);
	await page.reload();
	await expect(activeMenu(page)).toBeVisible();
	await activeMenu(page).locator('.card .action-edit-text').click();
	await expect(activeEditor(page)).toBeVisible();
}

async function cardCount(page) {
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

test('D1: deleting a card opens the app dialog, not the browser confirm', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();

	await expect(dialog(page)).toBeVisible();
	expect(await page.evaluate(() => window.__nativeConfirmCalls)).toBe(0);
});

test('D2: the card dialog has a title, a message and two buttons', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();

	await expect(dialog(page).locator('#dialog-title')).toHaveText('Видалити картку?');
	await expect(dialog(page)).toContainText('Цю дію не можна скасувати');
	await expect(dialogCancel(page)).toHaveText('Скасувати');
	await expect(dialogConfirm(page)).toHaveText('Видалити');
});

test('D3: focus starts on Скасувати, and Enter on it cancels', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();

	await expect(dialogCancel(page)).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(dialog(page)).toBeHidden();
	expect(await cardCount(page)).toBe(1);
});

test('D4: Escape and a click on the backdrop cancel; nothing is deleted', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toBeHidden();
	expect(await cardCount(page)).toBe(1);

	await page.locator('header .right').click();
	await page.mouse.click(5, 5);
	await expect(dialog(page)).toBeHidden();
	expect(await cardCount(page)).toBe(1);
});

test('D5: Tab does not leave the dialog', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();

	for (let i = 0; i < 5; i++) {
		await page.keyboard.press('Tab');
		const inside = await page.evaluate(() => document.querySelector('[role="alertdialog"]').contains(document.activeElement));
		expect(inside, `focus left the dialog after ${i + 1} Tab`).toBe(true);
	}
});

test('D6: focus returns to the Delete button after cancel', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();
	await page.keyboard.press('Escape');

	await expect(page.locator('header .right')).toBeFocused();
});

test('D7: the dialog is an alertdialog labelled by its title and described by its message', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();

	const box = dialog(page);
	await expect(box).toHaveAttribute('aria-modal', 'true');
	const labelledBy = await box.getAttribute('aria-labelledby');
	const describedBy = await box.getAttribute('aria-describedby');
	await expect(page.locator(`#${labelledBy}`)).toHaveText('Видалити картку?');
	await expect(page.locator(`#${describedBy}`)).toContainText('Цю дію не можна скасувати');
});

test('D8: confirming deletes the card and returns to the menu', async ({ page }) => {
	await openEditor(page);
	await page.locator('header .right').click();
	await dialogConfirm(page).click();

	await expect(activeMenu(page)).toBeVisible();
	expect(await cardCount(page)).toBe(0);
});

test('D9: deleting a text asks in the app dialog; confirm removes it, cancel keeps it', async ({ page }) => {
	await openEditor(page);
	await page.locator('.action-delete-text').first().click();

	await expect(dialog(page).locator('#dialog-title')).toHaveText('Видалити текст?');
	expect(await page.evaluate(() => window.__nativeConfirmCalls)).toBe(0);
	await dialogCancel(page).click();
	await expect(activeEditor(page).locator('.editor')).toHaveCount(2);

	await page.locator('.action-delete-text').first().click();
	await dialogConfirm(page).click();
	await expect(activeEditor(page).locator('.editor')).toHaveCount(1);
});
