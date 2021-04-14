const dash = require('dashdash');

const parser = dash.createParser({
	options: [
		{
			names: ['help', 'h'],
			type: 'bool',
			help: 'Print this help and exit.'
		},
		{
			names: ['port'],
			type: 'number',
			help: 'port'
		},
		{
			names: ['prefix'],
			type: 'string',
			help: 'prefix'
		},
		{
			names: ['node_path'],
			type: 'string',
			help: 'path to node_modules'
		}
	]
});

let opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

if (opts.help) {
	const help = parser.help({includeEnv: true}).trimRight();
	console.log(`usage: webmodule-serve [opts]\n${help}`);
	process.exit(0);
}

const express = require('express');
const app = express();
const serveModule = require('..');

const prefix = '/' + (opts.prefix || 'node_modules');

app.get(prefix + '/*', serveModule(prefix, opts.node_path || "node_modules"));

app.listen(opts.port);


