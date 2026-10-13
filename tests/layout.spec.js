// Layout tests: header buttons stay inside the header padding, the title is centred,
// and the Memory check buttons form an even grid on phones.
const { test, expect } = require('@playwright/test');

const HEADER_PADDING = 24;
const TOLERANCE = 2;

const activeMenu = page => page.locator('.frame-wrapper.active .frame.menu');
const activeEditor = page => page.locator('.frame-wrapper.active .frame.edit-card');
const activeTrainer = page => page.locator('.frame-wrapper.active .frame.trainer');

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

const VIEWPORTS = {
	desktop: { width: 1280, height: 800 },
	phone: { width: 390, height: 844 },
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
	test.describe(`${name} ${viewport.width}px`, () => {
		test.use({ viewport });

		test('header buttons sit inside the header padding (editor)', async ({ page }) => {
			await page.goto('/');
			await page.locator('.frame.menu .action-add-text').click();
			await expect(activeEditor(page)).toBeVisible();

			const header = await page.locator('header').boundingBox();
			const right = await page.locator('header .right').boundingBox();
			const left = await page.locator('header .left').boundingBox();

			expect(right.x + right.width, 'right button runs past the header padding')
				.toBeLessThanOrEqual(header.x + header.width - HEADER_PADDING + TOLERANCE);
			expect(left.x, 'left button runs past the header padding')
				.toBeGreaterThanOrEqual(header.x + HEADER_PADDING - TOLERANCE);
		});

		test('header title is centred (trainer)', async ({ page }) => {
			await page.goto('/');
			await seedCards(page, [{ id: 1, name: 'Центр', texts: [{ title: 'Т', body: 'Текст.' }] }]);
			await page.reload();
			await activeMenu(page).locator('.card').first().click();
			await expect(activeTrainer(page)).toBeVisible();

			const header = await page.locator('header').boundingBox();
			const title = await page.locator('header .title').boundingBox();

			const headerCenter = header.x + header.width / 2;
			const titleCenter = title.x + title.width / 2;
			expect(Math.abs(titleCenter - headerCenter)).toBeLessThanOrEqual(TOLERANCE);
		});

		test('Memory check buttons are even (Back and Next)', async ({ page }) => {
			await page.goto('/');
			await seedCards(page, [{ id: 2, name: 'Сітка', texts: [{ title: 'Т', body: 'Текст.' }] }]);
			await page.reload();
			await activeMenu(page).locator('.card').first().click();
			await expect(activeTrainer(page)).toBeVisible();

			const boxes = await Promise.all(
				['.action-back-text', '.action-next-text'].map(sel => activeTrainer(page).locator(sel).boundingBox())
			);
			const rows = new Set(boxes.map(box => Math.round(box.y)));
			const widths = boxes.map(box => Math.round(box.width));

			if (viewport.width < 600) {
				expect(rows.size, 'buttons are not in one row').toBe(1);
				expect(Math.max(...widths) - Math.min(...widths), `widths differ: ${widths.join(', ')}`)
					.toBeLessThanOrEqual(TOLERANCE);
			}
		});
	});
}
