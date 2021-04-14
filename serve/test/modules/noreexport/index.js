if (typeof window !== "undefined") {
	"use strict";
	const sideEffect = function () {
		document.body.dataset.sideEffect = "yes";
	};

	window.sideEffect = sideEffect;
}
