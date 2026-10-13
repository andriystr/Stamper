
// ================================== Utils ==================================

function diffText(textA, textB) {
	const regex = /(\s+|[.,!?-]|\p{L}+|\p{N}+)/u;
	
	const a = textA.split(regex).filter(Boolean);
	const b = textB.split(regex).filter(Boolean);

	const n = a.length;
	const m = b.length;
	const maxD = n + m;
	
	const v = new Array(2 * maxD + 1);
	v[maxD + 1] = 0;
	const history = [];

	let x, y;
	let found = false;

	for (let d = 0; d <= maxD; d++) {
		history.push([...v]);

		for (let k = -d; k <= d; k += 2) {
			const kIdx = k + maxD;
			
			if (k === -d || (k !== d && v[kIdx - 1] < v[kIdx + 1])) {
				x = v[kIdx + 1]; 
			} else {
				x = v[kIdx - 1] + 1; 
			}

			y = x - k;

			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}

			v[kIdx] = x;

			if (x >= n && y >= m) {
				found = true;
				break;
			}
		}
		if (found) break;
	}

	x = n;
	y = m;
	const diff = [];

	for (let d = history.length - 1; d >= 0; d--) {
		const currentV = history[d];
		const k = x - y;
		const kIdx = k + maxD;

		let prevK;
		if (k === -d || (k !== d && currentV[kIdx - 1] < currentV[kIdx + 1])) {
			prevK = k + 1;
		} else {
			prevK = k - 1;
		}

		const prevX = currentV[prevK + maxD];
		const prevY = prevX - prevK;

		while (x > prevX && y > prevY) {
			diff.unshift({ type: 'keep', value: a[x - 1] });
			x--;
			y--;
		}

		if (d > 0) {
			if (x === prevX) {
				diff.unshift({ type: 'add', value: b[y - 1] });
				y--;
			} else {
				diff.unshift({ type: 'remove', value: a[x - 1] });
				x--;
			}
		}
	}

	return diff;
}

function groupDiff(diffList) {
	if (!diffList || diffList.length === 0) return [];

	const grouped = [];

	let currentGroup = {
		type: diffList[0].type,
		value: diffList[0].value
	};

	for (let i = 1; i < diffList.length; i++) {
		const item = diffList[i];

		if (item.type === currentGroup.type) {
			currentGroup.value += item.value;
		} else {
			grouped.push(currentGroup);
			currentGroup = {
				type: item.type,
				value: item.value
			};
		}
	}

	grouped.push(currentGroup);

	return grouped;
}

