@webmodule/serve -- serve scripts and stylesheets from modules
==============================================================

Make this works with the help of an express middleware:

```js
import MyClass from "/node_modules/name";
```

or

```css
@import "/node_modules/name";
```

Usage
-----

```js
const serveModule = require("@webmodule/serve");
app.use(serveModule({prefix: "/", root: "."}));
```

Limitations
-----------

Use *only* for development.

Throws an error when express app env is not.
