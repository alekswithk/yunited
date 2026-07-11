// members.js — reads content/members.json and renders the board grid.
// Used by members.html. The page needs an element with id="member-grid".

const MEMBERS_JSON_URL = "content/members.json";

// Build one member card: photo (or initials placeholder), name, role, bio.
function buildMemberCard(member) {
  const card = document.createElement("article");
  card.className = "card member-card reveal is-visible";

  let photoHtml;
  if (member.photo) {
    photoHtml =
      '<div class="member-photo"><img src="' + member.photo +
      '" alt="Portrait of ' + member.name + '" loading="lazy"></div>';
  } else {
    // No photo yet: show the person's initials as a placeholder.
    const initials = member.name
      .replace(/\[.*?\]/g, "?") // placeholder names render as "?"
      .split(" ")
      .map(function (word) { return word.charAt(0); })
      .join("")
      .slice(0, 2)
      .toUpperCase();
    photoHtml =
      '<div class="member-photo" aria-hidden="true">' + initials + "</div>";
  }

  const bioHtml = member.bio
    ? '<p class="member-bio">' + member.bio + "</p>"
    : "";

  card.innerHTML =
    photoHtml +
    '<div class="card-body">' +
    "<h3>" + member.name + "</h3>" +
    '<p class="member-role">' + member.role + "</p>" +
    bioHtml +
    "</div>";

  return card;
}

fetch(MEMBERS_JSON_URL)
  .then(function (response) {
    return response.json();
  })
  .then(function (members) {
    const grid = document.querySelector("#member-grid");
    if (!grid) return;

    members.forEach(function (member) {
      grid.appendChild(buildMemberCard(member));
    });
  })
  .catch(function (error) {
    console.error("Could not load members.json:", error);
  });
