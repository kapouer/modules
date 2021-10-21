const assert = require('assert');
const express = require('express');
const got = require('got').extend({ retry: 0 });

const serveModule = require('..');

describe("test suite", function () {
	this.timeout(10000);
	let server, host;

	before(function (done) {
		const app = express();

		app.use(serveModule({ prefix: '/', root: "test" }));

		server = app.listen(() => {
			host = `http://localhost:${server.address().port}`;
			done();
		});
	});
	after(function (done) {
		server.close(done);
	});

	it('should redirect module with main field', async function () {
		const res = await got(host + '/node_modules/redirect-main', {
			followRedirect: false,
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res.headers.location,
			"/node_modules/redirect-main/here/index.js"
		);
	});

	it('should redirect module with custom field', async () => {
		const res = await got(host + '/node_modules/redirect-custom', {
			followRedirect: true,
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res.body,
			'import * as Test from "redirect-fixed";\nconsole.log(Test.value);\n'
		);

		const res2 = await got(host + '/node_modules/redirect-fixed', {
			followRedirect: true,
			headers: {
				referer: "/node_modules/redirect-custom/src/index.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res2.body,
			'const module = {exports: {}};const exports = module.exports;exports.value = 1;\n;export default module.exports'
		);
	});

	it('should redirect module with exports field', async () => {
		const res = await got(host + '/node_modules/redirect-exports', {
			followRedirect: false,
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res.headers.location,
			"/node_modules/redirect-exports/src/index.js"
		);
	});

	it('should reexport global module', async function () {
		const res = await got(host + '/node_modules/reexport/index.js', {
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.ok(res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should not reexport global module', async function () {
		const res = await got(host + '/node_modules/noreexport/index.js', {
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should leave file untouched because referer is not js', async function () {
		const res = await got(host + '/node_modules/reexport/index.js', {
			headers: {
				referer: "/myfile",
				accept: "*/*"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should redirect in subdir without loop', async function () {
		const res = await got(host + '/node_modules/redirect-loop', {
			headers: {
				referer: "/myfile",
				accept: "*/*"
			}
		});
		assert.ok(res.body.includes("default toto"));
	});

	it('should support style for css', async function () {
		const res = await got(host + '/node_modules/style', {
			headers: {
				referer: "/myfile",
				accept: "text/css,*/*;q=0.1"
			}
		});
		assert.ok(res.body.includes("animation"));
	});

	it('should allow same module to export css or js', async function () {
		const stylesheet = await got(host + '/node_modules/both', {
			headers: {
				referer: "/myfile",
				accept: "text/css,*/*;q=0.1"
			}
		});
		assert.ok(stylesheet.body.includes("animation"));
		const script = await got(host + '/node_modules/both', {
			headers: {
				referer: "/myfile",
				accept: "*/*"
			}
		});
		assert.ok(script.body.includes("console.log"));
	});

	it('should support style for css in a subdir next to it', async function () {
		const res = await got(host + '/node_modules/style/asset/file.txt', {
			headers: {
				referer: "/node_modules/style/css/index.css",
				accept: "text/css,*/*;q=0.1"
			}
		});
		assert.ok(res.body.includes("some text"));
	});

	it('should return 404 when there is not module', async function () {
		assert.strictEqual(await got(host + '/node_modules/inexistent', {
			headers: {
				referer: "/myfile"
			}
		}).catch(err => err.response.statusCode), 404);
	});

	it('should return 404 when module has nothing to export', async function () {
		assert.strictEqual(await got(host + '/node_modules/nothing', {
			headers: {
				referer: "/myfile",
				accept: "text/css,*/*;q=0.1"
			}
		}).catch(err => err.response.statusCode), 404);
	});
});
