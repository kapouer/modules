@webmodule/serve -- serve scripts and stylesheets from modules
==============================================================

Make this works with the help of an express middleware:

```js
import MyClass from "/modules/name";
```

or

```css
@import "/modules/name";
```

Usage
-----

```js
const serveModule = require("@webmodule/serve");
app.get("/modules/*", serveModule("modules"));
```

Limitations
-----------

Use *only* for development.

Throws an error when express app env is not.
