const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
	testDir: 'tests',
	testMatch: /.*\.spec\.js/,
	use: {
		baseURL: `http://localhost:${PORT}`,
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
	],
	webServer: {
		command: 'node tests/static-server.js',
		url: `http://localhost:${PORT}/`,
		reuseExistingServer: !process.env.CI,
		env: { PORT: String(PORT) },
	},
});
