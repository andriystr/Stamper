
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
	confirmDeleteCard: 'Видалити картку разом з усіма текстами? Цю дію не можна скасувати.',
	confirmDeleteText: 'Видалити цей текст?',
	textCount: count => `Текстів: ${count}`,
	progress: (current, total) => `${current} з ${total}`,
	nameRequired: 'Назва картки не може бути порожньою.',
	textRequired: 'Додайте хоча б один текст, перш ніж зберегти картку.',
	noTextsInCard: 'У цій картці немає текстів. Відкрийте редактор і додайте текст.',
};

// -------------------------------- End Texts --------------------------------

// ================================== Model ==================================

class Text {
	constructor(title, body){
		this.title = title;
		this.body = body;
	}
}

class Card {
	constructor(id, name, texts){
		this.id = id;
		this.name = name;
		this.texts = texts;
	}
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
				textCount: value.texts.length
			}
		});
		return cardsHeadData.sort((a, b) => a.id - b.id);
	}

	saveCard(card){
		return this.cardRepository.set(card);
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

	activeRightButton(text, callback){
		this.rightButtonElement.innerText = text;
		this.rightButtonElement.classList.remove('hidden');
		this.onRightClickHandler = callback;
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

class MenuView extends FrameView {
	constructor(){
		super(document.querySelector('.frame.menu').closest('.frame-wrapper'));
		this.cardListElement = this.element.querySelector('.card-list');
		this.addButtonElement = this.element.querySelector('.action-add-text');

		this.onAddClickHandler = null;
		this.addButtonElement.addEventListener('click', event => this.onAddClickHandler());

		this.editButtonClickHandler = (id) => {};
		this.cardClickHandler = (id) => {};
	}

	onEditButtonClickHandler(callback){
		this.editButtonClickHandler = callback;
	}

	onCardClickHandler(callback){
		this.cardClickHandler = callback;
	}

	renderCards(cards){
		const newElements = cards.map(card => {
			const cardElem = document.createElement('div');
			cardElem.classList.add('card');
			cardElem.dataset.id = card.id;

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
			cardElem.append(infoElem, controlsElem);
			return cardElem;
		});

		this.cardListElement.replaceChildren(...newElements);
		newElements.forEach(elem => elem.addEventListener('click', async event => {
			await this.cardClickHandler(event.target.closest('.card').dataset.id);
		}));

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

	#addEventHandlers(textEditorElem){
		textEditorElem.querySelector('.action-delete-text')
			.addEventListener('click', event => {
				if(!confirm(UI_TEXT.confirmDeleteText)) return;
				event.target.closest('.editor').remove();
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
		textEditorElems.forEach(this.#addEventHandlers);
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
	}

	async active(){
		const cardsHeadData = await this.app.model.getCardsHeadData();
		this.view.renderCards(cardsHeadData);
		this.view.onAddButtonClick(() => this.app.toCardEditor());

		this.view.show();

		this.app.pannel.setTitle(UI_TEXT.menuTitle);
		this.app.pannel.deactiveLeftButton();
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
			if(!confirm(UI_TEXT.confirmDeleteCard)) return;
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

		this.menu = new MenuController(this);
		this.cardEditor = new CardEditorController(this);
		this.memoryCheck = new MemoryCheckController(this);
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
