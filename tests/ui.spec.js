// UI redesign checks.
const { test, expect } = require('@playwright/test');

const PHONE = { width: 360, height: 640 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

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

const SAMPLE_CARD = { id: 1, name: 'Тренування', texts: [{ title: 'Перший', body: 'Перший текст для тренування.' }, { title: 'Другий', body: 'Другий текст.' }] };

async function openMenu(page, cards = [SAMPLE_CARD]) {
	await page.goto('/');
	await seedCards(page, cards);
	await page.reload();
	await expect(activeMenu(page)).toBeVisible();
}

async function openTrainer(page) {
	await openMenu(page);
	await activeMenu(page).locator('.card').first().click();
	await expect(activeTrainer(page)).toBeVisible();
}

// Parses "rgb(r, g, b)" or "rgba(r, g, b, a)" and returns the WCAG relative luminance.
function luminance(rgb) {
	const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

test.describe('phone 360px', () => {
	test.use({ viewport: PHONE });

	test('U1: every visible button is at least 44 px on phones', async ({ page }) => {
		// Check each screen while it is the active one: buttons of hidden screens have no box.
		const checkScreen = async (label, locator) => {
			const buttons = await locator.locator('button:visible').all();
			for (const button of buttons) {
				const box = await button.boundingBox();
				const name = await button.innerText();
				expect(box.height, `${label} button "${name}" is ${box.height}px high`).toBeGreaterThanOrEqual(44);
				expect(box.width, `${label} button "${name}" is ${box.width}px wide`).toBeGreaterThanOrEqual(44);
			}
		};

		await openMenu(page);
		await checkScreen('menu', activeMenu(page));
		await openTrainer(page);
		await checkScreen('trainer', activeTrainer(page));
		await page.locator('header .left').click();
		await activeMenu(page).locator('.action-add-text').click();
		await expect(activeEditor(page)).toBeVisible();
		await checkScreen('editor', activeEditor(page));
	});

	test('U2: the text box uses at least 18 px on phones', async ({ page }) => {
		await openTrainer(page);
		const size = await activeTrainer(page).locator('.text').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
		expect(size).toBeGreaterThanOrEqual(18);
	});

	test('U3: "Далі" is the solid primary action; "Назад" is not', async ({ page }) => {
		await openTrainer(page);
		const next = await activeTrainer(page).locator('.action-next-text').evaluate(el => getComputedStyle(el).backgroundColor);
		const back = await activeTrainer(page).locator('.action-back-text').evaluate(el => getComputedStyle(el).backgroundColor);

		expect(contrast(next, 'rgb(255, 255, 255)'), `"Далі" background ${next} should be solid`).toBeGreaterThan(3);
		expect(back, '"Назад" should not be the solid primary colour').not.toBe(next);
	});

	test('U5: a menu with no cards shows a short message', async ({ page }) => {
		await openMenu(page, []);
		await expect(activeMenu(page).locator('.empty-state')).toBeVisible();
		await expect(activeMenu(page).locator('.empty-state')).toContainText('Ще немає карток');
	});

	test('U6: an empty field shows a placeholder while typing', async ({ page }) => {
		await openTrainer(page);
		await activeTrainer(page).locator('.text').click();

		const content = await activeTrainer(page).locator('.text').evaluate(el => getComputedStyle(el, '::before').content);
		expect(content).not.toBe('none');
		expect(content).toContain('Почніть друкувати');
	});

	test('U9: the trainer and the editor fit the viewport height', async ({ page }) => {
		await openTrainer(page);
		let bottom = await activeTrainer(page).evaluate(el => el.getBoundingClientRect().bottom);
		expect(bottom).toBeLessThanOrEqual(PHONE.height);

		await page.locator('header .left').click();
		await activeMenu(page).locator('.action-add-text').click();
		await expect(activeEditor(page)).toBeVisible();
		bottom = await activeEditor(page).evaluate(el => el.getBoundingClientRect().bottom);
		expect(bottom).toBeLessThanOrEqual(PHONE.height);
	});
});

test('U2: the text box uses at least 20 px from 600 px wide', async ({ page }) => {
	await page.setViewportSize(TABLET);
	await openTrainer(page);
	const size = await activeTrainer(page).locator('.text').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
	expect(size).toBeGreaterThanOrEqual(20);
});

test('U4: frame, text box and trainer buttons share one border radius', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openTrainer(page);
	const radii = await page.evaluate(() => {
		const pick = sel => getComputedStyle(document.querySelector(sel)).borderTopLeftRadius;
		return {
			frame: pick('.frame-wrapper.active .frame.trainer'),
			text: pick('.frame-wrapper.active .frame.trainer .text'),
			back: pick('.frame-wrapper.active .frame.trainer .action-back-text'),
			next: pick('.frame-wrapper.active .frame.trainer .action-next-text'),
		};
	});
	expect(new Set(Object.values(radii)).size, JSON.stringify(radii)).toBe(1);
});

for (const [name, viewport] of Object.entries({ small: 320, phone: 360, tablet: 600, medium: 768, desktop: 1280 })) {
	test(`U7: no horizontal scroll at ${name} ${viewport}px`, async ({ page }) => {
		await page.setViewportSize({ width: viewport, height: 800 });
		await openTrainer(page);
		const overflowTrainer = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflowTrainer).toBeLessThanOrEqual(0);

		await page.locator('header .left').click();
		const overflowMenu = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflowMenu).toBeLessThanOrEqual(0);

		await activeMenu(page).locator('.action-add-text').click();
		await expect(activeEditor(page)).toBeVisible();
		const overflowEditor = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflowEditor).toBeLessThanOrEqual(0);
	});
}

test('U10: at 320px the card name never runs under its Edit button', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await openMenu(page);
	// Measure the text itself (a Range), not the box: overflowing text is what overlaps the button.
	// The Edit button may wrap to its own row; they overlap only when both the columns and the rows meet.
	const { text, button } = await page.evaluate(() => {
		const h3 = document.querySelector('.frame.menu .card h3');
		const range = document.createRange();
		range.selectNodeContents(h3);
		const pick = rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
		return {
			text: pick(range.getBoundingClientRect()),
			button: pick(document.querySelector('.frame.menu .card .action-edit-text').getBoundingClientRect()),
		};
	});
	const overlaps = text.right > button.left + 1 && text.left < button.right
		&& text.top < button.bottom && text.bottom > button.top;
	expect(overlaps, `the name text ${JSON.stringify(text)} runs under the Edit button ${JSON.stringify(button)}`).toBe(false);
});

test('U8: button labels and secondary text meet 4.5:1 contrast', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await openMenu(page);

	const meta = await activeMenu(page).locator('.card-meta').evaluate(el => ({
		color: getComputedStyle(el).color,
		background: getComputedStyle(el.closest('.card')).backgroundColor,
	}));
	expect(contrast(meta.color, meta.background), `card meta ${meta.color} on ${meta.background}`).toBeGreaterThanOrEqual(4.5);

	const primary = await activeMenu(page).locator('.action-add-text').evaluate(el => ({
		color: getComputedStyle(el).color,
		background: getComputedStyle(el).backgroundColor,
	}));
	expect(contrast(primary.color, primary.background), `primary button ${primary.color} on ${primary.background}`).toBeGreaterThanOrEqual(4.5);
});
