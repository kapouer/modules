const Path = require('path');
const { readFileSync } = require('fs');
const unwin = Path.sep == "\\" ? s => s.replace(/\\/g, "/") : s => s;

module.exports = class Resolver {
	constructor({ node_path, prefix }) {
		this.node_path = node_path;
		this.mount = prefix;
		this.modules = {};
	}
	resolve(url, type) {
		const { node_path, mount, modules } = this;
		url = url.substring(mount.length);
		const [moduleName, rest] = pathInfo(url);
		let mod = modules[moduleName];

		if (!mod) {
			const modulePath = Path.join(node_path, moduleName);
			let pkg;
			try {
				pkg = JSON.parse(readFileSync(Path.join(modulePath, 'package.json')));
			} catch (ex) {
				return { url };
			}
			const paths = exportedPaths(pkg, type);
			const exp = paths["."];
			if (typeof exp != "string") return { url };

			const objExp = Path.parse(exp);
			mod = modules[moduleName] = {
				dir: objExp.dir,
				base: objExp.base,
				name: moduleName
			};
		}

		const objRest = Path.parse('./' + rest);
		let redir = true;
		let restBase = objRest.base;
		if (restBase == "" || restBase == ".") {
			restBase = mod.base;
		} else if (!objRest.ext) {
			restBase += ".js";
		} else {
			redir = false;
		}
		let restDir = objRest.dir;
		if (!restDir.startsWith(mod.dir) && objRest.ext != ".css") {
			restDir = mod.dir + '/' + objRest.dir;
			redir = true;
		}
		let path;
		if (redir) {
			path = Path.join(moduleName, restDir, restBase);
			url = unwin(Path.join(mount, path));
			path = Path.join(node_path, path);
		} else {
			url = '/' + unwin(Path.join(mod.name, rest));
			path = Path.join(node_path, url);
		}
		return { redir, url, path };
	}
};

function pathInfo(reqPath) {
	const list = reqPath.substr(1).split('/');
	if (!list.length) return [null, null];
	let name = list.shift();
	if (name.charAt(0) == "@") name += "/" + list.shift();
	return [name, list.join('/')];
}

function exportedPaths(pkg, type) {
	const paths = {};
	if (type == "css" && pkg.style) {
		paths["."] = pkg.style;
	} else if (pkg.exports) {
		for (let key in pkg.exports) {
			const exp = pkg.exports[key];
			if (key == "import") {
				paths['.'] = exp;
			} else if (key.startsWith(".")) {
				if (typeof exp == "object" && exp.import) {
					paths[key] = exp.import;
				} else {
					paths[key] = exp;
				}
			}
		}
	} else {
		let fallback = pkg.module || pkg['jsnext:main'] || pkg.main;
		if (fallback) {
			if (!fallback.startsWith('.')) fallback = './' + fallback;
			paths["."] = fallback;
		}
	}
	return paths;
}
