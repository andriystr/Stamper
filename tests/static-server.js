// Serves the project root for the browser tests (Playwright webServer). Plain Node, no dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
};

http.createServer((req, res) => {
	const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	const relative = urlPath.endsWith('/') ? urlPath + 'index.html' : urlPath;
	const file = path.resolve(ROOT, '.' + relative);

	if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('Not found');
		return;
	}

	res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
	fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
	console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
