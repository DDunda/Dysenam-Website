window.onload = function() {
	const navLinks = document.querySelectorAll("nav>a")

	navLinks.forEach((link) => {
		if (link.href != window.location.href) return;

		link.classList.add("current-page");
	});
}