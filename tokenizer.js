
class StringCursor {
	#string;
	#index;

	constructor(string){
		this.#string = string;
		this.#index = 0;
	}

	peek(){
		if(this.#index >= this.#string.length)
			return '';
		return this.#string[this.#index];
	}

	read(){
		if(this.#index >= this.#string.length)
			return '';
		return this.#string[this.#index++];
	}

	test(regex){
		return regex.test(this.peek())
	}

	eof(){
		return this.#index >= this.#string.length;
	}
}


function tokenizer(text){
	const cursor = new StringCursor(text);
	// text = text.replace(/['’`´ʹ]/gu, '`');
	const stack = [];
	const tokens = [];

	while(!cursor.eof()){
		if(cursor.test(/\p{Z}/u)){
			while(cursor.test(/\p{Z}/u))
				stack.push(cursor.read())
			
			tokens.push({
				type: 'separator',
				value: stack.join('')
			})

			stack.length = 0;
		}

		if(cursor.test(/\p{P}/u))
			tokens.push({
				type: 'punctuation',
				value: cursor.read()
			})

		if(cursor.test(/\p{S}/u))
			tokens.push({
				type: 'symbol',
				value: cursor.read()
			})

		if(cursor.test(/\p{M}/u))
			tokens.push({
				type: 'marks',
				value: cursor.read()
			})

		if(cursor.test(/\p{C}/u))
			tokens.push({
				type: 'other',
				value: cursor.read()
			})

		if(cursor.test(/\p{L}/u)){
			while(cursor.test(/[\p{L}\p{N}'’`´ʹ-]/u))
				stack.push(cursor.read())

			tokens.push({
				type: 'word',
				value: stack.join('')
			})

			stack.length = 0
		}

		if(cursor.test(/\p{N}/u)){
			while(cursor.test(/[\p{N},.]/u))
				stack.push(cursor.read())

			tokens.push({
				type: 'number',
				value: stack.join('')
			})

			stack.length = 0
		}
	}

	return tokens;
}
