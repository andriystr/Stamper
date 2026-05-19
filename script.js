
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
		return regex.test(this.peek());
	}

	eof(){
		return this.#index >= this.#string.length;
	}
}


function scanner(text){
	const cursor = new StringCursor(text);
	const stack = [];
	const tokens = [];

	while(!cursor.eof()){
		if(cursor.test(/\p{Z}/u)){
			while(cursor.test(/\p{Z}/u))
				stack.push(cursor.read());
			
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
			});

		if(cursor.test(/\p{S}/u))
			tokens.push({
				type: 'symbol',
				value: cursor.read()
			});

		if(cursor.test(/\p{M}/u))
			tokens.push({
				type: 'marks',
				value: cursor.read()
			});

		if(cursor.test(/\p{C}/u))
			tokens.push({
				type: 'other',
				value: cursor.read()
			});

		if(cursor.test(/\p{L}/u)){
			while(cursor.test(/[\p{L}\p{N}'’`´ʹ-]/u))
				stack.push(cursor.read());

			const word = stack.join('');

			tokens.push({
				type: 'word',
				value: word
			});

			stack.length = 0
		}

		if(cursor.test(/\p{N}/u)){
			while(cursor.test(/[\p{N},.]/u))
				stack.push(cursor.read());

			tokens.push({
				type: 'number',
				value: stack.join('')
			});

			stack.length = 0;
		}
	}

	return tokens;
}


class TokenCursor {
	#tokens;
	#index;

	constructor(tokens){
		this.#tokens = tokens;
		this.#index = 0;
	}

	peek(len=0){
		if(this.#index >= this.#tokens.length)
			return null;
		return this.#tokens[this.#index + len];
	}

	read(){
		if(this.#index >= this.#tokens.length)
			return null;
		return this.#tokens[this.#index++];
	}

	test(...token_types){
		return token_types.includes(this.peek()?.type);
	}

	skip_to(...token_types){
		while(!this.eof() && !this.test(...token_types))
			this.read();
		return this.read();
	}

	eof(){
		return this.#index >= this.#tokens.length;
	}
}


function tokenizer(text){
	const scanned_tokens = scanner(text);
	return scanned_tokens.map(tok => {
		return {
			type: tok.type,
			value: tok.value,
			normal: tok.value.replaceAll(/['’`´ʹ]/g, '`')
		}
	})
}


function compare_tokens(origin_tok, input_tok){
	return origin_tok?.normal === input_tok?.normal;
}


function diff_text(origin, input){
	const cursor_origin = new TokenCursor(tokenizer(origin));
	const cursor_input = new TokenCursor(tokenizer(input));
	const diff_toks = [];

	while(!cursor_input.eof()){
		const input_tok = cursor_input.read()
		if(!cursor_origin.eof() && input_tok.type == 'word'){
			const origin_tok = cursor_origin.skip_to('word');
			if(origin_tok === null){
				diff_toks.push({
					status: 'delete',
					value: input_tok.value
				})
			} else if(compare_tokens(origin_tok, input_tok)){
				diff_toks.push({
					status: 'right',
					value: input_tok.value
				})
			}
			else {
				diff_toks.push({
					status: 'replace',
					origin: origin_tok.value,
					input: input_tok.value
				})
			}

			continue;
		}

		diff_toks.push({
			status: cursor_origin.eof() ? 'delete': 'skip',
			value: input_tok.value
		})
	}

	while(!cursor_origin.eof()){
		const origin_tok = cursor_origin.read();
		diff_toks.push({
			status: 'add',
			value: origin_tok.value
		})
	}

	return diff_toks;
}
