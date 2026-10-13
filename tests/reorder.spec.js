// Card order in the menu: drag with a mouse, with a finger, and with the keyboard.
const { test, expect } = require('@playwright/test');

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 640 };

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeEditor = page => page.locator('.frame-wrapper.active .frame.edit-card');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');
const cardAt = (page, index) => activeMenu(page).locator('.card').nth(index);
const handleAt = (page, index) => cardAt(page, index).locator('.card-handle');

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

// Reads the stored cards, sorted by id, as the database holds them.
async function storedCards(page) {
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
		return cards.sort((a, b) => a.id - b.id).map(card => ({ name: card.name, order: card.order }));
	});
}

function card(id, name, order) {
	return { id, name, order, texts: [{ title: 'Текст', body: 'Текст картки.' }] };
}

const CARDS = [card(1, 'Перша', 0), card(2, 'Друга', 1), card(3, 'Третя', 2)];
const NAMES = ['Перша', 'Друга', 'Третя'];

async function openMenu(page, cards = CARDS) {
	await page.goto('/');
	await seedCards(page, cards);
	await page.reload();
	await expect(activeMenu(page)).toBeVisible();
}

// Moves the pointer from the middle of the handle by dy pixels, in steps, then releases it.
async function dragWithMouse(page, handle, dy) {
	const box = await handle.boundingBox();
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 20; i++) {
		await page.mouse.move(x, y + (dy * i) / 20);
	}
	await page.mouse.up();
}

// The same gesture with a finger, through the browser's touch input (pointer events of type touch).
async function dragWithTouch(page, handle, dy) {
	const box = await handle.boundingBox();
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const session = await page.context().newCDPSession(page);
	await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
	for (let i = 1; i <= 20; i++) {
		await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / 20 }] });
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

// The vertical distance from the handle to a point inside another card:
// fraction 0.25 is above that card's middle (the card moves up), 0.75 is below it (the card moves down).
async function distanceTo(handle, targetCard, fraction) {
	const from = await handle.boundingBox();
	const to = await targetCard.boundingBox();
	return to.y + to.height * fraction - (from.y + from.height / 2);
}

test('O1: each card has a labelled handle of at least 44 px', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	const handles = activeMenu(page).locator('.card-handle');
	await expect(handles).toHaveCount(3);
	for (let i = 0; i < 3; i++) {
		await expect(handleAt(page, i)).toHaveAttribute('aria-label', 'Перетягнути картку');
		const box = await handleAt(page, i).boundingBox();
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(44);
	}
});

test('O2: a mouse drag reorders the cards, and a reload keeps the order', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	await dragWithMouse(page, handleAt(page, 2), await distanceTo(handleAt(page, 2), cardAt(page, 0), 0.25));
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Третя', 'Перша', 'Друга']);
	// The menu changes at once; the write to the database follows, so the reload waits for it.
	await expect.poll(() => storedCards(page)).toEqual([
		{ name: 'Перша', order: 1 },
		{ name: 'Друга', order: 2 },
		{ name: 'Третя', order: 0 },
	]);

	await page.reload();
	await expect(activeMenu(page)).toBeVisible();
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Третя', 'Перша', 'Друга']);
});

test.describe('phone 360px', () => {
	test.use({ viewport: PHONE, hasTouch: true });

	test('O2: a touch drag on a phone reorders the cards, and a reload keeps the order', async ({ page }) => {
		await openMenu(page);

		await dragWithTouch(page, handleAt(page, 0), await distanceTo(handleAt(page, 0), cardAt(page, 2), 0.75));
		await expect(activeMenu(page).locator('.card h3')).toHaveText(['Друга', 'Третя', 'Перша']);
		await expect.poll(() => storedCards(page)).toEqual([
			{ name: 'Перша', order: 2 },
			{ name: 'Друга', order: 0 },
			{ name: 'Третя', order: 1 },
		]);

		await page.reload();
		await expect(activeMenu(page).locator('.card h3')).toHaveText(['Друга', 'Третя', 'Перша']);
	});

	test('O7: the handle takes the touch itself, so a finger drags it instead of scrolling the list', async ({ page }) => {
		await openMenu(page);
		const touchAction = await handleAt(page, 0).evaluate(el => getComputedStyle(el).touchAction);
		expect(touchAction).toBe('none');
	});
});

test('O3: ArrowUp and ArrowDown move a card and keep the focus on its handle', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	await handleAt(page, 1).focus();
	await page.keyboard.press('ArrowUp');
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Друга', 'Перша', 'Третя']);
	await expect(handleAt(page, 0)).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(activeMenu(page).locator('.card h3')).toHaveText(NAMES);

	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Друга', 'Перша', 'Третя']);
	await expect.poll(() => storedCards(page)).toEqual([
		{ name: 'Перша', order: 1 },
		{ name: 'Друга', order: 0 },
		{ name: 'Третя', order: 2 },
	]);

	await page.reload();
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Друга', 'Перша', 'Третя']);
});

test('O4: a click on a handle does not open the card, and a drag does not either', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	await handleAt(page, 0).click();
	await expect(activeMenu(page)).toBeVisible();
	await expect(activeTrainer(page)).toHaveCount(0);

	await dragWithMouse(page, handleAt(page, 2), await distanceTo(handleAt(page, 2), cardAt(page, 0), 0.25));
	await expect(activeMenu(page)).toBeVisible();
	await expect(page.locator('.frame-wrapper.active .frame.trainer')).toHaveCount(0);
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Третя', 'Перша', 'Друга']);
});

test('O5: a new card goes last, and saving an edited card keeps its place', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	await cardAt(page, 0).locator('.action-edit-text').click();
	await expect(activeEditor(page)).toBeVisible();
	await activeEditor(page).locator('.action-save').click();
	await expect(activeMenu(page)).toBeVisible();
	await expect(activeMenu(page).locator('.card h3')).toHaveText(NAMES);
	expect((await storedCards(page))[0].order).toBe(0);

	await activeMenu(page).locator('.action-add-text').click();
	await expect(activeEditor(page)).toBeVisible();
	await activeEditor(page).locator('.action-save').click();
	await expect(activeMenu(page)).toBeVisible();
	await expect(activeMenu(page).locator('.card h3')).toHaveText(['Перша', 'Друга', 'Третя', 'Нова картка']);
});

test('O6: cards stored without an order keep their id order, and the order is written on the first open', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page, [card(3, 'Третя'), card(1, 'Перша'), card(2, 'Друга')]);

	await expect(activeMenu(page).locator('.card h3')).toHaveText(NAMES);
	expect(await storedCards(page)).toEqual([
		{ name: 'Перша', order: 0 },
		{ name: 'Друга', order: 1 },
		{ name: 'Третя', order: 2 },
	]);
});

test('O8: a cancelled drag puts the card back and saves nothing', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	const handle = handleAt(page, 2);
	const box = await handle.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y - 150, { steps: 10 });
	await page.evaluate(() => window.dispatchEvent(new Event('pointercancel')));
	await page.mouse.up();

	await expect(activeMenu(page).locator('.card h3')).toHaveText(NAMES);
	await expect(page.locator('body > .card')).toHaveCount(0);
	await expect(activeMenu(page).locator('.card-placeholder')).toHaveCount(0);
	expect(await storedCards(page)).toEqual([
		{ name: 'Перша', order: 0 },
		{ name: 'Друга', order: 1 },
		{ name: 'Третя', order: 2 },
	]);
});
