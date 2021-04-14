const assert = require('assert');
const express = require('express');
const got = require('got');

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
				referer: "/mymodule.js"
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
				referer: "/mymodule.js"
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
				referer: "/mymodule.js"
			}
		});
		assert.ok(res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should not reexport global module', async function () {
		const res = await got(host + '/modules/noreexport/index.js', {
			headers: {
				referer: "/mymodule.js"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should leave file untouched', async function () {
		const res = await got(host + '/modules/reexport/index.js', {
			headers: {
				referer: "/myfile"
			}
		});
		assert.ok(!res.body.startsWith("const module = {exports: {}};const exports = module.exports;"));
	});

	it('should redirect in subdir without loop', async function () {
		const res = await got(host + '/modules/redirect-loop', {
			headers: {
				referer: "/myfile"
			}
		});
		assert.ok(res.body.includes("default toto"));
	});
});
