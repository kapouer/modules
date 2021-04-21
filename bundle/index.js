const debug = require('debug')('@webmodule/bundle');

const postcss = require('postcss');
const postcssUrl = require('postcss-url');
const postcssImport = require('postcss-import');
const postcssFlexBugs = require('postcss-flexbugs-fixes');
const presetEnv = require.resolve('@babel/preset-env');
const autoprefixer = require('autoprefixer');
const csso = require('postcss-csso');
const rollup = require('rollup');
const rollupBabel = require('@rollup/plugin-babel');
const rollupTerser = require('rollup-plugin-terser');
const rollupVirtual = require('@rollup/plugin-virtual');
const rollupResolve = require('@rollup/plugin-node-resolve');
const rollupCommonjs = require('@rollup/plugin-commonjs');
const Resolver = require('@webmodule/resolve');
const reporter = require('postcss-reporter');
const JSDOM = require('jsdom').JSDOM;
const mkdirp = require('mkdirp');
const MaxWorkers = Math.min(require('os').cpus().length - 1, 4);

const fs = require('fs');
const Path = require('upath');
const got = require('got');

const minimatch = require("minimatch");

const coreJsRe = /\/core-js\//;

module.exports = bundledom;

/* global document */

function bundledom(path, opts, cb) {
	opts = Object.assign({
		remotes: [],
		prepend: [],
		append: [],
		exclude: [],
		ignore: []
	}, opts);

	let minify = true;
	if (opts.concatenate !== undefined) minify = !opts.concatenate;
	if (opts.minify !== undefined) minify = opts.minify;
	opts.minify = minify;
	if (!opts.root) opts.root = Path.dirname(path);

	const babelPresetOpts = {
		modules: false,
		// spec: true,
		useBuiltIns: 'usage',
		corejs: 3
	};

	const babelOpts = {
		presets: [
			[presetEnv, babelPresetOpts]
		],
		plugins: [
			"@babel/plugin-proposal-class-properties",
			"@babel/plugin-proposal-optional-chaining"
		],
		compact: false,
		babelHelpers: 'bundled',
		comments: minify === false,
		filter(id) {
			if (id.startsWith('\0') && !id.startsWith('\0virtual:')) return false;
			if (coreJsRe.test(Path.toUnix(id))) return false;
			return true;
		}
	};

	opts.babel = babelOpts;

	let p = loadDom(path, opts.root).then(function (dom) {
		opts.basepath = dom.basepath;
		const data = {};
		const doc = dom.window.document;
		return processDocument(doc, opts, data).then(function () {
			if (!opts.css) {
				if (data.css) data.js += '\n(' + function () {
					const sheet = document.createElement('style');
					sheet.type = 'text/css';
					// eslint-disable-next-line no-undef
					sheet.textContent = CSS;
					document.head.appendChild(sheet);
				}.toString().replace('CSS', function () {
					return JSON.stringify(data.css);
				}) + ')();';
			} else {
				const cssPath = getRelativePath(opts.basepath, opts.css);
				return writeFile(cssPath, data.css).then(function () {
					// eslint-disable-next-line no-console
					if (opts.cli) console.warn(opts.css);
					if (data.cssmap) {
						const cssMapPath = cssPath + '.map';
						return writeFile(cssMapPath, data.cssmap).then(function () {
							// eslint-disable-next-line no-console
							if (opts.cli) console.warn(opts.css + ".map");
						});
					}
				});
			}
		}).then(function () {
			const html = dom.serialize();
			let p = Promise.resolve();
			if (opts.html) {
				p = p.then(function () {
					const htmlPath = getRelativePath(opts.basepath, opts.html);
					return writeFile(htmlPath, html).then(function () {
						// eslint-disable-next-line no-console
						if (opts.cli) console.warn(opts.html);
					});
				});
			} else {
				data.html = html;
			}
			if (opts.js) {
				p = p.then(function () {
					const jsPath = getRelativePath(opts.basepath, opts.js);
					return writeFile(jsPath, data.js).then(function () {
						// eslint-disable-next-line no-console
						if (opts.cli) console.warn(opts.js);
						if (data.jsmap) {
							const jsMapPath = jsPath + '.map';
							return writeFile(jsMapPath, data.jsmap).then(function () {
								// eslint-disable-next-line no-console
								if (opts.cli) console.warn(opts.js + ".map");
							});
						}
					});
				});
			}
			return p.then(function () {
				if (cb) cb(null, data);
				return data;
			});
		});
	});
	if (cb) p = p.catch(cb);
	else return p;
}

