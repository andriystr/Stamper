
// ================================== Utils ==================================

function diffText(textA, textB){
	const cleanA = textA.replace(/\s+/gu, ' ');
	const cleanB = textB.replace(/\s+/gu, ' ');

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
			diff.unshift({ type: 'keep', value: cleanA[x - 1] });
			x--;
			y--;
		}

		if (d > 0) {
			if (x === prevX) {
				diff.unshift({ type: 'add', value: cleanB[y - 1] });
				y--;
			} else {
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

// ================================ End Utils ================================
