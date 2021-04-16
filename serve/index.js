const path = require('path');
const serveStatic = require('serve-static');
const Resolver = require('@webmodule/resolve');
const ModuleServer = require("./server");
const HttpError = require('http-errors');

/* ES Modules path resolution for browsers */
/* uses fields in package.json (exports,module,jsnext:main,main) */
/* mount is the base path, and it needs a whitelist of modules names */

module.exports = function(prefix, node_modules = "node_modules") {
	const node_path = path.join('.', node_modules);
	const serveHandler = serveStatic(path.resolve(node_path), {
		index: false,
		redirect: false,
		dotfiles: 'ignore',
		fallthrough: false
	});
	if (!prefix.startsWith('/')) prefix = '/' + prefix;

	const moduleServer = new ModuleServer({
		root: node_path,
		prefix: prefix.substring(1)
	});

	const resolver = new Resolver({ node_path, prefix });

	return function serveModule(req, res, next) {
		if (!req.path.startsWith(prefix + '/')) {
			return next('route');
		}
		if (req.app.settings.env != "development") {
			throw new HttpError.Unauthorized(prefix + " is only served in development environment");
		}

		const ext = path.extname(req.path);
		const ref = req.headers['referer'] || "";
		if (ext && /^\.m?js$/.test(ext) && /\.m?js$/.test(ref)) {
			try {
				if (!moduleServer.handleRequest(req, res)) res.sendStatus(404);
			} catch (err) {
				next(err);
			}
			return;
		}
		const accepts = /\btext\/css\b/.test(req.get('accept') || "*/*") ? "css" : "js";

		const { redir, url } = resolver.resolve(req.path, accepts);
		if (redir) {
			if (accepts == "css") {
				// redirect sets text/plain :(
				res.location(url);
				res.status(302);
				res.type('text/css');
				res.end();
			} else {
				res.redirect(url);
			}
		} else {
			req.url = url;
			serveHandler(req, res, next);
		}
	};
};



