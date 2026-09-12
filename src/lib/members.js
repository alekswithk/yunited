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

// Initials avatar, shown until a member has a real photo: first letter of
// the first and last name, or just the one letter for a single-word name.
export function initialOf(name) {
  const cleaned = String(name || "").replace(/\[.*?\]/g, "").trim();
  if (!cleaned) return "?";
  const words = cleaned.split(/\s+/);
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}
