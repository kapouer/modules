(function (global, factory) {
	"use strict";
	if (typeof module === "object" && typeof module.exports === "object") {
		module.exports = global.document ?
			factory(global, true) :
			function (w) {
				if (!w.document) {
					throw new Error("requires a window with a document");
				}
				return factory(w);
			};
	} else {
		factory(global);
	}
})(typeof window !== "undefined" ? window : this, function (window, noGlobal) {
	"use strict";
	const sideEffect = function () {
		document.body.dataset.sideEffect = "yes";
	};
	if (typeof define === "function" && define.amd) {
		define("sideeffect", [], function () {
			return sideEffect;
		});
	}

	if (typeof noGlobal === "undefined") {
		window.sideEffect = sideEffect;
	}
	return sideEffect;
});
