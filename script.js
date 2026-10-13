
// ================================== Utils ==================================

// Apostrophe and dash variants are compared as one character each (same length, so positions match).
const APOSTROPHE_VARIANTS = /[’‘‛ʼ`´՚᾽᾿]/g;
const DASH_VARIANTS = /[–—]/g;

function canonical(text) {
	return text.replace(APOSTROPHE_VARIANTS, "'").replace(DASH_VARIANTS, '-');
}

// A token is a run of whitespace (one space token, whatever its length),
// a word (letters and digits, joined by an apostrophe or a dash),
// or one other visible character.
const TOKEN_PATTERN = /\s+|[\p{L}\p{N}]+(?:['-]+[\p{L}\p{N}]+)*['-]*|[^\s\p{L}\p{N}]/gu;

function tokenize(text) {
	return [...canonical(text).matchAll(TOKEN_PATTERN)].map(match => {
		const isSpace = /^\s/.test(match[0]);
		return {
			text: isSpace ? ' ' : match[0],
			raw: text.slice(match.index, match.index + match[0].length),
			start: match.index,
			end: match.index + match[0].length,
		};
	});
}

// Checks the typed tokens against the expected tokens, in order.
// A token is finished when another token follows it, or at once when it is a space.
// A space after the last expected token is allowed; any other extra token is wrong.
function checkTyped(expectedTokens, typed) {
	const actual = tokenize(typed);
	const last = actual.length - 1;

	for (let i = 0; i <= last; i++) {
		const token = actual[i];
		const isSpace = token.text === ' ';
		if (i === last && !isSpace) break;

		const expected = expectedTokens[i];
		if (!expected && isSpace) continue;
		if (!expected || expected.text !== token.text) {
			return {
				ok: false,
				index: i,
				prefix: typed.slice(0, token.start),
				wrong: typed.slice(token.start, token.end),
			};
		}
	}
	return { ok: true, complete: isComplete(expectedTokens, actual) };
}

// Complete: every expected token is typed, and the last one is finished, which means something follows it
// (a space, or any extra token) or it is a mark (a mark cannot grow into a longer token).
// Extra tokens after the expected ones may only be spaces.
function isComplete(expectedTokens, actual) {
	const count = expectedTokens.length;
	if (count === 0 || actual.length < count) return false;
	if (actual.length > count) return actual.slice(count).every(token => token.text === ' ');
	return !/^[\p{L}\p{N}]/u.test(actual[count - 1].text);
}

// Wrong attempts on the same position before the learner gets a hint.
const HINT_AFTER_WRONG_ATTEMPTS = 5;

// -------------------------------- End Utils --------------------------------

// ================================== Texts ==================================

const UI_TEXT = {
	back: 'Назад',
	delete: 'Видалити',
	edit: 'Редагувати',
	menuTitle: 'Картки',
	editorTitle: 'Редактор',
	newCardName: 'Нова картка',
	newTextTitle: 'Назва тексту',
	cancel: 'Скасувати',
	cardDeleteTitle: 'Видалити картку?',
	cardDeleteMessage: 'Цю дію не можна скасувати. Усі тексти картки теж буде видалено.',
	textDeleteTitle: 'Видалити текст?',
	textDeleteMessage: 'Текст буде прибрано з редактора. Щоб зміни збереглися, натисніть «Зберегти».',
	textCount: count => `Текстів: ${count}`,
	progress: (current, total) => `${current} з ${total}`,
	nameRequired: 'Назва картки не може бути порожньою.',
	textRequired: 'Додайте хоча б один текст, перш ніж зберегти картку.',
	noTextsInCard: 'У цій картці немає текстів. Відкрийте редактор і додайте текст.',
	noCards: 'Ще немає карток. Натисніть «Додати», щоб створити першу.',
	moveCard: 'Перетягнути картку',
	transfer: 'Імпорт/експорт',
	transferTitle: 'Імпорт і експорт',
	selectAll: 'Вибрати всі',
	clearSelection: 'Зняти вибір',
	selectedCount: (selected, total) => `Вибрано: ${selected} з ${total}`,
	exportButton: 'Експортувати',
	transferEmpty: 'Ще немає карток для експорту.',
	importButton: 'Імпортувати з файлу',
	importNotJson: 'Файл не є JSON.',
	importFormat: 'Файл не схожий на експорт Stamper.',
	importVersion: 'Ця версія файлу не підтримується.',
	importEmpty: 'У файлі немає карток.',
	importCardName: number => `Картка №${number} не має назви.`,
	importCardTexts: number => `Картка №${number} не має жодного тексту.`,
	importTextFields: number => `У тексті картки №${number} немає назви або тіла.`,
	importDone: count => `Імпортовано карток: ${count}.`,
};

// -------------------------------- End Texts --------------------------------

// ================================== Model ==================================

class Text {
	constructor(title, body){
		this.title = title;
		this.body = body;
	}
}

// The position of a card in the menu: 0 is first. Cards saved before the order existed have none.
class Card {
	constructor(id, name, texts){
		this.id = id;
		this.name = name;
		this.texts = texts;
	}
}

// Cards without an order come last, in id order.
function byOrder(a, b){
	return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;
}

class CardRepository {
	async init(dbname, version){
		this.storeName = 'cards';
		this.db = await new Promise((resolve, reject) => {
			const request = indexedDB.open(dbname, version);

			request.onupgradeneeded = event => {
				const db = event.target.result;
				db.createObjectStore(this.storeName, {keyPath: 'id', autoIncrement: true});
			}

			request.onsuccess = event => resolve(event.target.result);
			request.onerror = event => reject(event.target.error);
		});
	}

	get(byId){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.get(byId);

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(request.error);
		});
	}

	getAll(){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.getAll();

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => resolve(request.error);
		});
	}

	set(card){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readwrite');
			const store = transaction.objectStore(this.storeName);

			const saveData = {...card};
			if(!Number.isInteger(saveData.id)){
				delete saveData.id;
			}

			const request = store.put(saveData);

			request.onsuccess = () => resolve(true);
			request.onerror = () => reject(request.error);
		});
	}

	delete(byId){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readwrite');
			const store = transaction.objectStore(this.storeName);
			const request = store.delete(byId);

			request.onsuccess = () => resolve(true);
			request.onerror = () => reject(request.error);
		});
	}

	// Gives the cards the order of the ids: the first id gets 0, the next 1, and so on. One transaction.
	setOrder(ids){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readwrite');
			const store = transaction.objectStore(this.storeName);

			ids.forEach((id, order) => {
				const request = store.get(id);
				request.onsuccess = () => {
					if(request.result) store.put({...request.result, order});
				};
			});

			transaction.oncomplete = () => resolve(true);
			transaction.onerror = () => reject(transaction.error);
		});
	}

	collect(callback){
		return new Promise((resolve, reject) => {
			const transaction = this.db.transaction(this.storeName, 'readonly');
			const store = transaction.objectStore(this.storeName);
			const request = store.openCursor();

			const result = [];
			request.onsuccess = event => {
				const cursor = event.target.result;

				if(cursor){
					result.push(callback(cursor.value));
					cursor.continue();
				} else {
					resolve(result);
				}
			};

			request.onerror = event => {
				reject(event.target.error);
			};
		});
	}
}

class TrainerModel {
	async init(dbname, version){
		this.cardRepository = new CardRepository();
		await this.cardRepository.init(dbname, version);
	}

	get(id){
		return this.cardRepository.get(+id);
	}

	async getCardsHeadData(){
		const cardsHeadData = await this.cardRepository.collect(value => {
			return {
				id: value.id,
				name: value.name,
				order: value.order,
				textCount: value.texts.length
			}
		});
		cardsHeadData.sort(byOrder);

		// Cards saved before the order existed get one now, in the order they are shown.
		if(cardsHeadData.some(card => card.order === undefined)){
			cardsHeadData.forEach((card, order) => { card.order = order; });
			await this.cardRepository.setOrder(cardsHeadData.map(card => card.id));
		}
		return cardsHeadData;
	}

	// A new card goes last; an edited card keeps its place.
	async saveCard(card){
		const existing = Number.isInteger(card.id) ? await this.cardRepository.get(card.id) : undefined;
		card.order = existing?.order ?? await this.#nextOrder();
		return this.cardRepository.set(card);
	}

	saveCardOrder(ids){
		return this.cardRepository.setOrder(ids);
	}

	// All cards with their texts, in menu order (for export).
	async getAllCards(){
		const cards = await this.cardRepository.collect(value => value);
		return cards.sort(byOrder);
	}

	// Each card is saved as new: it gets a new id and goes last.
	async importCards(cards){
		for(const card of cards){
			await this.saveCard(new Card(undefined, card.name, card.texts));
		}
	}

	async #nextOrder(){
		const orders = await this.cardRepository.collect(value => value.order ?? -1);
		return Math.max(-1, ...orders) + 1;
	}

	async deleteCard(id){
		id = +id;
		if(Number.isInteger(id)){
			await this.cardRepository.delete(id);
			return true;
		}
		return false
	}
}

// -------------------------------- End Model --------------------------------

// ================================== Files ==================================

const FILE_FORMAT = 'stamper';
const FILE_VERSION = 1;
const EXPORT_FILE_NAME = 'stamper-cards.json';

// The file holds names and texts only: ids and order are given again on import.
function exportCards(cards){
	return JSON.stringify({
		format: FILE_FORMAT,
		version: FILE_VERSION,
		cards: cards.map(card => ({
			name: card.name,
			texts: card.texts.map(text => ({ title: text.title, body: text.body })),
		})),
	});
}

// Returns {cards} when the whole file is valid, or {error} with the message for the learner.
// A file with one bad card adds nothing.
function parseCardsFile(text){
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return { error: UI_TEXT.importNotJson };
	}

	if(typeof data !== 'object' || data === null || data.format !== FILE_FORMAT || !Array.isArray(data.cards)){
		return { error: UI_TEXT.importFormat };
	}
	if(data.version !== FILE_VERSION) return { error: UI_TEXT.importVersion };
	if(data.cards.length === 0) return { error: UI_TEXT.importEmpty };

	const cards = [];
	for(let i = 0; i < data.cards.length; i++){
		const number = i + 1;
		const card = data.cards[i];
		if(typeof card?.name !== 'string' || card.name.trim() === '') return { error: UI_TEXT.importCardName(number) };
		if(!Array.isArray(card.texts) || card.texts.length === 0) return { error: UI_TEXT.importCardTexts(number) };
		if(!card.texts.every(text => typeof text?.title === 'string' && typeof text?.body === 'string')){
			return { error: UI_TEXT.importTextFields(number) };
		}
		cards.push({
			name: card.name.trim(),
			texts: card.texts.map(text => ({ title: text.title, body: text.body })),
		});
	}
	return { cards };
}

// -------------------------------- End Files --------------------------------

// ================================== View ===================================

class PanelView {
	constructor(){
		this.element = document.querySelector('header');
		this.titleElement = this.element.querySelector('.title');
		this.leftButtonElement = this.element.querySelector('.left');
		this.rightButtonElement = this.element.querySelector('.right');

		this.onLeftClickHandler = null;
		this.leftButtonElement.addEventListener('click', event => this.onLeftClickHandler());

		this.onRightClickHandler = null;
		this.rightButtonElement.addEventListener('click', event => this.onRightClickHandler());
	}

	setTitle(text){
		this.titleElement.innerText = text;
	}

	deactiveLeftButton(){
		this.leftButtonElement.classList.add('hidden');
		this.onLeftClickHandler = () => {};
	}

	activeLeftButton(text, callback){
		this.leftButtonElement.innerText = text;
		this.leftButtonElement.classList.remove('hidden');
		this.onLeftClickHandler = callback;
	}

	deactiveRightButton(){
		this.rightButtonElement.classList.add('hidden');
		this.onRightClickHandler = () => {};
	}

	// destructive: the red link (Delete); other actions are neutral.
	activeRightButton(text, callback, destructive = true){
		this.rightButtonElement.innerText = text;
		this.rightButtonElement.classList.toggle('destructive', destructive);
		this.rightButtonElement.classList.remove('hidden');
		this.onRightClickHandler = callback;
	}
}

// The app's own confirmation dialog. ask() resolves to true (confirm) or false (cancel, Escape, backdrop).
class ConfirmDialog {
	constructor(){
		this.backdropElement = document.querySelector('.dialog-backdrop');
		this.boxElement = this.backdropElement.querySelector('[role="alertdialog"]');
		this.titleElement = this.backdropElement.querySelector('.dialog-title');
		this.messageElement = this.backdropElement.querySelector('.dialog-message');
		this.cancelElement = this.backdropElement.querySelector('.dialog-cancel');
		this.confirmElement = this.backdropElement.querySelector('.dialog-confirm');

		this.resolve = null;
		this.returnFocusTo = null;

		this.cancelElement.addEventListener('click', () => this.#close(false));
		this.confirmElement.addEventListener('click', () => this.#close(true));
		this.backdropElement.addEventListener('click', event => {
			if(event.target === this.backdropElement) this.#close(false);
		});
		this.boxElement.addEventListener('keydown', event => this.#onKeydown(event));
	}

	ask({ title, message, confirmText = UI_TEXT.delete, cancelText = UI_TEXT.cancel }){
		this.returnFocusTo = document.activeElement;
		this.titleElement.textContent = title;
		this.messageElement.textContent = message;
		this.confirmElement.textContent = confirmText;
		this.cancelElement.textContent = cancelText;
		this.backdropElement.classList.remove('hidden');

		// The safe choice has the focus: Enter cancels.
		this.cancelElement.focus();
		return new Promise(resolve => { this.resolve = resolve; });
	}

	#close(answer){
		this.backdropElement.classList.add('hidden');
		if(this.returnFocusTo) this.returnFocusTo.focus();
		this.returnFocusTo = null;

		const resolve = this.resolve;
		this.resolve = null;
		resolve(answer);
	}

	// Escape cancels; Tab moves between the two buttons only, so the focus stays in the dialog.
	#onKeydown(event){
		if(event.key === 'Escape'){
			event.preventDefault();
			this.#close(false);
			return;
		}
		if(event.key === 'Tab'){
			const buttons = [this.cancelElement, this.confirmElement];
			const index = buttons.indexOf(document.activeElement);
			let next;
			if(event.shiftKey) next = index <= 0 ? buttons.length - 1 : index - 1;
			else next = index === buttons.length - 1 ? 0 : index + 1;
			event.preventDefault();
			buttons[next].focus();
		}
	}
}

class FrameView {
	constructor(element){
		this.element = element;
	}

	show(){
		this.element.classList.add('active');
	}

	hide(){
		this.element.classList.remove('active');
	}
}

// Six dots, the usual drag handle. Static markup: no user data goes into it.
const GRIP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

class MenuView extends FrameView {
	constructor(){
		super(document.querySelector('.frame.menu').closest('.frame-wrapper'));
		this.cardListElement = this.element.querySelector('.card-list');
		this.addButtonElement = this.element.querySelector('.action-add-text');

		this.onAddClickHandler = null;
		this.addButtonElement.addEventListener('click', event => this.onAddClickHandler());

		this.editButtonClickHandler = (id) => {};
		this.cardClickHandler = (id) => {};
		this.cardsReorderedHandler = (ids) => {};

		// The drag in progress, if any. Only one drag at a time, from a mouse, a pen or a finger.
		this.drag = null;
		// Set for a moment after a drag, so the click that the browser may fire on release does not open the card.
		this.suppressCardClick = false;

		window.addEventListener('pointermove', event => this.#moveDrag(event));
		window.addEventListener('pointerup', () => this.#endDrag(true));
		window.addEventListener('pointercancel', () => this.#endDrag(false));
	}

	onEditButtonClickHandler(callback){
		this.editButtonClickHandler = callback;
	}

	onCardClickHandler(callback){
		this.cardClickHandler = callback;
	}

	// Called with the ids of all cards in their new order, after a drag or a key press.
	onCardsReordered(callback){
		this.cardsReorderedHandler = callback;
	}

	renderCards(cards){
		if(cards.length === 0){
			const emptyElem = document.createElement('p');
			emptyElem.classList.add('empty-state');
			emptyElem.textContent = UI_TEXT.noCards;
			this.cardListElement.replaceChildren(emptyElem);
			return;
		}

		const newElements = cards.map(card => {
			const cardElem = document.createElement('div');
			cardElem.classList.add('card');
			cardElem.dataset.id = card.id;

			const handleElem = document.createElement('button');
			handleElem.classList.add('card-handle');
			handleElem.setAttribute('aria-label', UI_TEXT.moveCard);
			handleElem.innerHTML = GRIP_ICON;

			const infoElem = document.createElement('div');
			infoElem.classList.add('card-info');

			const nameElem = document.createElement('h3');
			nameElem.textContent = card.name;

			const metaElem = document.createElement('span');
			metaElem.classList.add('card-meta');
			metaElem.textContent = UI_TEXT.textCount(card.textCount);

			infoElem.append(nameElem, metaElem);

			const controlsElem = document.createElement('div');
			controlsElem.classList.add('controls');

			const editButtonElem = document.createElement('button');
			editButtonElem.classList.add('action-edit-text');
			editButtonElem.textContent = UI_TEXT.edit;

			controlsElem.appendChild(editButtonElem);
			cardElem.append(handleElem, infoElem, controlsElem);
			return cardElem;
		});

		this.cardListElement.replaceChildren(...newElements);
		newElements.forEach(elem => elem.addEventListener('click', async event => {
			if(this.suppressCardClick) return;
			await this.cardClickHandler(event.target.closest('.card').dataset.id);
		}));

		newElements.forEach(elem => this.#addDragHandlers(elem.querySelector('.card-handle')));

		newElements.forEach(elem => elem.querySelector('.action-edit-text')
			.addEventListener('click', async event => {
				event.stopPropagation();
				const id = event.target.closest('.card').dataset.id;
				await this.editButtonClickHandler(id);
			}));
	}

	onAddButtonClick(callback){
		this.onAddClickHandler = callback;
	}

	#addDragHandlers(handleElem){
		// A click on the handle is not a click on the card.
		handleElem.addEventListener('click', event => event.stopPropagation());
		handleElem.addEventListener('pointerdown', event => this.#startDrag(event));
		handleElem.addEventListener('keydown', event => this.#onHandleKeydown(event));
	}

	#cardIds(){
		return [...this.cardListElement.querySelectorAll('.card')].map(elem => +elem.dataset.id);
	}

	// The card moves to the body and follows the pointer; a placeholder keeps its slot in the list.
	#startDrag(event){
		if(event.button !== 0 || this.drag) return;
		event.preventDefault();

		const cardElem = event.currentTarget.closest('.card');
		const rect = cardElem.getBoundingClientRect();
		const placeholder = document.createElement('div');
		placeholder.classList.add('card-placeholder');
		placeholder.style.height = `${rect.height}px`;

		this.drag = {
			cardElem,
			placeholder,
			startY: event.clientY,
			startTop: rect.top,
			nextElem: cardElem.nextElementSibling,
			idsBefore: this.#cardIds(),
		};

		cardElem.before(placeholder);
		Object.assign(cardElem.style, {
			position: 'fixed',
			top: `${rect.top}px`,
			left: `${rect.left}px`,
			width: `${rect.width}px`,
		});
		cardElem.classList.add('dragging');
		document.body.append(cardElem);
	}

	#moveDrag(event){
		if(!this.drag) return;
		const { cardElem, placeholder, startY, startTop } = this.drag;
		cardElem.style.top = `${startTop + event.clientY - startY}px`;

		// The placeholder moves past a neighbour once the pointer has passed that neighbour's middle.
		let previous = placeholder.previousElementSibling;
		while(previous && event.clientY < this.#middle(previous)){
			this.cardListElement.insertBefore(placeholder, previous);
			previous = placeholder.previousElementSibling;
		}
		let next = placeholder.nextElementSibling;
		while(next && event.clientY > this.#middle(next)){
			this.cardListElement.insertBefore(next, placeholder);
			next = placeholder.nextElementSibling;
		}
	}

	// save is false when the browser cancels the pointer: the card goes back to where it was.
	#endDrag(save){
		if(!this.drag) return;
		const { cardElem, placeholder, nextElem, idsBefore } = this.drag;
		this.drag = null;

		if(!save) this.cardListElement.insertBefore(placeholder, nextElem);
		placeholder.replaceWith(cardElem);
		cardElem.removeAttribute('style');
		cardElem.classList.remove('dragging');

		this.suppressCardClick = true;
		setTimeout(() => { this.suppressCardClick = false; });

		const idsAfter = this.#cardIds();
		if(save && idsAfter.join() !== idsBefore.join()) this.cardsReorderedHandler(idsAfter);
	}

	#middle(elem){
		const rect = elem.getBoundingClientRect();
		return rect.top + rect.height / 2;
	}

	// ArrowUp and ArrowDown move the card one place. The handle keeps the focus, which moving the element would lose.
	#onHandleKeydown(event){
		const handleElem = event.currentTarget;
		const cardElem = handleElem.closest('.card');

		if(event.key === 'ArrowUp' && cardElem.previousElementSibling){
			this.cardListElement.insertBefore(cardElem, cardElem.previousElementSibling);
		} else if(event.key === 'ArrowDown' && cardElem.nextElementSibling){
			this.cardListElement.insertBefore(cardElem.nextElementSibling, cardElem);
		} else {
			return;
		}

		event.preventDefault();
		handleElem.focus();
		this.cardsReorderedHandler(this.#cardIds());
	}
}

class TransferView extends FrameView {
	constructor(){
		super(document.querySelector('.frame.transfer').closest('.frame-wrapper'));
		this.listElement = this.element.querySelector('.transfer-list');
		this.countElement = this.element.querySelector('.transfer-count');
		this.selectAllButtonElement = this.element.querySelector('.action-select-all');
		this.importButtonElement = this.element.querySelector('.action-import');
		this.fileInputElement = this.element.querySelector('input[type=file]');
		this.exportButtonElement = this.element.querySelector('.action-export');
		this.messageElement = this.element.querySelector('.form-message');

		this.exportClickHandler = async () => {};
		this.fileChosenHandler = async (file) => {};

		this.selectAllButtonElement.addEventListener('click', () => this.#toggleAll());
		this.listElement.addEventListener('change', () => this.#updateSelection());
		this.exportButtonElement.addEventListener('click', async () => await this.exportClickHandler());
		this.importButtonElement.addEventListener('click', () => this.fileInputElement.click());
		this.fileInputElement.addEventListener('change', async () => {
			const file = this.fileInputElement.files[0];
			// Reset, so that choosing the same file again also starts an import.
			this.fileInputElement.value = '';
			if(file) await this.fileChosenHandler(file);
		});
	}

	onExportClick(callback){
		this.exportClickHandler = callback;
	}

	onFileChosen(callback){
		this.fileChosenHandler = callback;
	}

	renderCards(cards){
		this.messageElement.textContent = '';
		this.messageElement.classList.remove('success');

		if(cards.length === 0){
			const emptyElem = document.createElement('p');
			emptyElem.classList.add('empty-state');
			emptyElem.textContent = UI_TEXT.transferEmpty;
			this.listElement.replaceChildren(emptyElem);
		} else {
			const itemElems = cards.map(card => {
				const labelElem = document.createElement('label');
				labelElem.classList.add('transfer-item');

				const checkElem = document.createElement('input');
				checkElem.type = 'checkbox';
				checkElem.dataset.id = card.id;

				const nameElem = document.createElement('span');
				nameElem.classList.add('transfer-name');
				nameElem.textContent = card.name;

				const metaElem = document.createElement('span');
				metaElem.classList.add('transfer-meta');
				metaElem.textContent = UI_TEXT.textCount(card.texts.length);

				labelElem.append(checkElem, nameElem, metaElem);
				return labelElem;
			});
			this.listElement.replaceChildren(...itemElems);
		}
		this.#updateSelection();
	}

	selectedIds(){
		return [...this.listElement.querySelectorAll('input[type=checkbox]:checked')].map(box => +box.dataset.id);
	}

	showMessage(text = '', success = false){
		this.messageElement.textContent = text;
		this.messageElement.classList.toggle('success', success);
	}

	download(fileName, text){
		const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	#boxes(){
		return [...this.listElement.querySelectorAll('input[type=checkbox]')];
	}

	#toggleAll(){
		const boxes = this.#boxes();
		const allChecked = boxes.every(box => box.checked);
		boxes.forEach(box => { box.checked = !allChecked; });
		this.#updateSelection();
	}

	#updateSelection(){
		const boxes = this.#boxes();
		const selected = boxes.filter(box => box.checked).length;
		this.countElement.textContent = UI_TEXT.selectedCount(selected, boxes.length);
		this.selectAllButtonElement.textContent = boxes.length > 0 && selected === boxes.length ? UI_TEXT.clearSelection : UI_TEXT.selectAll;
		this.selectAllButtonElement.disabled = boxes.length === 0;
		this.exportButtonElement.disabled = selected === 0;
	}
}

class CardEditorView extends FrameView {
	constructor(){
		super(document.querySelector('.frame.edit-card').closest('.frame-wrapper'));
		this.cardNameElement = this.element.querySelector('.card-name');
		this.textListElement = this.element.querySelector('.text-list');
		this.messageElement = this.element.querySelector('.form-message');
		this.addButtonElement = this.element.querySelector('.action-add');
		this.saveButtonElement = this.element.querySelector('.action-save');

		this.addButtonElement.addEventListener('click', event => {
			const textEditorElem = this.#newTextElement(new Text(UI_TEXT.newTextTitle, ''));
			this.textListElement.appendChild(textEditorElem);
			this.#addEventHandlers(textEditorElem);
		});

		this.onSaveClickHandler = (async (card) => {});
		this.deleteTextHandler = (async () => true);
		this.saveButtonElement.addEventListener('click', async event => {
			const cardName = this.cardNameElement.innerText;
			const textObjList = Array.from(this.textListElement.querySelectorAll('.editor'))
				.map(editorElem => {
					const title = editorElem.querySelector('h3.title').innerText;
					const body = editorElem.querySelector('.text').innerText;
					return new Text(title, body);
				});

			await this.onSaveClickHandler(new Card(
				(+this.textListElement.dataset.id) || undefined,
				cardName,
				textObjList
			));
		});
	}

	hide(){
		delete this.textListElement.dataset.id;
		super.hide();
	}

	getCurrentCardId(){
		return this.textListElement.dataset.id;
	}

	onSaveButtonClick(callback){
		this.onSaveClickHandler = callback;
	}

	showMessage(text = ''){
		this.messageElement.textContent = text;
	}

	#newTextElement(textObj){
		const textEditorElem = document.createElement('div');
		textEditorElem.classList.add('editor');

		const titleElem = document.createElement('div');
		titleElem.classList.add('title');

		const titleTextElem = document.createElement('h3');
		titleTextElem.classList.add('title');
		titleTextElem.contentEditable = 'true';
		titleTextElem.textContent = textObj.title;

		const deleteButtonElem = document.createElement('button');
		deleteButtonElem.classList.add('action-delete-text');
		deleteButtonElem.textContent = UI_TEXT.delete;

		titleElem.append(titleTextElem, deleteButtonElem);

		const bodyElem = document.createElement('div');
		bodyElem.classList.add('text');
		bodyElem.contentEditable = 'true';
		bodyElem.textContent = textObj.body;

		textEditorElem.append(titleElem, bodyElem);
		return textEditorElem;
	}

	onDeleteTextClick(callback){
		this.deleteTextHandler = callback;
	}

	#addEventHandlers(textEditorElem){
		textEditorElem.querySelector('.action-delete-text')
			.addEventListener('click', async event => {
				const editorElem = event.target.closest('.editor');
				if(!await this.deleteTextHandler()) return;
				editorElem.remove();
			});
	}

	renderCard(card){
		if(card.id != undefined){
			this.textListElement.dataset.id = card.id;
		} else {
			delete this.textListElement.dataset.id;
		}

		this.showMessage('');
		this.cardNameElement.innerText = card.name;
		const textEditorElems = card.texts.map(textObj => this.#newTextElement(textObj));
		this.textListElement.replaceChildren(...textEditorElems);
		textEditorElems.forEach(elem => this.#addEventHandlers(elem));
	}
}

class MemoryCheckView extends FrameView {
	constructor(){
		super(document.querySelector('.frame.trainer').closest('.frame-wrapper'));
		this.titleElement = this.element.querySelector('.title h3');
		this.textElement = this.element.querySelector('.text');
		this.backTextElement = this.element.querySelector('.action-back-text');
		this.nextTextElement = this.element.querySelector('.action-next-text');
		this.progressElement = this.element.querySelector('.progress');

		// 'text': the text is shown, as at opening; 'typing': the learner types; 'empty': no texts
		this.state = 'text';
		this.expectedText = '';
		this.expectedTokens = [];
		this.blocked = null;
		this.attempts = { index: -1, count: 0 };
		this.hint = null;

		this.textElement.addEventListener('beforeinput', event => this.#onBeforeInput(event));
		this.textElement.addEventListener('input', event => {
			if(!event.isComposing) this.#validateTyped();
		});
		this.textElement.addEventListener('compositionend', () => this.#validateTyped());

		this.textElement.addEventListener('click', () => {
			if(this.state === 'text') this.#startTyping();
			this.textElement.focus();
		});

		this.backTextElement.addEventListener('click', async event => {
			this.#deactiveEditor();
			await this.backButtonClickHandler();
		});
		this.nextTextElement.addEventListener('click', async event => {
			this.#deactiveEditor();
			await this.nextButtonClickHandler();
		});
	}

	onBackButtonClick(callback){
		this.backButtonClickHandler = callback;
	}

	onNextButtonClick(callback){
		this.nextButtonClickHandler = callback;
	}

	setTitle(text){
		this.titleElement.innerText = text;
	}

	setProgress(current, total){
		this.progressElement.textContent = UI_TEXT.progress(current, total);
	}

	renderText(text){
		this.state = 'text';
		this.expectedText = text;
		this.expectedTokens = tokenize(text);
		this.blocked = null;
		this.attempts = { index: -1, count: 0 };
		this.hint = null;
		this.#deactiveEditor();
		this.backTextElement.classList.remove('hidden');
		this.nextTextElement.classList.remove('hidden');
		this.textElement.innerText = text;
	}

	renderEmpty(message){
		this.state = 'empty';
		this.blocked = null;
		this.#deactiveEditor();
		this.backTextElement.classList.add('hidden');
		this.nextTextElement.classList.add('hidden');
		this.progressElement.textContent = '';
		this.textElement.innerText = message;
	}

	// A click on the shown text starts typing: the field is cleared, and the attempts start from zero.
	#startTyping(){
		this.state = 'typing';
		this.attempts = { index: -1, count: 0 };
		this.hint = null;
		this.textElement.setAttribute('contenteditable', true);
		this.textElement.textContent = '';
	}

	// Complete text: back to the view shown at opening (the original text, not editable).
	#finish(){
		this.state = 'text';
		this.blocked = null;
		this.hint = null;
		this.#deactiveEditor();
		this.textElement.textContent = this.expectedText;
	}

	// While a wrong token is shown, typing is blocked; only Backspace works and removes the whole token.
	// Outside that state, the caret must be at the end: the check only looks at the end of the text.
	#onBeforeInput(event){
		if(this.state !== 'typing'){
			event.preventDefault();
			return;
		}

		if(this.hint) this.#clearHint();
		if(event.isComposing) return;

		if(this.blocked){
			event.preventDefault();
			if(event.inputType.startsWith('delete')) this.#unblock();
			return;
		}
		if(!this.#caretAtEnd()){
			event.preventDefault();
			this.#placeCaretAtEnd();
		}
	}

	// Runs after every change the browser made to the text; the browser may have typed a whole word (phones, paste).
	#validateTyped(){
		if(this.state !== 'typing') return;

		// Deleting all text can leave a line break behind; it is not a typed space.
		if(this.textElement.textContent === ''){
			this.textElement.replaceChildren();
			this.#placeCaretAtEnd();
		}

		if(this.blocked){
			this.#renderBlocked();
			return;
		}

		const result = checkTyped(this.expectedTokens, this.textElement.innerText);
		if(result.ok){
			if(result.complete) this.#finish();
			return;
		}

		if(this.attempts.index !== result.index) this.attempts = { index: result.index, count: 0 };
		this.attempts.count += 1;

		this.blocked = {
			prefix: result.prefix,
			wrong: result.wrong,
			index: result.index,
			hintDue: this.attempts.count >= HINT_AFTER_WRONG_ATTEMPTS,
		};
		this.#renderBlocked();
		this.#vibrate();
	}

	#renderBlocked(){
		const wrongElem = document.createElement('span');
		wrongElem.classList.add(/^\s+$/.test(this.blocked.wrong) ? 'wrong-space' : 'wrong');
		wrongElem.textContent = this.blocked.wrong;

		this.textElement.replaceChildren(document.createTextNode(this.blocked.prefix), wrongElem);
		this.#placeCaretAtEnd();
	}

	#unblock(){
		const { prefix, index, hintDue } = this.blocked;
		this.blocked = null;
		this.textElement.textContent = prefix;

		const expected = this.expectedTokens[index];
		if(hintDue && expected){
			this.attempts.count = 0;
			this.hint = expected.text === ' ' ? '␣' : expected.raw;
			this.#renderHint();
		}
		this.#placeCaretAtEnd();
	}

	// The hint is a pseudo-element: it is not text, so it is never typed, checked or copied.
	#renderHint(){
		const hintElem = document.createElement('span');
		hintElem.classList.add('hint');
		hintElem.dataset.hint = this.hint;
		this.textElement.appendChild(hintElem);
	}

	#clearHint(){
		this.hint = null;
		this.textElement.querySelector('.hint')?.remove();
	}

	#caretAtEnd(){
		const selection = getSelection();
		if(!selection.rangeCount) return false;

		const range = selection.getRangeAt(0);
		if(!this.textElement.contains(range.endContainer)) return false;

		const beforeCaret = document.createRange();
		beforeCaret.selectNodeContents(this.textElement);
		beforeCaret.setEnd(range.endContainer, range.endOffset);
		return beforeCaret.toString().length === this.textElement.textContent.length;
	}

	#placeCaretAtEnd(){
		const range = document.createRange();
		const hintElem = this.textElement.querySelector('.hint');
		if(hintElem){
			range.setStartBefore(hintElem);
			range.collapse(true);
		} else {
			range.selectNodeContents(this.textElement);
			range.collapse(false);
		}

		const selection = getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	}

	#vibrate(){
		if(typeof navigator.vibrate === 'function') navigator.vibrate(200);
	}

	#deactiveEditor(){
		this.textElement.removeAttribute('contenteditable');
	}
}

// -------------------------------- End View ---------------------------------

// =============================== Controller ================================

class MenuController {
	constructor(app){
		this.app = app;
		this.view = new MenuView();

		this.view.onEditButtonClickHandler(async id => {
			await this.app.toCardEditor(id);
		});

		this.view.onCardClickHandler(async id => {
			await this.app.toMemoryCheck(id);
		});

		this.view.onCardsReordered(async ids => {
			await this.app.model.saveCardOrder(ids);
		});
	}

	async active(){
		const cardsHeadData = await this.app.model.getCardsHeadData();
		this.view.renderCards(cardsHeadData);
		this.view.onAddButtonClick(() => this.app.toCardEditor());

		this.view.show();

		this.app.pannel.setTitle(UI_TEXT.menuTitle);
		this.app.pannel.deactiveLeftButton();
		this.app.pannel.activeRightButton(UI_TEXT.transfer, async () => await this.app.toTransfer(), false);
	}

	async deactive(){
		this.view.hide();
	}
}

class TransferController {
	constructor(app){
		this.app = app;
		this.view = new TransferView();

		this.view.onExportClick(async () => {
			const ids = this.view.selectedIds();
			const cards = (await this.app.model.getAllCards()).filter(card => ids.includes(card.id));
			this.view.download(EXPORT_FILE_NAME, exportCards(cards));
		});

		this.view.onFileChosen(async file => {
			const result = parseCardsFile(await file.text());
			if(result.error){
				this.view.showMessage(result.error);
				return;
			}

			await this.app.model.importCards(result.cards);
			await this.#renderCards();
			this.view.showMessage(UI_TEXT.importDone(result.cards.length), true);
		});
	}

	async #renderCards(){
		this.view.renderCards(await this.app.model.getAllCards());
	}

	async active(){
		await this.#renderCards();
		this.view.show();

		this.app.pannel.setTitle(UI_TEXT.transferTitle);
		this.app.pannel.activeLeftButton(UI_TEXT.back, async () => await this.app.toMenu());
		this.app.pannel.deactiveRightButton();
	}

	async deactive(){
		this.view.hide();
	}
}

class CardEditorController {
	constructor(app){
		this.app = app;
		this.view = new CardEditorView();

		this.view.onDeleteTextClick(() => this.app.confirm.ask({
			title: UI_TEXT.textDeleteTitle,
			message: UI_TEXT.textDeleteMessage,
		}));

		this.view.onSaveButtonClick(async (card) => {
			const problem = this.#validate(card);
			this.view.showMessage(problem ?? '');
			if(problem) return;

			await this.app.model.saveCard(card);
			await this.app.toMenu();
		});
	}

	#validate(card){
		if(card.name.trim() === '') return UI_TEXT.nameRequired;
		if(card.texts.length === 0) return UI_TEXT.textRequired;
		return null;
	}

	async active(){
		this.view.show();
		this.app.pannel.setTitle(UI_TEXT.editorTitle);
		this.app.pannel.activeLeftButton(UI_TEXT.back, async () => await this.app.toMenu());
		this.app.pannel.activeRightButton(UI_TEXT.delete, async () => {
			const confirmed = await this.app.confirm.ask({
				title: UI_TEXT.cardDeleteTitle,
				message: UI_TEXT.cardDeleteMessage,
			});
			if(!confirmed) return;
			await this.app.model.deleteCard(this.view.getCurrentCardId());
			await this.app.toMenu();
		});
	}

	async deactive(){
		this.view.hide();
	}

	async showCard(id=null){
		if(id != null){
			this.view.renderCard(await this.app.model.get(id));
		} else {
			this.view.renderCard(new Card(undefined, UI_TEXT.newCardName, [new Text(UI_TEXT.newTextTitle, '')]));
		}
	}
}

class MemoryCheckController {
	constructor(app){
		this.app = app;
		this.view = new MemoryCheckView();
		this.currentCard = null;
		this.currentTextIndex = 0;

		this.view.onBackButtonClick(async () => {
			this.#renderText(this.#prevText());
		});
		this.view.onNextButtonClick(async () => {
			this.#renderText(this.#nextText());
		});
	}

	#currentText(){
		return this.currentCard.texts[this.currentTextIndex];
	}

	#prevText(){
		const textsLen = this.currentCard.texts.length;
		let index = this.currentTextIndex - 1;
		index = (index + textsLen) % textsLen;
		this.currentTextIndex = index;
		return this.#currentText();
	}

	#nextText(){
		const textsLen = this.currentCard.texts.length;
		let index = this.currentTextIndex + 1;
		index = (index + textsLen) % textsLen;
		this.currentTextIndex = index;
		return this.#currentText();
	}

	async active(){
		this.view.show();
		this.app.pannel.setTitle(this.currentCard.name);
		this.app.pannel.activeLeftButton(UI_TEXT.back, async () => await this.app.toMenu());
	}

	async deactive(){
		this.view.hide();
	}

	#renderText(textObj){
		this.view.setTitle(textObj.title);
		this.view.setProgress(this.currentTextIndex + 1, this.currentCard.texts.length);
		this.view.renderText(textObj.body);
	}

	async showCard(id){
		this.currentCard = await this.app.model.get(id);
		this.currentTextIndex = 0;

		if(this.currentCard.texts.length === 0){
			this.view.setTitle(this.currentCard.name);
			this.view.renderEmpty(UI_TEXT.noTextsInCard);
			return;
		}
		this.#renderText(this.currentCard.texts[this.currentTextIndex]);
	}
}

class App {
	constructor(){
		this.model = new TrainerModel();
		this.pannel = new PanelView();
		this.confirm = new ConfirmDialog();

		this.menu = new MenuController(this);
		this.cardEditor = new CardEditorController(this);
		this.memoryCheck = new MemoryCheckController(this);
		this.transfer = new TransferController(this);
	}

	async start(){
		await this.model.init('cards', 1);

		this.currentController = this.menu;
		await this.menu.active();
	}

	async #switchTo(controller){
		await this.currentController.deactive();
		this.currentController = controller;
		await this.currentController.active();
	}

	async toMenu(){
		await this.#switchTo(this.menu);
	}

	async toCardEditor(id = null){
		await this.cardEditor.showCard(id);
		await this.#switchTo(this.cardEditor);
	}

	async toTransfer(){
		await this.#switchTo(this.transfer);
	}

	async toMemoryCheck(id){
		await this.memoryCheck.showCard(id);
		await this.#switchTo(this.memoryCheck);
	}
}

// ----------------------------- End Controller ------------------------------

// ============================ Init Application =============================

document.addEventListener('DOMContentLoaded', async () => {
	const app = new App();
	await app.start();
	window.app = app;
})

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('sw.js').then((reg) => {
			
			// Check for updates once immediately upon application startup
			reg.update();

			// Logic when a new Service Worker is detected
			reg.addEventListener('updatefound', () => {
				const newWorker = reg.installing;
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						// Send a signal to activate the new SW immediately
						newWorker.postMessage('skipWaiting');
					}
				});
			});
		});

		// Reload the page only if the user is at the initial stage of loading
		let refreshing = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!refreshing) {
				refreshing = true;
				window.location.reload();
			}
		});
	});
}

// -------------------------- End Init Application ---------------------------
