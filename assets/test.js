window.onload = function () {
	console.log("onload-listener-exec!");
	var i = 0;
	var cb = function () {
		console.log(i);
		i += 1;
	};
	setInterval(cb, 1000);
};
