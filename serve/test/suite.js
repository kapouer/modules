const assert = require('assert');
const express = require('express');
const got = require('got').extend({ retry: 0 });

const serveModule = require('..');

describe("test suite", function () {
	this.timeout(10000);
	let server, host;

	before(function (done) {
		const app = express();

		app.get('/modules/*', serveModule('/modules', "test/modules"));

		server = app.listen(() => {
			host = `http://localhost:${server.address().port}`;
			done();
		});
	});
	after(function (done) {
		server.close(done);
	});

	it('should redirect module with main field', async function () {
		const res = await got(host + '/modules/redirect-main', {
			followRedirect: false,
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res.headers.location,
			"/modules/redirect-main/here/index.js"
		);
	});

	it('should redirect module with exports field', async function () {
		const res = await got(host + '/modules/redirect-exports', {
			followRedirect: false,
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.strictEqual(
			res.headers.location,
			"/modules/redirect-exports/src/index.js"
		);
	});

	it('should reexport global module', async function () {
		const res = await got(host + '/modules/reexport/index.js', {
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.ok(res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should not reexport global module', async function () {
		const res = await got(host + '/modules/noreexport/index.js', {
			headers: {
				referer: "/mymodule.js",
				accept: "*/*"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should leave file untouched', async function () {
		const res = await got(host + '/modules/reexport/index.js', {
			headers: {
				referer: "/myfile",
				accept: "*/*"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should redirect in subdir without loop', async function () {
		const res = await got(host + '/modules/redirect-loop', {
			headers: {
				referer: "/myfile",
				accept: "*/*"
			}
		});
		assert.ok(res.body.includes("default toto"));
	});

	it('should support style for css', async function () {
		const res = await got(host + '/modules/style', {
			headers: {
				referer: "/myfile",
				accept: "text/css,*/*;q=0.1"
			}
		});
		assert.ok(res.body.includes("animation"));
	});

	it('should return 404 when there is not module', async function () {
		assert.strictEqual(await got(host + '/modules/inexistent', {
			headers: {
				referer: "/myfile"
			}
		}).catch(err => err.response.statusCode), 404);
	});

	it('should return 404 when module has nothing to export', async function () {
		assert.strictEqual(await got(host + '/modules/nothing', {
			headers: {
				referer: "/myfile",
				accept: "text/css,*/*;q=0.1"
			}
		}).catch(err => err.response.statusCode), 404);
	});
});
