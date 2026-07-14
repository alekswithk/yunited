// events.js — reads content/events.json and renders event cards.
//
// The SAME card template is used for upcoming and past events.
// Whether an event is "upcoming" or "past" is computed from its date
// compared to today — you never mark events as past by hand.
//
// Used by: index.html (teasers, limited count) and events.html (full lists).
// A page opts in by having elements with these IDs:
//   #upcoming-events  — upcoming events go here
//   #past-events      — past events go here
// Optional: data-limit="2" on the container caps how many are shown.

// Figure out where this page sits so the JSON path works from any page.
const EVENTS_JSON_URL = "content/events.json";

// events.json is edited by hand, so treat its values as untrusted text.
function escapeHtml(value) {
  const holder = document.createElement("div");
  holder.textContent = value == null ? "" : String(value);
  return holder.innerHTML;
}

// Turn "2026-05-13" into "13 May 2026" for display.
function formatEventDate(isoDate) {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Build one event card. Works for both upcoming and past events.
function buildEventCard(event, isPast) {
  const card = document.createElement("article");
  card.className = "card reveal is-visible";

  // Image area: real photo if the event has one, patterned placeholder if not.
  let imageHtml;
  if (event.image) {
    imageHtml =
      '<div class="card-image"><img src="' + escapeHtml(event.image) + '" alt="Photo from ' +
      escapeHtml(event.title) + '" loading="lazy"></div>';
  } else {
    // Placeholder shows the first letter of the event title.
    imageHtml =
      '<div class="card-image" aria-hidden="true">' +
      escapeHtml(event.title.charAt(0).toUpperCase()) + "</div>";
  }

  const timeText = event.time ? " · " + event.time : "";

  // Past events link to their recap page (if any) with different wording
  // than upcoming events, which link to RSVP/tickets.
  // Only allow https links — never interpolate a javascript:/data: URL into href.
  let linkHtml = "";
  if (event.rsvpUrl && /^https:\/\//i.test(event.rsvpUrl)) {
    const linkText = isPast ? "Event page →" : "RSVP on uniclubs →";
    linkHtml =
      '<a class="card-link" href="' + escapeHtml(event.rsvpUrl) +
      '" target="_blank" rel="noopener">' + linkText + "</a>";
  }

  card.innerHTML =
    imageHtml +
    '<div class="card-body">' +
    '<p class="card-date">' + formatEventDate(event.date) + timeText + "</p>" +
    "<h3>" + escapeHtml(event.title) + "</h3>" +
    '<p class="card-location">' + escapeHtml(event.location) + "</p>" +
    '<p class="card-description">' + escapeHtml(event.description) + "</p>" +
    linkHtml +
    "</div>";

  return card;
}

// Render a list of events into a container, respecting its data-limit.
function renderEventsInto(container, events, isPast, emptyMessage) {
  const limit = parseInt(container.dataset.limit, 10) || events.length;
  const eventsToShow = events.slice(0, limit);

  if (eventsToShow.length === 0) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = emptyMessage;
    container.appendChild(note);
    return;
  }

  eventsToShow.forEach(function (event) {
    container.appendChild(buildEventCard(event, isPast));
  });
}

// Load the JSON and split into upcoming vs past based on today's date.
fetch(EVENTS_JSON_URL)
  .then(function (response) {
    return response.json();
  })
  .then(function (allEvents) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = allEvents
      .filter(function (e) { return new Date(e.date + "T00:00:00") >= today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); }); // soonest first

    const past = allEvents
      .filter(function (e) { return new Date(e.date + "T00:00:00") < today; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); }); // newest first

    const upcomingContainer = document.querySelector("#upcoming-events");
    const pastContainer = document.querySelector("#past-events");

    if (upcomingContainer) {
      renderEventsInto(
        upcomingContainer,
        upcoming,
        false,
        "No upcoming events are scheduled right now — follow us on Instagram (@yunited.unisg) or check uniclubs to be first to hear about the next one."
      );
    }

    if (pastContainer) {
      renderEventsInto(pastContainer, past, true, "No past events yet.");
    }
  })
  .catch(function (error) {
    console.error("Could not load events.json:", error);
  });
