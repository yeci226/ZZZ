import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/?(*.)+(spec|test).ts"],
	transform: {
		"^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }]
	},
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1"
	},
	clearMocks: true
};

export default config;
