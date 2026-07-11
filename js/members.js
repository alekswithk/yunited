// members.js — renders the board masthead from content/members.json.
// Used by members.html. The page needs an element with id="member-grid".
//
// The board has a hierarchy and the page reflects it: the FIRST entry in the
// JSON runs as the lead spread, everyone after it is set as a roster line.
// To change who leads, reorder members.json — no code change needed.

const MEMBERS_JSON_URL = "content/members.json";

// members.json is edited by hand, so treat its values as untrusted text.
function escapeHtml(value) {
  const holder = document.createElement("div");
  holder.textContent = value == null ? "" : String(value);
  return holder.innerHTML;
}

// A seat whose name hasn't been filled in yet still gets its row — the role
// is the news, the name follows. Scaffolding like "[PLACEHOLDER: Full Name]"
// must never reach the page.
function isUnfilled(value) {
  return !value || /\[.*?\]/.test(String(value));
}

function displayName(member) {
  return isUnfilled(member.name) ? "To be announced" : member.name;
}

// Drop-cap initial, shown until a member has a real photo.
function initialOf(name) {
  const cleaned = String(name || "").replace(/\[.*?\]/g, "").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() : "?";
}

function portraitHtml(member) {
  if (member.photo) {
    return '<div class="portrait"><img src="' + escapeHtml(member.photo) +
      '" alt="Portrait of ' + escapeHtml(displayName(member)) + '" loading="lazy"></div>';
  }
  const tba = isUnfilled(member.name) ? " is-tba" : "";
  return '<div class="portrait' + tba + '" aria-hidden="true">' + initialOf(member.name) + "</div>";
}

function bioHtml(member, className) {
  if (isUnfilled(member.bio)) return "";
  return '<p class="' + className + '">' + escapeHtml(member.bio) + "</p>";
}

// The lead: oversized portrait beside the name, like an editor's letter.
function buildLead(member) {
  const lead = document.createElement("article");
  lead.className = "masthead-lead";
  const tba = isUnfilled(member.name) ? " is-tba" : "";
  lead.innerHTML =
    portraitHtml(member) +
    '<div class="masthead-body">' +
      '<p class="masthead-role">' + escapeHtml(member.role) + "</p>" +
      '<h3 class="masthead-name' + tba + '">' + escapeHtml(displayName(member)) + "</h3>" +
      bioHtml(member, "masthead-bio") +
    "</div>";
  return lead;
}

// A roster line: role hanging in the left margin, person to the right.
function buildRosterRow(member) {
  const row = document.createElement("article");
  row.className = "roster-row";
  const tba = isUnfilled(member.name) ? " is-tba" : "";
  row.innerHTML =
    '<p class="roster-role">' + escapeHtml(member.role) + "</p>" +
    '<div class="roster-person">' +
      portraitHtml(member) +
      "<div>" +
        '<p class="roster-name' + tba + '">' + escapeHtml(displayName(member)) + "</p>" +
        bioHtml(member, "roster-bio") +
      "</div>" +
    "</div>";
  return row;
}

function renderEmpty(mount, message) {
  mount.innerHTML = '<p class="empty-note">' + message + "</p>";
}

fetch(MEMBERS_JSON_URL)
  .then(function (response) {
    return response.json();
  })
  .then(function (members) {
    const mount = document.querySelector("#member-grid");
    if (!mount) return;

    if (!Array.isArray(members) || members.length === 0) {
      renderEmpty(mount, "The board for this semester is being confirmed. Check back shortly.");
      return;
    }

    mount.appendChild(buildLead(members[0]));

    const rest = members.slice(1);
    if (rest.length > 0) {
      const roster = document.createElement("div");
      roster.className = "roster";
      rest.forEach(function (member) {
        roster.appendChild(buildRosterRow(member));
      });
      mount.appendChild(roster);
    }
  })
  .catch(function (error) {
    console.error("Could not load members.json:", error);
    const mount = document.querySelector("#member-grid");
    if (mount) {
      renderEmpty(mount, "The board list could not be loaded. Reload the page to try again.");
    }
  });
