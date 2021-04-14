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
  node_path: 'node_modules',
  prefix: root
 });
 return {
  name: "modulesPrefix",
  async resolveId(source, importer) {
   if (!source.startsWith(root)) return null;
   const obj = resolver.resolve(source, importer);
   return obj.path;
  }
 };
}
```

* resolver.resolve(path)
  returns a {path, url, redir} object.
  The path is a file system path.
  If redir is true, one can use url to redirect a client to the correct url.
