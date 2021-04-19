const path = require('path');
const serveStatic = require('serve-static');
const Resolver = require('@webmodule/resolve');
const ModuleServer = require("./server");
const HttpError = require('http-errors');

module.exports = function ({ prefix = "/", root = "." } = {}) {
	const serveHandler = serveStatic(root, {
		index: false,
		redirect: false,
		dotfiles: 'ignore',
		fallthrough: false
	});
	const reqPrefix = path.join(prefix, "node_modules", "/");
	const moduleServer = new ModuleServer({ prefix, root });
	const resolver = new Resolver({ prefix, root });

	return async function serveModule(req, res, next) {
		const reqPath = req.baseUrl + req.path;
		if (req.method != "GET" || !reqPath.startsWith(reqPrefix)) {
			return next('route');
		}
		const isNotDev = req.app.settings.env != "development";

		const ext = path.extname(reqPath).substring(1);

		const ref = req.headers['referer'] || "";
		if (ext && /^m?js$/.test(ext) && /\.m?js$/.test(ref)) {
			if (isNotDev) {
				return next(new HttpError.Unauthorized(`${reqPrefix} allows js files only for development`));
			}
			try {
				if (!moduleServer.handleRequest(req, res)) res.sendStatus(404);
			} catch (err) {
				next(err);
			}
			return;
		}

		const accepts = /\btext\/css\b/.test(req.get('accept') || "*/*") ? "css" : "js";
		const { url } = await resolver.resolve(reqPath, accepts);

		if (url) {
			if (accepts == "css") {
				// else browser warns about content-type
				res.location(url);
				res.status(302);
				res.type('text/css');
				res.end();
			} else {
				res.redirect(url);
			}
		} else {
			req.url = reqPath;
			serveHandler(req, res, next);
		}
	};
};



