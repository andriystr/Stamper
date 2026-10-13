// Import and export of cards: the transfer screen, the JSON file, and the checks on imported files.
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeTransfer = page => page.locator('.frame-wrapper.active .frame.transfer');
const message = page => activeTransfer(page).locator('.form-message');
const checkboxes = page => activeTransfer(page).locator('.transfer-item input[type=checkbox]');
const exportButton = page => activeTransfer(page).locator('.action-export');

const PHONE = { width: 320, height: 640 };

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

// The stored records in menu order, with their ids: what the database really holds.
async function storedRecords(page) {
	return page.evaluate(async () => {
		const db = await new Promise((resolve, reject) => {
			const request = indexedDB.open('cards');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const cards = await new Promise((resolve, reject) => {
			const request = db.transaction('cards', 'readonly').objectStore('cards').getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return cards.sort((a, b) => a.order - b.order);
	});
}

function card(id, name, order, texts = [{ title: 'Текст', body: 'Тіло тексту.' }]) {
	return { id, name, order, texts };
}

const CARDS = [card(1, 'Перша', 0), card(2, 'Друга', 1), card(3, 'Третя', 2)];

async function openMenu(page, cards = CARDS) {
	await page.goto('/');
	await seedCards(page, cards);
	await page.reload();
	await expect(activeMenu(page)).toBeVisible();
}

async function openTransfer(page) {
	await page.locator('header .right').click();
	await expect(activeTransfer(page)).toBeVisible();
}

async function importText(page, text) {
	await activeTransfer(page).locator('input[type=file]').setInputFiles({
		name: 'cards.json',
		mimeType: 'application/json',
		buffer: Buffer.from(text, 'utf8'),
	});
}

async function exportedFile(page) {
	const downloadPromise = page.waitForEvent('download');
	await exportButton(page).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('stamper-cards.json');
	return fs.readFileSync(await download.path(), 'utf8');
}

test('X1: the header button opens the transfer screen, and Назад returns to the menu', async ({ page }) => {
	await openMenu(page);
	const right = page.locator('header .right');
	await expect(right).toHaveText('Імпорт/експорт');

	// The header's right button is red for Delete; on the menu it is a neutral link.
	const red = await page.evaluate(() => {
		const probe = document.createElement('span');
		probe.style.color = 'var(--danger-600)';
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	});
	expect(await right.evaluate(el => getComputedStyle(el).color)).not.toBe(red);

	await openTransfer(page);
	await expect(page.locator('header h2')).toHaveText('Імпорт і експорт');
	await page.locator('header .left').click();
	await expect(activeMenu(page)).toBeVisible();
});

test('X2: the screen lists the cards; select all and clear; the count follows', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	await expect(activeTransfer(page).locator('.transfer-item')).toHaveCount(3);
	await expect(activeTransfer(page).locator('.transfer-item').first()).toContainText('Перша');
	await expect(activeTransfer(page).locator('.transfer-count')).toHaveText('Вибрано: 0 з 3');
	await expect(exportButton(page)).toBeDisabled();

	const selectAll = activeTransfer(page).locator('.action-select-all');
	await selectAll.click();
	for (let i = 0; i < 3; i++) await expect(checkboxes(page).nth(i)).toBeChecked();
	await expect(activeTransfer(page).locator('.transfer-count')).toHaveText('Вибрано: 3 з 3');
	await expect(selectAll).toHaveText('Зняти вибір');
	await expect(exportButton(page)).toBeEnabled();

	await selectAll.click();
	for (let i = 0; i < 3; i++) await expect(checkboxes(page).nth(i)).not.toBeChecked();
	await expect(activeTransfer(page).locator('.transfer-count')).toHaveText('Вибрано: 0 з 3');
	await expect(selectAll).toHaveText('Вибрати всі');
});

test('X3: one or several cards export in menu order, as minified JSON with name and texts only', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	// Pick the third card first: the file still lists them in menu order.
	await checkboxes(page).nth(2).check();
	await checkboxes(page).nth(0).check();
	const text = await exportedFile(page);

	expect(text, 'the file has line breaks or spaces').toBe(JSON.stringify(JSON.parse(text)));
	expect(JSON.parse(text)).toEqual({
		format: 'stamper',
		formatVersion: 1,
		cards: [
			{ name: 'Перша', texts: [{ title: 'Текст', body: 'Тіло тексту.' }] },
			{ name: 'Третя', texts: [{ title: 'Текст', body: 'Тіло тексту.' }] },
		],
	});
});

test('X4: exporting all cards writes every card', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	await activeTransfer(page).locator('.action-select-all').click();
	const parsed = JSON.parse(await exportedFile(page));
	expect(parsed.cards.map(c => c.name)).toEqual(['Перша', 'Друга', 'Третя']);
});

test('X5: a valid file adds its cards to the end of the menu, with new ids and orders', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	await importText(page, JSON.stringify({
		format: 'stamper',
		formatVersion: 1,
		cards: [
			{ name: 'Імпортована', texts: [{ title: 'Один', body: 'Текст один.' }, { title: 'Два', body: 'Текст два.' }] },
			{ name: 'Ще одна', texts: [{ title: 'Т', body: 'Б' }] },
		],
	}));
	await expect(message(page)).toHaveText('Імпортовано карток: 2.');
	await expect(activeTransfer(page).locator('.transfer-item')).toHaveCount(5);

	const records = await storedRecords(page);
	expect(records.map(r => r.name)).toEqual(['Перша', 'Друга', 'Третя', 'Імпортована', 'Ще одна']);
	expect(records.map(r => r.order)).toEqual([0, 1, 2, 3, 4]);
	expect(records[3].id).toBeGreaterThan(3);
	expect(records[3].texts).toHaveLength(2);

	await page.locator('header .left').click();
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Перша', 'Друга', 'Третя', 'Імпортована', 'Ще одна']);
});

