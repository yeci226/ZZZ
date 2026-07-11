import tseslint from "typescript-eslint";

export default [
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
	},
];
