/** @type {import('jest').Config} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/?(*.)+(spec|test).ts"],
	transform: {
		"^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
		// `queue` ships untranspiled ESM; compile only that package so the real draw queue can be tested.
		"node_modules[\\\\/]queue[\\\\/].+\\.js$": ["ts-jest", { tsconfig: { allowJs: true, module: "commonjs", target: "ES2022" } }]
	},
	transformIgnorePatterns: ["node_modules[\\\\/](?!queue[\\\\/])"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1"
	},
	clearMocks: true
};
