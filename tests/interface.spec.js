// Interface language tests.
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

test('U1/U2: the page is Ukrainian, and the menu shows Ukrainian labels', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{ id: 1, name: 'Картка', texts: [{ title: 't', body: 'b' }] }]);
	await page.reload();

	await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
	await expect(page.locator('header .title')).toHaveText('Картки');
	await expect(activeMenu(page).locator('.action-add-text')).toHaveText('Додати');
	await expect(activeMenu(page).locator('.card .action-edit-text').first()).toHaveText('Редагувати');
});

test('U3: the editor shows Ukrainian labels and default names', async ({ page }) => {
	await openApp(page);
	await activeMenu(page).locator('.action-add-text').click();

	await expect(activeEditor(page)).toBeVisible();
	await expect(page.locator('header .title')).toHaveText('Редактор');
	await expect(page.locator('header .left')).toHaveText('Назад');
	await expect(page.locator('header .right')).toHaveText('Видалити');
	await expect(activeEditor(page).locator('.action-add')).toHaveText('Додати');
	await expect(activeEditor(page).locator('.action-save')).toHaveText('Зберегти');
	await expect(activeEditor(page).locator('.action-delete-text')).toHaveText('Видалити');
	await expect(activeEditor(page).locator('.card-name')).toHaveText('Нова картка');
	await expect(activeEditor(page).locator('.editor h3.title')).toHaveText('Назва тексту');
});

test('U4: the Memory check screen shows Ukrainian labels', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{ id: 2, name: 'Тренування', texts: [{ title: 'Текст', body: 'Текст.' }] }]);
	await page.reload();
	await activeMenu(page).locator('.card', { hasText: 'Тренування' }).click();

	await expect(activeTrainer(page)).toBeVisible();
	await expect(page.locator('header .left')).toHaveText('Назад');
	await expect(activeTrainer(page).locator('.action-back-text')).toHaveText('Назад');
	await expect(activeTrainer(page).locator('.action-check-text')).toHaveText('Перевірити');
	await expect(activeTrainer(page).locator('.action-again-text')).toHaveText('Ще раз');
	await expect(activeTrainer(page).locator('.action-next-text')).toHaveText('Далі');
});

test('U5: the static markup has no English labels', async ({ request }) => {
	const html = await (await request.get('/')).text();
	for (const english of ['>Add<', '>Save<', '>Edit<', '>Back<', '>Check<', '>Again<', '>Next<', 'Card name', 'Card 1']) {
		expect(html, `English "${english}" is still in index.html`).not.toContain(english);
	}
	expect(html).toContain('Назва картки');
});

test('U6: stored cards keep their names and texts after the change', async ({ page }) => {
	await openApp(page);
	await seedCards(page, [{
		id: 3,
		name: 'Збережена картка',
		texts: [{ title: 'Назва, що була', body: 'Текст, що був.' }],
	}]);
	await page.reload();

	await activeMenu(page).locator('.card', { hasText: 'Збережена картка' }).locator('.action-edit-text').click();
	await expect(activeEditor(page).locator('.card-name')).toHaveText('Збережена картка');
	await expect(activeEditor(page).locator('.editor h3.title')).toHaveText('Назва, що була');
	await expect(activeEditor(page).locator('.editor .text')).toHaveText('Текст, що був.');
});