function processDocument(doc, opts, data) {
	Object.assign(data, {
		imports: [],
		scripts: [],
		stylesheets: [],
		assets: [],
		jsmap: "",
		cssmap: ""
	});
	if (!data.js) data.js = "";
	if (!data.css) data.css = "";
	return Promise.resolve().then(function () {
		return processCustom(doc, opts, data);
	}).then(function () {
		return prepareImports(doc, opts, data);
	}).then(function () {
		return processScripts(doc, opts, data).then(function (obj) {
			if (obj.str) data.js += obj.str;
			if (obj.map) data.jsmap += obj.map;
		});
	}).then(function () {
		return processStylesheets(doc, opts, data).then(function (obj) {
			if (obj.css) data.css += obj.css;
			if (obj.map) data.cssmap += obj.map;
		});
	}).then(function () {
		return data;
	});
}

function processCustom(doc, opts, data) {
	if (opts.custom) return opts.custom(doc, opts, data);
}

function prepareImports(doc, opts, data) {
	const docRoot = Path.dirname(opts.basepath);

	const allLinks = Array.from(doc.querySelectorAll('link[href][rel="import"]'));

	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'html', { rel: "import" });
	appendToPivot(allLinks, opts.append, 'link', 'href', 'html', { rel: "import" });

	// the order is not important
	return Promise.all(allLinks.map(function (node) {
		let src = node.getAttribute('href');
		if (filterByName(src, opts.ignore)) {
			return;
		}
		if (filterByName(src, opts.exclude)) {
			node.remove();
			return;
		}
		data.imports.push(src);

		if (src.startsWith('/')) {
			src = Path.join(opts.root, src);
		} else {
			src = Path.join(docRoot, src);
		}

		return loadDom(src, Path.dirname(src)).then(function (idom) {
			const iopts = Object.assign({}, opts, {
				append: [],
				prepend: [],
				exclude: [],
				ignore: [],
				css: null,
				js: null,
				basepath: idom.basepath
			});
			const idoc = idom.window.document;
			return processDocument(idoc, iopts, {}).then(function (data) {
				// make sure no variable can leak to SCRIPT
				let iscript = function (html) {
					if (!document._currentScript) document._currentScript = {};
					document._currentScript.parentOwner = (document.currentScript || document._currentScript).ownerDocument;
					document._currentScript.ownerDocument = document.implementation.createHTMLDocument("");
					try {
						document._currentScript.ownerDocument.documentElement.innerHTML = html;
					} catch (ex) {
						// IE < 10 fallback
						document._currentScript.ownerDocument.body.innerHTML = html;
					}
					// eslint-disable-next-line no-undef
					SCRIPT;
					document._currentScript.ownerDocument = document._currentScript.parentOwner;
					delete document._currentScript.parentOwner;
				}.toString().replace("SCRIPT;", function () {
					return data.js;
				});
				iscript = '\n(' + iscript + ')(' +
					JSON.stringify(idoc.documentElement.innerHTML)
					+ ');';
				createSibling(node, 'before', 'script').textContent = iscript;
				if (data.css) {
					createSibling(node, 'before', 'style').textContent = data.css;
				}
				removeNodeAndSpaceBefore(node);
			});
		});
	}));
}

