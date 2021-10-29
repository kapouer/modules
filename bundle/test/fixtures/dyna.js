(async () => {
	if (!window.importAll) {
		const testme = await import('./dynb.js');
		testme.default();
	}
})();
