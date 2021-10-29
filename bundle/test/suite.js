const should = require('should');
const jsdom = require('jsdom');
const Path = require('path');
const fs = require('fs').promises;
const mkdirp = require('mkdirp');

const bundledom = require('..');

describe("test suite", function () {
	this.timeout(10000);

	it('should do the most simplest basic js test', async () => {
		process.env.BROWSERSLIST = "ie >= 8";
		try {
			const data = await bundledom('test/fixtures/basic.html', {
				exclude: [],
				concatenate: true
			});
			data.should.have.property('js');
			data.js.should.containEql("Array.from([12, 34]).map(function");
			data.should.have.property('css');
			data.css.should.containEql("-ms-transform: opacity");
			data.should.have.property('html');
		} finally {
			delete process.env.BROWSERSLIST;
		}
	});

	it('should concat js for legacy scripts', async () => {
		const data = await bundledom('test/fixtures/concat.html', {
			exclude: [],
			concatenate: true
		});
		data.should.have.property('js');
		data.js.should.containEql("this.towin = true;");
		data.should.have.property('html');
	});

	it('should work without anything to do', async () => {
		const data = await bundledom('test/fixtures/none.html', {
			exclude: []
		});
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
	});

	it('should support es modules', async () => {
		const data = await bundledom('test/fixtures/esm.html', {
			exclude: [],
			concatenate: true
		});
		data.scripts.should.eql(['mod.js', 'depmod.js']);
		data.should.have.property('js');
		data.js.trim().should.startWith('(function (');
		data.js.includes('emptyObject').should.be.true();
		data.should.have.property('html');
	});

	it('should support es modules with browser prefix resolver', async () => {
		const data = await bundledom('test/fixtures/esm-browser.html', {
			modulesPrefix: '/',
			modulesRoot: "test",
			exclude: [],
			concatenate: true
		});
		data.scripts.should.eql([
			'mod-browser.js',
			'../node_modules/redirect-exports/src/index.js'
		]);
		data.should.have.property('js');
		data.js.trim().should.startWith('(function (');
		data.js.includes('var test = 1;').should.be.true();
		data.should.have.property('html');
	});

	it('should support legacy-resolved modules', async () => {
		process.env.BROWSERSLIST = "last 1 chrome version";
		try {
			const data = await bundledom('test/fixtures/legacy.html', {
				root: "test/fixtures",
				modulesPrefix: '/',
				modulesRoot: "test",
				exclude: [],
				concatenate: true
			});
			data.scripts.sort().should.eql([
				'mod.js',
				'depmod.js',
				'node_modules/redirect-exports'
			].sort());
			data.should.have.property('js');
		} finally {
			delete process.env.BROWSERSLIST;
		}
	});

	it('should support legacy-resolved jquery-like with ignored file', async () => {
		process.env.BROWSERSLIST = "last 1 chrome version";
		try {
			const data = await bundledom('test/fixtures/legacy2.html', {
				root: "test/fixtures",
				modulesPrefix: '/',
				modulesRoot: "test",
				exclude: [],
				concatenate: true
			});
			data.should.have.property('js');
			data.scripts.should.eql([
				'fakejquery.js', 'usejquery.js', 'mod.js', 'depmod.js'
			]);
		} finally {
			delete process.env.BROWSERSLIST;
		}
	});

	it('should order scripts w.r.t. defer, module, or nothing', async () => {
		process.env.BROWSERSLIST = "last 1 chrome version";
		try {
			const data = await bundledom('test/fixtures/legacy3.html', {
				root: "test/fixtures",
				modulesPrefix: '/',
				modulesRoot: "test",
				exclude: [],
				concatenate: true,
				js: '../bundles/legacy3.js'
			});
			data.should.have.property('js');
			data.scripts.should.eql([
				'usejquery.js', 'fakejquery.js', 'mod.js', 'depmod.js'
			]);
			data.html.should.containEql('../bundles/legacy3.js');
			data.html.should.containEql('defer=""');
		} finally {
			delete process.env.BROWSERSLIST;
		}
	});

	it('should ignore a script', async () => {
		const data = await bundledom('test/fixtures/exclude.html', {
			ignore: ['b.js']
		});
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		data.html.indexOf('<script src="b.js"></script>').should.be.greaterThan(0);
	});

	it('should ignore a script using a wildcard', async () => {
		const data = await bundledom('test/fixtures/exclude.html', {
			ignore: ['*.js']
		});
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		data.html.indexOf('<script src="b.js"></script>').should.be.greaterThan(0);
	});

	it('should bundle html import and run it', async () => {
		const filepath = 'test/fixtures/import.html';
		const data = await bundledom(filepath);
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		const doc = await runDom(filepath, data);
		should.exist(doc.querySelector('head > style'));
		should.exist(doc.querySelector('body > .element'));
	});

	it('should bundle html import in html import and run it', async () => {
		const filepath = 'test/fixtures/import-in-import.html';
		const data = await bundledom(filepath);
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		const doc = await runDom(filepath, data);
		should.exist(doc.querySelector('head > style'));
		should.exist(doc.querySelector('body > .element'));
	});

	it('should bundle imported element with inner imported element and run it', async () => {
		const filepath = 'test/fixtures/element-in-element.html';
		const data = await bundledom(filepath);
		data.should.have.property('js');
		data.should.have.property('css');
		data.should.have.property('html');
		const doc = await runDom(filepath, data);
		should.exist(doc.querySelector('head > style'));
		should.exist(doc.querySelector('body > .superelement'));
		should.exist(doc.querySelector('body > .element'));
		doc.querySelector('body > .element').innerHTML.should.match(/test1\n\s+test2/);
	});

	it('should bundle html import with sub import from another dir', async () => {
		await Promise.all([
			copyOver('test/fixtures/sub/sub.html', 'test/bundles/sub/sub.html'),
			copyOver('test/fixtures/sub/sub.js', 'test/bundles/sub/sub.js'),
			copyOver('test/fixtures/sub/sub.css', 'test/bundles/sub.css')
		]);

		const data = await bundledom('test/fixtures/import-sub.html', {
			root: 'test/bundles',
			html: 'import-sub.html',
			js: 'import-sub.js'
		});
		data.should.have.property('js');
		const str = (await fs.readFile('test/bundles/import-sub.js')).toString();
		str.should.match(/.*window\.test=23.*/);
		str.should.match(/.*mysubselector.*/);
	});

	it('should not bundle remotes', async () => {
		const data = await bundledom('test/fixtures/remote.html', {
			root: 'test/bundles',
			html: 'remote.html',
			css: 'remote.css'
		});
		data.should.have.property('css');
		const str = (await fs.readFile('test/bundles/remote.css')).toString();
		str.should.not.containEql("font-family");
	});

	it('should bundle remote stylesheet', async function () {
		this.timeout(10000);
		const data = await bundledom('test/fixtures/remote.html', {
			root: 'test/bundles',
			html: 'remote.html',
			css: 'remote.css',
			remotes: ['fonts.googleapis.com'],
			concatenate: true
		});
		data.should.have.property('css');
		const str = (await fs.readFile('test/bundles/remote.css')).toString();
		str.should.containEql("font-family");
	});

	it('should bundle stylesheet from a module and url to non css files alone', async function () {
		this.timeout(10000);
		const data = await bundledom('test/fixtures/style.html', {
			concatenate: true,
			modulesPrefix: "/",
			modulesRoot: "test"
		});
		data.assets.should.eql(['../node_modules/style/fonts/test.ttf']);
		data.stylesheets.should.eql(['node_modules/style']);
		data.css.should.containEql("url('../node_modules/style/fonts/test.ttf')");
		data.css.should.containEql("-webkit-animation-duration: 12ms");
	});

	it('should bundle stylesheet from a module and copy assets to dir', async function () {
		this.timeout(10000);
		const data = await bundledom('test/fixtures/style.html', {
			modulesPrefix: "/",
			modulesRoot: "test",
			assets: "assets",
			css: "css/subcss/style.css",
			root: "test/bundles"
		});
		data.assets.should.eql(["../node_modules/style/fonts/test.ttf"]);
		data.stylesheets.should.eql(['node_modules/style']);
		data.css.should.containEql("src:url(../../assets/68a581f6.ttf)");
		data.css.should.containEql("-webkit-animation-duration:12ms");
		await fs.stat("test/bundles/assets/68a581f6.ttf");
	});

	it('should import jquery-like bundle with side effects', async () => {
		const data = await bundledom('test/fixtures/fakejquery.html', {
			concatenate: true
		});
		data.js.should.containEql("window.$ = jQuery");
		data.js.should.containEql("window.$()");
	});

	it('should resolve org modules', async () => {
		const data = await bundledom('test/fixtures/orgmodule.html', {
			concatenate: true,
			modulesRoot: "test"
		});
		data.js.should.containEql("window.test = 1");
	});

	it('should bundle remote script', async function () {
		this.timeout(10000);
		await copyOver('test/fixtures/usejquery.js', 'test/bundles/usejquery.js');

		const data = await bundledom('test/fixtures/remote.html', {
			root: 'test/bundles',
			html: 'remote.html',
			js: 'remote.js',
			remotes: ['ajax.googleapis.com']
		});
		data.should.have.property('js');

		const str = (await fs.readFile('test/bundles/remote.js')).toString();
		str.should.containEql("jQuery");
	});

	it('should bundle dynamic imports', async () => {
		await copyOver('test/fixtures/dyna.js', 'test/bundles/dyna.js');
		await copyOver('test/fixtures/dynb.js', 'test/bundles/dynb.js');

		const data = await bundle('test/fixtures/dyn.html', {
			root: 'test/bundles',
			html: 'dyn.html',
			js: 'dyn.js'
		});
		data.should.have.property('js');

		const str = (await fs.readFile('test/bundles/dyn.js')).toString();
		str.should.containEql("window.toto");
	});

});

async function copyOver(from, to) {
	try { await fs.unlink(to); } catch(ex) { /* pass */ }
	const data = await fs.readFile(from);
	await mkdirp(Path.dirname(to));
	await fs.writeFile(to, data);
}

async function runDom(htmlPath, data) {
	const virtualConsole = new jsdom.VirtualConsole();
	virtualConsole.on('jsdomError', (err) => {
		throw err;
	});
	const dom = new jsdom.JSDOM(data.html, {
		virtualConsole: virtualConsole,
		url: 'file://' + Path.resolve(htmlPath),
		runScripts: "dangerously",
		resources: "usable"
	});
	dom.window.eval(data.js);
	return dom.window.document;
}