function processScripts(doc, opts, data) {
	const docRoot = getRelativePath(opts.basepath);
	if (opts.js) {
		opts.append.unshift(opts.js);
		opts.ignore.unshift(opts.js);
	}
	const allScripts = Array.from(doc.querySelectorAll('script')).filter(function (node) {
		const src = node.getAttribute('src');
		if (src && filterRemotes(src, opts.remotes) == 0) return false;
		return !node.type || node.type == "text/javascript" || node.type == "module";
	});
	prependToPivot(allScripts, opts.prepend, 'script', 'src', 'js');
	appendToPivot(allScripts, opts.append, 'script', 'src', 'js');

	const entries = [];

	const modulesResolver = resolverPlugin(opts, "resolveId", "js");


	allScripts.forEach(function (node, i) {
		const src = node.getAttribute('src');
		let dst = src;
		const esm = node.getAttribute('type') == "module";

		if (src) {
			if (src.startsWith('//')) {
				dst = "https:" + src;
			}
			if (filterByName(dst, opts.ignore)) {
				return;
			}
			if (filterByName(dst, opts.exclude)) {
				removeNodeAndSpaceBefore(node);
				return;
			}
			if (/^https?:\/\//.test(dst) == false) {
				dst = src.startsWith('/')
					? Path.join(opts.root, src)
					: Path.join(docRoot, src);
				if (modulesResolver) {
					entries.push((async () => {
						const level = Path.relative(docRoot, opts.root);
						dst = await modulesResolver.resolveId(
							Path.join(level, src), docRoot
						) || dst;
						if (esm) {
							return { src, dst };
						} else {
							return {
								src,
								dst,
								blob: wrapWindow(await readFile(dst))
							};
						}
					})());
				} else if (esm) {
					entries.push({ src, dst });
				} else {
					entries.push((async () => {
						return {
							src,
							dst,
							blob: wrapWindow(await readFile(dst))
						};
					})());
				}
			}
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return;
			}
			if (~opts.exclude.indexOf('.')) {
				removeNodeAndSpaceBefore(node);
				return;
			}
			if (esm) {
				entries.push({
					blob: node.textContent
				});
			} else {
				entries.push({
					blob: wrapWindow(node.textContent)
				});
			}
		} else {
			return;
		}
		removeNodeAndSpaceBefore(node);
	});
	return Promise.all(entries).then(function (entries) {
		if (entries.length == 0) return {};
		const virtuals = {};
		const bundle = entries.map(function (entry, i) {
			let { src, dst, blob } = entry;
			if (src) data.scripts.push(src);
			if (blob) {
				dst = `__script${i}__.js`;
				virtuals[dst] = blob;
			}
			if (!dst) {
				throw new Error(`Entry ${i} without dst : ${src}`);
			} else {
				return `import "${Path.toUnix(dst)}";`;
			}
		}).join('\n');
		const bundleName = '__entry__.js';
		virtuals[bundleName] = bundle;

		return rollup.rollup({
			input: bundleName,
			context: 'window',
			plugins: [
				rollupVirtual(virtuals),
				modulesResolver,
				rollupResolve.nodeResolve({ browser: true }),
				rollupCommonjs(),
				rollupBabel.babel(opts.babel),
				opts.minify ? rollupTerser.terser({
					numWorkers: MaxWorkers
				}) : null
			]
		}).then(function (bundle) {
			for (let i = 1; i < bundle.watchFiles.length; i++) {
				let item = bundle.watchFiles[i];
				if (item.startsWith('\0')) continue;
				item = Path.toUnix(item);
				if (coreJsRe.test(item) || item.endsWith("/node_modules/regenerator-runtime/runtime.js")) continue;
				let rel = Path.relative(docRoot, item);
				if (!data.scripts.includes(rel)) data.scripts.push(rel);
			}
			return bundle.generate({
				format: 'iife'
			});
		}).then(function (result) {
			const codeList = [];
			const mapList = [];
			result.output.forEach(function (chunk) {
				if (chunk.code) codeList.push(chunk.code);
				if (chunk.map) mapList.push(chunk.map);
			});
			return {
				str: codeList.join('\n'),
				map: mapList.join('\n')
			};
		});
	});
}

