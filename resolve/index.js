const { readFile } = require('fs').promises;
const upath = require('upath');

module.exports = class Resolver {
	constructor({ prefix = "/", root = "." }) {
		this.modules = {};
		this.root = upath.resolve(root, "node_modules");
		this.prefix = prefix + "node_modules/";
	}
	async resolve(url, type) {
		const { modules, prefix, root } = this;
		const ret = {};
		if (!url.startsWith(prefix)) return ret;
		url = url.substring(prefix.length);
		let [moduleName, relUrl] = urlParts(url);
		if (!moduleName) return ret;
		let mod = modules[moduleName];

		if (!mod) {
			let dir = upath.join(root, moduleName);
			if (!dir) return ret;
			mod = modules[moduleName] = {
				paths: await pkgExports(dir),
				dir
			};
		}
		const paths = mod.paths[type];
		if (!paths) return ret;
		const relKey = relUrl ? "./" + relUrl : ".";
		let relPath = paths[relKey] || relKey;
		if (relPath == ".") relPath = "./index"; // last chance
		if (!upath.extname(relPath)) {
			relPath += `.${type}`;
		}

		const newUrl = upath.join(moduleName, relPath);
		ret.path = upath.join(mod.dir, relPath);
		if (url != newUrl) ret.url = this.prefix + newUrl;
		return ret;
	}
};

function urlParts(url) {
	const list = url.split('/');
	if (!list.length) return [null, null];
	let name = list.shift();
	if (name.charAt(0) == "@") name += "/" + list.shift();
	return [name, list.join('/')];
}

async function getPkg(path) {
	try {
		return JSON.parse(await readFile(path));
	} catch (err) {
		console.error(err);
		return null;
	}
}

async function pkgExports(dir) {
	const pkg = await getPkg(upath.join(dir, 'package.json'));
	if (!pkg) return {};
	const paths = { css: {}, js: {} };
	if (pkg.style) paths.css["."] = pkg.style;
	if (pkg.exports) {
		for (let key in pkg.exports) {
			const exp = pkg.exports[key];
			if (key == "import") {
				paths.js['.'] = exp;
			} else if (key.startsWith(".")) {
				if (typeof exp == "object" && exp.import) {
					paths.js[key] = exp.import;
				} else {
					paths.js[key] = exp;
				}
			}
		}
	} else {
		paths.js["."] = pkg.module || pkg['jsnext:main'] || pkg.main || null;
		if (!pkg.style) paths.css["."] = pkg.module || pkg.main || null;
	}
	return paths;
}
