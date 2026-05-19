
function normalizeChar(char) {
	if (!char) return '';
	
	// Зводимо всі апострофи до одного стандарту
	if (/['"`’‘ʼ״׳′]/u.test(char)) {
		return "'"; 
	}

	return char;
}

function diffText(textA, textB){
	// РЕГУЛЯРНИЙ ВИРАЗ ДЛЯ ПРОБІЛІВ:
	// \s+ знаходить будь-яку кількість пробілів, табуляцій чи переносів, що йдуть підряд,
	// та замінює їх на один звичайний пробіл " ".
	const cleanA = textA.replace(/\s+/gu, ' ');
	const cleanB = textB.replace(/\s+/gu, ' ');

	// Створюємо масиви для порівняння вже на основі очищених від зайвих пробілів рядків
	const a = Array.from(cleanA).map(normalizeChar);
	const b = Array.from(cleanB).map(normalizeChar);

	const n = a.length;
	const m = b.length;
	const maxD = n + m;
	
	const v = new Array(2 * maxD + 1);
	v[maxD + 1] = 0;
	const history = [];

	let x, y;
	let found = false;

	// Крок 1: Пошук найкоротшого шляху редагування
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

	// Крок 2: Відновлення шляху
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
			// Беремо символ з попередньо обробленого cleanA
			diff.unshift({ type: 'keep', value: cleanA[x - 1] });
			x--;
			y--;
		}

		if (d > 0) {
			if (x === prevX) {
				// Беремо символ з попередньо обробленого cleanB
				diff.unshift({ type: 'add', value: cleanB[y - 1] });
				y--;
			} else {
				// Беремо символ з попередньо обробленого cleanA
				diff.unshift({ type: 'remove', value: cleanA[x - 1] });
				x--;
			}
		}
	}

	return diff;
}

function groupDiff(diffList) {
	if (!diffList || diffList.length === 0) return [];

	const grouped = [];
	
	// Ініціалізуємо перший фрагмент
	let currentGroup = {
		type: diffList[0].type,
		value: diffList[0].value
	};

	for (let i = 1; i < diffList.length; i++) {
		const item = diffList[i];

		// Якщо тип операції збігається, додаємо символ до поточного фрагмента
		if (item.type === currentGroup.type) {
			currentGroup.value += item.value;
		} else {
			// Якщо тип змінився, зберігаємо старий фрагмент і створюємо новий
			grouped.push(currentGroup);
			currentGroup = {
				type: item.type,
				value: item.value
			};
		}
	}

	// Не забуваємо додати останній фрагмент після виходу з циклу
	grouped.push(currentGroup);

	return grouped;
}
