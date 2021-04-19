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
			const exports = await pkgExports(dir, type);
			mod = modules[moduleName] = { exports, dir };
		}
		if (!mod.exports) return ret;
		const relKey = relUrl ? "./" + relUrl : ".";
		let relPath = mod.exports[relKey] || relKey;
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

async function pkgExports(dir, type) {
	const exports = {};
	let pkg;
	try {
		pkg = JSON.parse(await readFile(upath.join(dir, 'package.json')));
	} catch (err) {
		return null;
	}
	if (type == "css" && pkg.style) {
		exports["."] = pkg.style;
	} else if (pkg.exports) {
		for (let key in pkg.exports) {
			const exp = pkg.exports[key];
			if (key == "import") {
				exports['.'] = exp;
			} else if (key.startsWith(".")) {
				if (typeof exp == "object" && exp.import) {
					exports[key] = exp.import;
				} else {
					exports[key] = exp;
				}
			}
		}
	} else {
		exports["."] = pkg.module || pkg['jsnext:main'] || pkg.main || null;
	}
	return exports;
}
