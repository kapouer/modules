@webmodule/resolve
==================

A simple class to resolve es, cjs, or node modules.

Can be used with rollup, esbuild, swc, esmoduleserver, ...

Example with a rollup plugin:

```js
const Resolver = require('@webmodule/resolve');

function rollupModulesPrefix(root) {
 if (!root) return;
 const resolver = new Resolver({
  node_path: 'node_modules', // this is the default
  prefix: root
 });
 return {
  name: "modulesPrefix",
  async resolveId(source, importer) {
   if (!source.startsWith(root)) return null; //
   const obj = resolver.resolve(source, importer);
   return obj.path;
  }
 };
}
```

see @webmodules/bundle for a more complete example.

* new Resolver({prefix = "/", root = "."})
  Resolves url starting with `${prefix}node_modules/`,
  search for modules in `${root}/node_modules`.

* resolver.resolve(url, type)
  returns a { path, url } object.
  The url is a url pathname.
  The type is "js" or "css".
  If it is "css", package.json "style" field is privileged.
  Returns a file path, and a url to redirect to (when needed).
