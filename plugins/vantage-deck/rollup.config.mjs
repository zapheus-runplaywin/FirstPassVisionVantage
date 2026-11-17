import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
// esbuild strips the types; pnpm typecheck checks them.
import esbuild from "rollup-plugin-esbuild";

const sdPlugin = "com.runplaywin.firstpass-vantage.sdPlugin";

/** @type {import('rollup').RollupOptions} */
export default {
	input: "src/plugin.ts",
	output: { file: `${sdPlugin}/bin/plugin.js` },
	plugins: [
		esbuild({ target: "node20" }),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
		terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
};
