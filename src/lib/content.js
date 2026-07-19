// The one place the board's content is loaded and validated. Every page imports
// events/members FROM HERE, never from the raw JSON, so any build touches this
// module and the schema check runs before a single page is emitted.
//
// A validation failure throws with a message that points at the offending file,
// entry index and field — readable enough for a board member to fix without
// reading a stack trace.
import rawEvents from "../../content/events.json";
import rawMembers from "../../content/members.json";
import { eventsSchema, membersSchema } from "./schema.js";

function validate(file, schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    // path [2, "date"] -> "content/events.json[2].date"
    const where = issue.path.reduce(
      (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : `${acc}.${seg}`),
      file
    );
    return `  • ${where} ${issue.message}`;
  });

  throw new Error(
    `${file} failed content validation:\n${lines.join("\n")}\n` +
      `Fix the field(s) above and rebuild.`
  );
}

export const events = validate("content/events.json", eventsSchema, rawEvents);
export const members = validate("content/members.json", membersSchema, rawMembers);
