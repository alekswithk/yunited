// Shared board-member helpers, run at BUILD time (was js/members.js).
// A seat whose name isn't filled in yet still gets its row — the role is the
// news, the name follows. Scaffolding like "[PLACEHOLDER: Full Name]" must
// never reach the page.

export function isUnfilled(value) {
  return !value || /\[.*?\]/.test(String(value));
}

// The member's name, or null when the seat is filled but the person isn't
// announced yet. Null rather than "To be announced" so this module stays
// dictionary-free — the caller renders its own localized placeholder.
export function displayName(member) {
  return isUnfilled(member.name) ? null : member.name;
}

// Drop-cap initial, shown until a member has a real photo.
export function initialOf(name) {
  const cleaned = String(name || "").replace(/\[.*?\]/g, "").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() : "?";
}