function processStylesheets(doc, opts, data) {
	let path = opts.basepath;
	const pathExt = Path.extname(path);
	const docRoot = Path.dirname(path);
	path = Path.join(docRoot, Path.basename(path, pathExt));
	if (opts.css) {
		opts.append.unshift(opts.css);
		opts.ignore.unshift(opts.css);
	}

	const allLinks = Array.from(doc.querySelectorAll('link[href][rel="stylesheet"],style')).filter(function (node) {
		const src = node.getAttribute('href');
		if (src && filterRemotes(src, opts.remotes) == 0) return false;
		return true;
	});

	prependToPivot(allLinks, opts.prepend, 'link', 'href', 'css', { rel: "stylesheet" });
	appendToPivot(allLinks, opts.append, 'link', 'href', 'css', { rel: "stylesheet" });

	return Promise.all(allLinks.map(function (node) {
		const src = node.getAttribute('href');
		let dst = src;
		if (src) {
			if (src.startsWith('//')) dst = "https:" + src;
			if (filterByName(src, opts.ignore)) {
				return "";
			}
			removeNodeAndSpaceBefore(node);
			if (filterByName(src, opts.exclude)) {
				return "";
			}
			if (/^https?:\/\//.test(dst) == false) {
				data.stylesheets.push(src);
				if (src.startsWith('/')) {
					dst = Path.relative(docRoot, Path.join(opts.root, src));
				} else if (!src.startsWith('.')) {
					dst = "./" + src;
				}
				return `@import url("${dst}");`;
			} else if (filterRemotes(dst, opts.remotes) == 1) {
				data.stylesheets.push(src);
				return got(dst).then(function (response) {
					return response.body.toString();
				});
			}
		} else if (node.textContent) {
			if (~opts.ignore.indexOf('.')) {
				return "";
			}
			removeNodeAndSpaceBefore(node);
			if (~opts.exclude.indexOf('.')) {
				return "";
			}
			return node.textContent;
		}
	})).then(function (all) {
		const blob = all.filter(function (str) {
			return !!str;
		}).join("\n");
		if (!blob) return {};
		const autoprefixerOpts = {};
		const urlOpts = [{
			url(asset) {
				if (asset.pathname) {
					const relPath = Path.toUnix(asset.relativePath);
					if (!data.assets.includes(relPath)) data.assets.push(relPath);
					return relPath;
				}
			},
			multi: true
		}];

		if (opts.assets) {
			const fixRelative = Path.relative(Path.dirname(opts.css || "."), ".");
			urlOpts.push({
				url: "copy",
				useHash: true,
				assetsPath: opts.assets
			}, {
				url(asset) {
					if (asset.url) return Path.join(fixRelative, asset.url);
				},
				multi: true
			});
		}

		const plugins = [
			postcssImport(Object.assign({
				plugins: [postcssUrl({
					url: (asset) => {
						if (asset.pathname) {
							return Path.toUnix(asset.relativePath);
						}
					}
				})],
			}, resolverPlugin(opts, "resolve", "css"))),
			postcssUrl(urlOpts),
			postcssFlexBugs,
			autoprefixer(autoprefixerOpts)
		];
		if (opts.minify) {
			plugins.push(csso({
				comments: false
			}));
		}
		plugins.push(reporter);

		return postcss(plugins).process(blob, {
			from: path,
			to: path + '.css',
			map: {
				inline: false
			}
		});
	});
}


function getRelativePath(basepath, path) {
	const dir = Path.dirname(basepath);
	if (path) return Path.join(dir, path);
	else return dir;
}

function wrapWindow(str) {
	return `(function() {
		${str}
	}).call(window);`;
}

function filterRemotes(src, remotes) {
	// return -1 for not remote
	// return 0 for undownloadable remote
	// return 1 for downloadable remote
	const host = new URL(src, "a://").host;
	if (!host) return -1;
	if (!remotes) return 0;
	if (remotes.some(function (rem) {
		if (host.indexOf(rem) >= 0) return true;
	})) return 1;
	else return 0;
}

function filterByName(src, list) {
	if (!list) return;
	const found = list.some(function (str) {
		if (str == ".") return false;
		if (str.indexOf('*') >= 0) return minimatch(src, str);
		else return ~src.indexOf(str);
	});
	if (found) debug("excluded", src);
	return found;
}

function filterByExt(list, ext) {
	if (!list) return [];
	ext = '.' + ext;
	return list.filter(function (src) {
		return Path.extname(new URL(src, "a://").pathname) == ext;
	});
}

function removeNodeAndSpaceBefore(node) {
	let cur = node.previousSibling;
	while (cur && cur.nodeType == 3 && /^\s*$/.test(cur.nodeValue)) {
		cur.remove();
		cur = node.previousSibling;
	}
	node.remove();
}