function detectReplacements(groupedDiff, maxLengthDiff = 10) {
	if (!groupedDiff || groupedDiff.length === 0) return [];

	const result = [];

	for (let i = 0; i < groupedDiff.length; i++) {
		const current = groupedDiff[i];
		const next = groupedDiff[i + 1];

		if (current.type === 'remove' && next && next.type === 'add') {
			if (current.value.trim() === '' && next.value.trim() === '') {
				result.push(current);
				continue;
			}

			const lengthDifference = Math.abs(current.value.length - next.value.length);

			if (lengthDifference <= maxLengthDiff) {
				result.push({
					type: 'replace',
					removed: current.value,
					added: next.value
				});
				i++;
			} else {
				result.push(current);
			}
		} else {
			result.push(current);
		}
	}

	return result;
}

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
	return { ok: true };
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

	getDifference(original, userInput){
		const origin = canonical(original.replaceAll(/\s+/g, ' '));
		const input = canonical(userInput.replaceAll(/\s+/g, ' '));

		const diffList = diffText(origin, input);
		const groupedDiff = groupDiff(diffList);
		const diffWithReplaces = detectReplacements(groupedDiff, 10);
		return diffWithReplaces;
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
		this.checkTextElement = this.element.querySelector('.action-check-text');
		this.againTextElement = this.element.querySelector('.action-again-text');
		this.nextTextElement = this.element.querySelector('.action-next-text');
		this.progressElement = this.element.querySelector('.progress');

		this.blocked = null;
		this.expectedTokens = [];
		this.attempts = { index: -1, count: 0 };
		this.hint = null;

		this.textElement.addEventListener('beforeinput', event => this.#onBeforeInput(event));
		this.textElement.addEventListener('input', event => {
			if(!event.isComposing) this.#validateTyped();
		});
		this.textElement.addEventListener('compositionend', () => this.#validateTyped());

		this.textElement.addEventListener('keydown', event => {
			if(event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !this.checkTextElement.classList.contains('hidden')){
				event.preventDefault();
				this.checkTextElement.click();
			}
		});

		this.textElement.addEventListener('click', event => {
			if(this.state === 'text' && !this.textElement.attributes.contenteditable){
				this.#activeEditor();
				this.textElement.innerText = '';
			}

			this.textElement.focus();
		});

		this.backTextElement.addEventListener('click', async event => {
			this.#deactiveEditor();
			await this.backButtonClickHandler();
		});
		this.checkTextElement.addEventListener('click', async event => {
			if(this.blocked) return;
			await this.checkButtonClickHandler();
		});
		this.againTextElement.addEventListener('click', async event => {
			this.#deactiveEditor();
			await this.againButtonClickHandler();
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

	onCheckButtonClick(callback){
		this.checkButtonClickHandler = callback;
	}

	onAgainButtonClick(callback){
		this.againButtonClickHandler = callback;
	}

	setTitle(text){
		this.titleElement.innerText = text;
	}

	setProgress(current, total){
		this.progressElement.textContent = UI_TEXT.progress(current, total);
	}

	getText(){
		return this.textElement.innerText;
	}

	#activeEditor(){
		this.textElement.setAttribute('contenteditable', true);
	}

	// While a wrong token is shown, typing is blocked; only Backspace works and removes the whole token.
	// Outside that state, the caret must be at the end: the check only looks at the end of the text.
	#onBeforeInput(event){
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
		if(this.state !== 'text' || !this.textElement.hasAttribute('contenteditable')) return;

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
		if(result.ok) return;

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

	renderText(text){
		this.state = 'text';
		this.expectedTokens = tokenize(text);
		this.blocked = null;
		this.attempts = { index: -1, count: 0 };
		this.hint = null;
		this.#deactiveEditor();
		this.backTextElement.classList.remove('hidden');
		this.nextTextElement.classList.remove('hidden');
		this.checkTextElement.classList.remove('hidden');
		this.againTextElement.classList.add('hidden');
		this.textElement.innerText = text;
	}

	renderEmpty(message){
		this.state = 'empty';
		this.blocked = null;
		this.#deactiveEditor();
		this.backTextElement.classList.add('hidden');
		this.nextTextElement.classList.add('hidden');
		this.checkTextElement.classList.add('hidden');
		this.againTextElement.classList.add('hidden');
		this.progressElement.textContent = '';
		this.textElement.innerText = message;
	}

	renderCorects(difference){
		this.state = 'corects';
		this.#deactiveEditor();
		this.checkTextElement.classList.add('hidden');
		this.againTextElement.classList.remove('hidden');
		
		const nodes = difference.map(action => {
			switch(action.type){
			case 'keep':
				return document.createTextNode(action.value);
			break;
			case 'add':
				let elem = null;
				if((/^ +$/).test(action.value)){
					elem = document.createElement('u');
				} else {
					elem = document.createElement('del');
				}
				elem.innerText = action.value;
				return elem;
			break;
			case 'remove':
				const insElem = document.createElement('ins');
				insElem.innerText = action.value;
				return insElem;
			break;
			case 'replace':
				const delElem = document.createElement('del');
				const rtElem = document.createElement('rt');
				const rubyElem = document.createElement('ruby');
				rubyElem.appendChild(delElem);
				rubyElem.appendChild(rtElem);

				delElem.innerText = action.added;
				rtElem.innerText = action.removed + ' ';

				return rubyElem;
			break;
			default:
				throw Error(`Unexpected action type "${action.type}"`);
			}
		});

		this.textElement.replaceChildren(...nodes);
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
		this.view.onCheckButtonClick(async () => {
			const textObj = this.#currentText();
			const userInput = this.view.getText();
			const diffList = this.app.model.getDifference(textObj.body, userInput);
			this.view.renderCorects(diffList);
		});
		this.view.onAgainButtonClick(async () => {
			const textObj = this.#currentText();
			this.view.renderText(textObj.body);
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
