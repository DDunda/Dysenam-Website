window.onload = function() {
	const navLinks = document.querySelectorAll("nav>a")

		console.log(window.location.href)
	navLinks.forEach((link) => {
		console.log(link.href)
		if (link.href != window.location.href) return;

		link.classList.add("current-page");
	});
}