function spaceBefore(node) {
	let str = "";
	let cur = node.previousSibling, val;
	while (cur && cur.nodeType == 3) {
		val = cur.nodeValue;
		let nl = /([\n\r]*[\s]*)/.exec(val);
		if (nl && nl.length == 2) {
			val = nl[1];
			nl = true;
		} else {
			nl = false;
		}
		str = val + str;
		if (nl) break;
		cur = cur.previousSibling;
	}
	return node.ownerDocument.createTextNode(str);
}

function createSibling(refnode, direction, tag, attrs) {
	const node = refnode.ownerDocument.createElement(tag);
	if (attrs) for (let name in attrs) node.setAttribute(name, attrs[name]);
	refnode[direction](node);
	refnode[direction](spaceBefore(refnode));
	return node;
}

function prependToPivot(scripts, list, tag, att, ext, attrs) {
	list = filterByExt(list, ext);
	if (!list.length) return;
	const pivot = scripts[0];
	if (!pivot) {
		// eslint-disable-next-line no-console
		console.error("Missing node to prepend to", list);
		return;
	}
	attrs = Object.assign({}, attrs);
	list.forEach(function (src) {
		attrs[att] = src;
		scripts.unshift(createSibling(pivot, 'before', tag, attrs));
		debug("prepended", tag, att, src);
	});
}

function appendToPivot(scripts, list, tag, att, ext, attrs) {
	list = filterByExt(list, ext);
	if (!list.length) return;
	const pivot = scripts.slice(-1)[0];
	if (!pivot) {
		// eslint-disable-next-line no-console
		console.error("Missing node to append to", list);
		return;
	}
	attrs = Object.assign({}, attrs);
	while (list.length) {
		const src = list.pop();
		attrs[att] = src;
		scripts.push(createSibling(pivot, 'after', tag, attrs));
		debug("appended", tag, att, src);
	}
}

function loadDom(path, basepath) {
	if (!basepath) basepath = path;
	else basepath = Path.join(basepath, Path.basename(path));
	return readFile(path).then(function (html) {
		const abspath = Path.resolve(basepath);
		const dom = new JSDOM(html, {
			url: `file://${abspath}`
		});
		dom.basepath = abspath;
		return dom;
	});
}

function readFile(path) {
	return new Promise(function (resolve, reject) {
		fs.readFile(path, function (err, buf) {
			if (err) reject(err);
			else resolve(buf.toString());
		});
	});
}

function writeFile(path, buf) {
	return new Promise(function (resolve, reject) {
		mkdirp(Path.dirname(path)).then(function () {
			fs.writeFile(path, buf, function (err) {
				if (err) reject(err);
				else resolve();
			});
		}).catch(reject);
	});
}
function resolverPlugin({ modulesPrefix = "/", modulesRoot = ".", root = "." }, key, type) {
	if (!modulesPrefix.startsWith('/')) modulesPrefix = '/' + modulesPrefix;
	const resolver = new Resolver({
		root: modulesRoot,
		prefix: modulesPrefix
	});
	const absRoot = Path.resolve(root);
	const regModules = /^[./]*node_modules\//;
	return {
		name: "native import modules resolver",
		async [key](source, importer) {
			const usource = Path.toUnix(source);
			let ignore = source.includes('\0') || importer.includes('\0');
			let importerDir;
			if (!ignore) {
				importerDir = Path.relative(
					absRoot,
					Path.extname(importer) ? Path.dirname(importer) : importer
				);
				ignore = importerDir.includes("/node_modules/") || regModules.test(usource) == false;
			}
			if (ignore) {
				// let other resolvers work
				if (type == "js") {
					return null;
				} else if (type == "css") {
					return usource;
				}
			}
			const browserPath = usource.startsWith(modulesPrefix)
				? usource
				: Path.join('/', importerDir, usource);
			const res = await resolver.resolve(browserPath, type);
			if (!res.path) throw new Error(`Cannot resolve ${source} from ${modulesPrefix}`);
			return Path.resolve(res.path);
		}
	};
}

