// main.js — small shared behaviors used on every page:
// 1. mobile menu toggle, 2. reveal-on-scroll, 3. footer year.
// No frameworks, no libraries.

// --- 1. Mobile menu toggle ---
const navToggleButton = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");

if (navToggleButton && mainNav) {
  navToggleButton.addEventListener("click", function () {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

// --- 2. Reveal sections as they scroll into view ---
// Elements with class "reveal" fade in. If the user prefers reduced
// motion, CSS already shows everything without animation.
const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window && revealElements.length > 0) {
  const revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealElements.forEach(function (element) {
    revealObserver.observe(element);
  });
} else {
  // Old browser fallback: just show everything.
  revealElements.forEach(function (element) {
    element.classList.add("is-visible");
  });
}

// --- 3. Current year in the footer ---
const yearElement = document.querySelector("#footer-year");
if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}