test('X6: an invalid file adds nothing and says what is wrong', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	const cases = [
		['not JSON', 'це не JSON', 'Файл не є JSON'],
		['another format', JSON.stringify({ format: 'other', formatVersion: 1, cards: [] }), 'Stamper'],
		['unsupported version', JSON.stringify({ format: 'stamper', formatVersion: 2, cards: [] }), 'не підтримується'],
		['card without a name', JSON.stringify({ format: 'stamper', formatVersion: 1, cards: [{ name: '  ', texts: [{ title: 'a', body: 'b' }] }] }), 'Картка №1 не має назви'],
		['card without texts', JSON.stringify({ format: 'stamper', formatVersion: 1, cards: [{ name: 'Ок', texts: [] }] }), 'Картка №1 не має жодного тексту'],
		['text without a body', JSON.stringify({ format: 'stamper', formatVersion: 1, cards: [{ name: 'Ок', texts: [{ title: 'a' }] }] }), 'У тексті картки №1 немає назви або тіла'],
		['second card broken', JSON.stringify({ format: 'stamper', formatVersion: 1, cards: [
			{ name: 'Добра', texts: [{ title: 'a', body: 'b' }] },
			{ texts: [{ title: 'a', body: 'b' }] },
		] }), 'Картка №2 не має назви'],
	];

	for (const [label, text, expected] of cases) {
		await importText(page, text);
		await expect(message(page), label).toContainText(expected);
		expect((await storedRecords(page)).length, `${label} stored cards`).toBe(3);
	}
});

test('X7: a file with no cards adds nothing and says so', async ({ page }) => {
	await openMenu(page);
	await openTransfer(page);

	await importText(page, JSON.stringify({ format: 'stamper', formatVersion: 1, cards: [] }));
	await expect(message(page)).toHaveText('У файлі немає карток.');
	expect((await storedRecords(page)).length).toBe(3);
});

test('X8: the transfer screen fits 320 px: no horizontal scroll, buttons at least 44 px', async ({ page }) => {
	await page.setViewportSize(PHONE);
	await openMenu(page);
	await openTransfer(page);

	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);

	const buttons = await activeTransfer(page).locator('button:visible').all();
	expect(buttons.length).toBeGreaterThan(0);
	for (const button of buttons) {
		const box = await button.boundingBox();
		const name = await button.innerText();
		expect(box.height, `button "${name}" is ${box.height}px high`).toBeGreaterThanOrEqual(44);
	}
});

test('X9: with no cards the screen says so and the export button is disabled', async ({ page }) => {
	await openMenu(page, []);
	await openTransfer(page);

	await expect(activeTransfer(page).locator('.empty-state')).toHaveText('Ще немає карток для експорту.');
	await expect(exportButton(page)).toBeDisabled();
});

test('X10: the transfer button is on the menu only; the card trainer and the editor do not show it', async ({ page }) => {
	await openMenu(page);
	await expect(page.locator('header .right')).toHaveText('Імпорт/експорт');

	await activeMenu(page).locator('.card').first().click();
	await expect(page.locator('.frame-wrapper.active .frame.trainer')).toBeVisible();
	await expect(page.locator('header .right')).toBeHidden();

	await page.locator('header .left').click();
	await expect(activeMenu(page)).toBeVisible();
	await activeMenu(page).locator('.card .action-edit-text').first().click();
	await expect(page.locator('.frame-wrapper.active .frame.edit-card')).toBeVisible();
	await expect(page.locator('header .right')).toHaveText('Видалити');
});
