// The admin panel's browser code.
//
// It is deliberately dumb. It draws whatever GET /admin/api/state describes and
// posts back what the board typed; every decision that matters — which file an
// entry lands in, whether a value is acceptable, what gets committed — belongs
// to the Worker (worker/index.js). The form is built from the field definitions
// the API returns rather than written out in index.html, so there is no second
// description of the content model here to fall out of step with
// src/lib/schema.js.
//
// Client-side validation exists only to save a round trip. The Worker re-checks
// everything against the real Zod schema and is the authority; if the two ever
// disagree, the Worker wins and the board sees its message.
//
// Nothing here is inlined into the page: the /admin CSP has no 'unsafe-inline'.
// Content is put into the DOM with textContent, never innerHTML, so a title
// with an angle bracket in it is text rather than markup.

const $ = (id) => document.getElementById(id);

const el = {
  banner: $("banner"),
  tabs: $("tabs"),
  listView: $("view-list"),
  editView: $("view-edit"),
  listTitle: $("list-title"),
  addBtn: $("add-btn"),
  loading: $("loading"),
  entries: $("entries"),
  empty: $("empty"),
  sortSelect: $("sort-select"),
  backBtn: $("back-btn"),
  formTitle: $("form-title"),
  form: $("entry-form"),
  fields: $("fields"),
  imageLabel: $("image-label"),
  imageHelp: $("image-help"),
  imageInput: $("image-input"),
  photoPreview: $("photo-preview"),
  photoNote: $("photo-note"),
  saveBtn: $("save-btn"),
  cancelBtn: $("cancel-btn"),
  deleteBtn: $("delete-btn"),
  formError: $("form-error"),
  signedInAs: $("signed-in-as"),
  helpToggle: $("help-toggle"),
  helpPanel: $("help-panel"),
  helpClose: $("help-close"),
  confirmDialog: $("confirm-dialog"),
  confirmTitle: $("confirm-title"),
  confirmBody: $("confirm-body"),
  confirmWarning: $("confirm-warning"),
  confirmGoBtn: $("confirm-go-btn"),
  listBody: $("list-body"),
  accessBody: $("access-body"),
  accessLoading: $("access-loading"),
  accessList: $("access-list"),
  accessForm: $("access-form"),
  accessInput: $("access-input"),
  accessAddBtn: $("access-add-btn"),
  accessError: $("access-error"),
  translationsBody: $("translations-body"),
  translationsLoading: $("translations-loading"),
  translationsStatus: $("translations-status"),
  translationsUsage: $("translations-usage"),
  translationsKeyForm: $("translations-key-form"),
  translationsKeyInput: $("translations-key-input"),
  translationsSaveBtn: $("translations-save-btn"),
  translationsRemoveBtn: $("translations-remove-btn"),
  translationsError: $("translations-error"),
};

/** The two tabs that are not content collections. */
const ACCESS = "access";
const TRANSLATIONS = "translations";

/** Everything the page knows. Replaced wholesale by every reload of state. */
const state = {
  collections: [],
  entries: {},
  active: "events",
  /** The entry being edited, or null when adding a new one. */
  editing: null,
  /** Chosen sort key per collection, e.g. { events: "date-desc" }. */
  sort: {},
  /** Non-collection sections, as reported by /admin/api/state. */
  sections: {},
  /**
   * The access list, once the tab has been opened. `emails` doubles as the
   * "expected" value sent with every change, so the Worker can tell that this
   * page was looking at a current list — see postAccess in worker/index.js.
   */
  access: { loaded: false, emails: [], you: null },
  /** The DeepL key's status, once the Translations tab has been opened. */
  translations: { loaded: false, deepl: null },
};

// ---------------------------------------------------------------------------
// Loading

boot();

async function boot() {
  wireUpChrome();

  try {
    const data = await api("/admin/api/state");
    state.collections = data.collections;
    state.entries = data.entries;
    state.sections = data.sections ?? {};

    if (data.user?.email) {
      el.signedInAs.textContent = `Signed in as ${data.user.email}`;
      el.signedInAs.hidden = false;
    }

    renderTabs();
    openSection();
  } catch (error) {
    el.loading.hidden = true;
    showBanner(
      `Couldn't load the current content: ${error.message} — try reloading the page.`,
      false,
    );
  }
}

/**
 * Take the updated list the save/delete response carries.
 *
 * Deliberately NOT a re-read of /admin/api/state: GitHub can serve a stale copy
 * for a few seconds after a commit, which would show the board the value they
 * just replaced and leave them wondering whether the save worked. The Worker
 * returns the collection it knows it wrote. See collectionAfter in
 * worker/index.js.
 */
function applyEntries(result) {
  if (result.entries) state.entries[state.active] = result.entries;
  renderList();
}

function collection(name = state.active) {
  return state.collections.find((c) => c.name === name);
}

// ---------------------------------------------------------------------------
// List view

function renderTabs() {
  el.tabs.replaceChildren();

  // The content collections, then Access if this deployment has it configured.
  // The Worker decides that (sections.access.enabled); with no Cloudflare token
  // set there is no tab at all rather than a tab that errors when pressed.
  const tabs = state.collections.map((c) => ({ name: c.name, label: c.label }));
  if (state.sections.access?.enabled) tabs.push({ name: ACCESS, label: "Access" });
  // Always present, unlike Access. This tab is where a key gets set, so hiding
  // it when none is set would hide the fix along with the problem.
  if (state.sections.translations?.enabled) tabs.push({ name: TRANSLATIONS, label: "Translations" });

  for (const { name, label } of tabs) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.textContent = label;
    // aria-current, not role="tab"/aria-selected: those are only meaningful
    // inside a proper tablist/tabpanel structure, and this is a nav that swaps
    // the whole view. aria-current is exactly "the one you're on".
    if (name === state.active) tab.setAttribute("aria-current", "true");
    tab.addEventListener("click", () => {
      state.active = name;
      renderTabs();
      openSection();
    });
    el.tabs.append(tab);
  }
}

/** Show whichever section `state.active` names, loading it if it needs loading. */
function openSection() {
  const active = state.active;
  el.listBody.hidden = active === ACCESS || active === TRANSLATIONS;
  el.accessBody.hidden = active !== ACCESS;
  el.translationsBody.hidden = active !== TRANSLATIONS;

  if (active === ACCESS) {
    if (!state.access.loaded) loadAccess();
    else renderAccess();
  } else if (active === TRANSLATIONS) {
    // Loaded on open, never on boot: this one asks DeepL whether the key still
    // works, and the Events tab must not wait on deepl.com to draw itself.
    if (!state.translations.loaded) loadTranslations();
    else renderTranslations();
  } else {
    renderList();
  }

  showList();
}

function renderList() {
  const c = collection();
  el.loading.hidden = true;
  el.listTitle.textContent = c.label;
  el.addBtn.textContent = `Add ${c.singular}`;

  renderSortOptions(c);

  const items = sortEntries(state.entries[c.name] ?? [], currentSort(c));
  el.empty.hidden = items.length > 0;
  el.entries.replaceChildren(...items.map((item) => renderRow(c, item)));
}

/** The sort this collection is currently showing; the registry's first by default. */
function currentSort(c) {
  const chosen = c.sorts.find((s) => s.key === state.sort[c.name]);
  return chosen ?? c.sorts[0];
}

function renderSortOptions(c) {
  const active = currentSort(c);
  el.sortSelect.replaceChildren(
    ...c.sorts.map((s) => {
      const option = document.createElement("option");
      option.value = s.key;
      option.textContent = s.label;
      option.selected = s.key === active.key;
      return option;
    }),
  );
}

/**
 * Order a collection by one of the sorts its registry entry declares.
 *
 * One comparator for every collection, driven by data rather than a function
 * per list — the sorts arrive from the Worker as {field, type, dir, nullsAre}
 * (see worker/collections.js), so adding a way to sort is a line there and
 * nothing here.
 *
 * Sorting is done in the browser because the whole collection is already
 * loaded: re-ordering is instant and costs no round trip to GitHub.
 */
function sortEntries(items, sort) {
  const copy = [...items];

  copy.sort((a, b) => {
    const cmp = compareValues(a.data[sort.field], b.data[sort.field], sort);
    // Ties fall back to the filename so the order is stable and never
    // reshuffles between renders — two events on the same date, or two
    // board members who both have no name yet, must not swap places.
    return cmp !== 0 ? cmp : a.file.localeCompare(b.file);
  });

  return copy;
}

function compareValues(a, b, sort) {
  const direction = sort.dir === "desc" ? -1 : 1;

  if (sort.type === "date") {
    // An empty date means "announced but not scheduled", which belongs with
    // the future rather than before last year's events — so it sorts as the
    // latest possible date. That puts it first under "newest first" and last
    // under "oldest first", which reads correctly both ways.
    const rank = (v) => (v ? Date.parse(v) : sort.nullsAre === "latest" ? Infinity : -Infinity);
    const ra = rank(a);
    const rb = rank(b);
    return ra === rb ? 0 : (ra < rb ? -1 : 1) * direction;
  }

  if (sort.type === "number") {
    const na = typeof a === "number" ? a : Infinity;
    const nb = typeof b === "number" ? b : Infinity;
    return na === nb ? 0 : (na < nb ? -1 : 1) * direction;
  }

  // Text. localeCompare so č/š/ž sort where a reader expects them, and blanks
  // ("to be announced") go last whichever direction is asked for — an empty
  // name at the top of an A–Z list is just noise.
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  if (sa === "" && sb === "") return 0;
  if (sa === "") return 1;
  if (sb === "") return -1;
  return sa.localeCompare(sb, undefined, { sensitivity: "base" }) * direction;
}

function renderRow(c, item) {
  const row = document.createElement("li");
  row.className = "entry";

  // The thumbnail comes from /images/… — the unoptimized originals that
  // scripts/mirror-media.mjs publishes precisely so this page can show them.
  const imagePath = item.data[c.image.field];
  if (imagePath) {
    const img = document.createElement("img");
    img.className = "entry-thumb";
    img.src = `/${imagePath}`;
    img.alt = "";
    img.loading = "lazy";
    row.append(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "entry-thumb entry-thumb-empty";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = (item.data.title ?? item.data.role ?? item.data.name ?? "?")
      .charAt(0)
      .toUpperCase();
    row.append(placeholder);
  }

  const text = document.createElement("div");
  text.className = "entry-text";

  const name = document.createElement("p");
  name.className = "entry-name";
  name.textContent = item.data.title ?? item.data.name ?? item.data.role ?? item.file;
  text.append(name);

  const meta = document.createElement("p");
  meta.className = "entry-meta";
  meta.textContent = describe(c, item.data);
  text.append(meta);

  // Upcoming / past is never stored — the site works it out from the date, and
  // so does this badge. Mirrors splitEvents() in src/lib/events.js: an event is
  // past only once its date is strictly before today.
  if (c.name === "events") {
    const badge = document.createElement("span");
    if (!item.data.date) {
      badge.className = "pill pill-tba";
      badge.textContent = "date TBA";
      meta.append(badge);
    } else if (isPast(item.data.date)) {
      badge.className = "pill pill-past";
      badge.textContent = "past";
      meta.append(badge);
    }
  }

  // Where this entry's translations stand, worked out by the Worker from the
  // text and the block beside it. Absent for collections that are never
  // translated — and absent from an older response, which is why nothing here
  // assumes the key exists.
  const badge = TRANSLATION_PILLS[item.translation?.state];
  if (badge) meta.append(pill(badge.label, badge.className));

  row.append(text);

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openForm(item));
  actions.append(edit);
  row.append(actions);

  return row;
}

/** The grey line under an entry's name. */
function describe(c, data) {
  if (c.name === "events") {
    return [data.date ?? "no date yet", data.time, data.location].filter(Boolean).join(" · ");
  }
  if (c.name === "members") {
    return [`${data.order}.`, data.role, data.name || "to be announced"].filter(Boolean).join(" · ");
  }
  return [`${data.order}.`, data.url].filter(Boolean).join(" · ");
}

function isPast(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${isoDate}T00:00:00`) < today;
}

// ---------------------------------------------------------------------------
// Edit view

function openForm(item = null) {
  const c = collection();
  state.editing = item;

  el.formTitle.textContent = item
    ? `Edit ${c.singular}`
    : `Add ${c.singular}`;
  el.deleteBtn.hidden = !item;
  el.formError.hidden = true;
  el.imageInput.value = "";

  // Build the inputs from the API's field definitions.
  el.fields.replaceChildren(...c.fields.map((field) => renderField(field, item?.data)));

  // Photo control.
  el.imageLabel.textContent = c.image.label + (c.image.required ? "" : " (optional)");
  el.imageHelp.textContent = c.image.help;
  el.imageInput.accept = c.image.accept;

  const current = item?.data?.[c.image.field];
  if (current) {
    el.photoPreview.src = `/${current}`;
    el.photoPreview.hidden = false;
    el.photoNote.textContent = "Current photo. Choose a file only if you want to replace it.";
  } else {
    el.photoPreview.removeAttribute("src");
    el.photoPreview.hidden = true;
    el.photoNote.textContent = c.image.required
      ? "Required — choose a file."
      : "No photo yet.";
  }

  showEdit();
}

function renderField(field, data) {
  const wrap = document.createElement("div");
  wrap.className = "field";

  const id = `field-${field.name}`;

  const label = document.createElement("label");
  label.className = "label";
  label.htmlFor = id;
  label.textContent = field.label;
  if (!field.required) {
    const note = document.createElement("span");
    note.className = "optional";
    note.textContent = " (optional)";
    label.append(note);
  }
  wrap.append(label);

  if (field.help) {
    const help = document.createElement("p");
    help.className = "help";
    help.id = `${id}-help`;
    help.textContent = field.help;
    wrap.append(help);
  }

  const input =
    field.type === "text"
      ? document.createElement("textarea")
      : document.createElement("input");
  input.id = id;
  input.name = field.name;
  input.className = field.type === "text" ? "textarea" : "input";
  if (field.help) input.setAttribute("aria-describedby", `${id}-help`);
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.required) input.required = true;

  if (input.tagName === "INPUT") {
    input.type = { date: "date", time: "time", url: "url", number: "number" }[field.type] ?? "text";
    if (field.min !== undefined) input.min = String(field.min);
  }

  const value = data?.[field.name];
  input.value = value === null || value === undefined ? "" : String(value);

  wrap.append(input);
  return wrap;
}

// Show a preview of the newly chosen file straight away — the fastest way to
// notice you picked the wrong photo is to see it.
el.imageInput.addEventListener("change", () => {
  const file = el.imageInput.files?.[0];
  if (!file) return;

  const c = collection();
  if (file.size > c.image.maxBytes) {
    // The Worker enforces this too; catching it here saves uploading a 30 MB
    // file only to be told no.
    el.photoNote.textContent =
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB — too big. ` +
      `The limit is ${Math.round(c.image.maxBytes / (1024 * 1024))} MB, and under 1 MB is ideal.`;
    el.imageInput.value = "";
    return;
  }

  el.photoPreview.src = URL.createObjectURL(file);
  el.photoPreview.hidden = false;
  el.photoNote.textContent = `New photo: ${file.name} (${(file.size / 1024).toFixed(0)} KB). It replaces the old one when you save.`;
});

el.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const c = collection();

  el.formError.hidden = true;
  for (const bad of el.form.querySelectorAll(".input-bad")) bad.classList.remove("input-bad");

  // A quick pass for empty required fields, purely so the board gets an answer
  // without a round trip. The Worker checks the real rules regardless.
  for (const field of c.fields) {
    if (!field.required) continue;
    const input = el.form.elements[field.name];
    if (input && input.value.trim() === "") {
      return failForm(`${field.label} is required.`, field.name);
    }
  }
  if (c.image.required && !state.editing && !el.imageInput.files?.length) {
    return failForm(`${c.image.label} is required.`, c.image.field);
  }

  const body = new FormData();
  body.set("collection", c.name);
  body.set("file", state.editing?.file ?? "");
  for (const field of c.fields) {
    let value = el.form.elements[field.name].value;
    // Some browsers hand back "20:30:00" from an <input type="time">; the schema
    // wants HH:MM exactly.
    if (field.type === "time" && value) value = value.slice(0, 5);
    body.set(field.name, value);
  }
  if (el.imageInput.files?.length) body.set("image", el.imageInput.files[0]);

  await run(el.saveBtn, "Saving…", async () => {
    const result = await api("/admin/api/save", { method: "POST", body });
    showBanner(`${result.message} It will be live on yunited.ch in a minute or two.`, true);
    applyEntries(result);
    showList();
  });
});

el.deleteBtn.addEventListener("click", async () => {
  const c = collection();
  const item = state.editing;
  if (!item) return;

  const label = item.data.title ?? item.data.name ?? item.data.role ?? item.file;
  const ok = await confirmAction({
    title: "Delete this entry?",
    body: `“${label}” will be removed from the website, along with its photo.`,
    warning: "This cannot be undone from here.",
    action: "Delete",
  });
  if (!ok) return;

  await run(el.deleteBtn, "Deleting…", async () => {
    const result = await api("/admin/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: c.name, file: item.file }),
    });
    showBanner(result.message, true);
    applyEntries(result);
    showList();
  });
});

// ---------------------------------------------------------------------------
// Access list
//
// The list of email addresses Cloudflare Access checks before letting anyone open
// this page. Unlike every other section, it is not content in the repository —
// it is read live from Cloudflare on first open and written straight back, so a
// change here takes effect in seconds rather than after a rebuild.

async function loadAccess() {
  el.accessLoading.hidden = false;
  el.accessList.replaceChildren();

  try {
    const data = await api("/admin/api/access");
    state.access = { loaded: true, emails: data.emails, you: data.you };
    renderAccess();
  } catch (error) {
    el.accessLoading.hidden = true;
    showBanner(`Couldn't load the access list: ${error.message}`, false);
  }
}

function renderAccess() {
  el.accessLoading.hidden = true;
  el.accessError.hidden = true;
  el.accessInput.classList.remove("input-bad");

  const you = (state.access.you ?? "").toLowerCase();
  const last = state.access.emails.length === 1;

  el.accessList.replaceChildren(
    ...state.access.emails.map((email) => {
      const row = document.createElement("li");
      row.className = "entry";

      const text = document.createElement("div");
      text.className = "entry-text";

      const name = document.createElement("p");
      name.className = "entry-email";
      name.textContent = email;
      if (email === you) name.append(pill("you", "pill-you"));
      text.append(name);
      row.append(text);

      const actions = document.createElement("div");
      actions.className = "entry-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger";
      remove.textContent = "Remove";

      // Both of these are also refused by the Worker (guardChange in
      // board-access.js), which is what actually enforces them. Disabling the
      // button here is so nobody has to discover the rule by being told off.
      if (email === you) {
        remove.disabled = true;
        remove.title = "You can't remove your own access — ask someone else on the list.";
      } else if (last) {
        remove.disabled = true;
        remove.title = "This is the last address; removing it would lock everyone out.";
      } else {
        remove.addEventListener("click", () => removeEmail(email, remove));
      }

      actions.append(remove);
      row.append(actions);
      return row;
    }),
  );
}

// One badge per translation state. "none" is deliberately absent: an entry
// with no title and no description has nothing to translate, and a badge
// saying so would be noise on the one row that needs a title instead.
//
// "translated" gets a badge too, quiet rather than loud. It is the only place
// the board can see that translation is working at all — the alternative is a
// panel that looks identical whether four languages are being filled in or
// nothing has happened since July.
const TRANSLATION_PILLS = {
  translated: { label: "translated", className: "pill-ok" },
  partial: { label: "translations incomplete", className: "pill-warn" },
  stale: { label: "needs re-translating", className: "pill-warn" },
  missing: { label: "not translated yet", className: "pill-warn" },
};

function pill(label, className) {
  const span = document.createElement("span");
  span.className = `pill ${className}`;
  span.textContent = label;
  return span;
}

el.accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.accessError.hidden = true;
  el.accessInput.classList.remove("input-bad");

  // Two checks here purely so the answer is instant. The Worker validates the
  // address properly and refuses the change if it is already there.
  const email = el.accessInput.value.trim().toLowerCase();
  if (email === "") return failAccess("Type the email address you want to add.", "access-input");
  if (state.access.emails.includes(email)) {
    return failAccess(`${email} is already on the list.`, "access-input");
  }

  await run(
    el.accessAddBtn,
    "Adding…",
    async () => {
      await saveAccess([...state.access.emails, email]);
      el.accessInput.value = "";
    },
    failAccess,
  );
});

async function removeEmail(email, button) {
  const ok = await confirmAction({
    title: "Remove this person's access?",
    body: `${email} will no longer be able to open this page.`,
    warning: "You can add them back at any time.",
    action: "Remove",
  });
  if (!ok) return;

  await run(
    button,
    "Removing…",
    async () => {
      await saveAccess(state.access.emails.filter((e) => e !== email));
    },
    failAccess,
  );
}

/**
 * Write the whole list, telling the Worker what we thought we were starting from.
 *
 * `expected` is what makes a concurrent change safe to refuse rather than
 * silently overwrite: Cloudflare's API has no compare-and-swap, so this page has
 * to say what it was looking at. See postAccess in worker/index.js.
 */
async function saveAccess(emails) {
  const result = await api("/admin/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails, expected: state.access.emails }),
  });

  // What Cloudflare confirmed, not what we asked for.
  state.access = { loaded: true, emails: result.emails, you: result.you };
  renderAccess();
  showBanner(`${result.message} It takes effect immediately.`, true);
}

/**
 * The access section's own error line — the equivalent of failForm, which writes
 * into the entry form and would be invisible from here.
 *
 * The input is only marked when the problem IS the input. A refused removal ("you
 * can't remove your own address") has nothing to do with what is typed in the add
 * box, and outlining it in red there sends people to fix the wrong thing.
 */
function failAccess(message, field) {
  el.accessError.textContent = message;
  el.accessError.hidden = false;

  if (field === "access-input") {
    el.accessInput.classList.add("input-bad");
    el.accessInput.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------
// Translations
//
// Not content either: this is the DeepL key every event's translations depend
// on. The key itself never reaches this page — the Worker sends back whether
// there is one, the last four characters so it can be told apart from another,
// and this month's usage, which doubles as proof the key still works.

async function loadTranslations() {
  el.translationsLoading.hidden = false;
  el.translationsStatus.hidden = true;
  el.translationsUsage.hidden = true;
  el.translationsKeyForm.hidden = true;

  try {
    const data = await api("/admin/api/settings");
    state.translations = { loaded: true, deepl: data.deepl };
    renderTranslations();
  } catch (error) {
    el.translationsLoading.hidden = true;
    showBanner(`Couldn't check the translation settings: ${error.message}`, false);
  }
}

function renderTranslations() {
  const deepl = state.translations.deepl ?? {};

  el.translationsLoading.hidden = true;
  el.translationsError.hidden = true;
  el.translationsKeyInput.classList.remove("input-bad");

  // Three states, and they are genuinely different problems: no key at all, a
  // key DeepL refuses, and a working key. Collapsing the middle one into
  // either of the others is how somebody spends an afternoon on the wrong fix.
  let message;
  if (!deepl.configured) {
    message = "No key set, so events are saved without their translations.";
  } else if (deepl.live === false) {
    message = `The key ending …${deepl.last4} is not working: ${deepl.error}`;
  } else {
    const who = deepl.setBy ? ` Set by ${deepl.setBy}.` : "";
    message = `Working. Using the ${deepl.free ? "free" : "paid"} key ending …${deepl.last4}.${who}`;
  }
  el.translationsStatus.textContent = message;
  el.translationsStatus.classList.toggle("is-bad", deepl.configured && deepl.live === false);
  el.translationsStatus.hidden = false;

  if (deepl.usage) {
    const { count, limit, percent } = deepl.usage;
    el.translationsUsage.textContent =
      `${count.toLocaleString()} of ${limit.toLocaleString()} characters used this month` +
      (percent === null ? "" : ` — ${percent < 1 ? "under 1" : Math.round(percent)}%.`);
    el.translationsUsage.hidden = false;
  } else {
    el.translationsUsage.hidden = true;
  }

  // `editable` is false until a maintainer has created the settings store, in
  // which case the key can only come from the Worker secret and offering a box
  // to type into would be a lie.
  el.translationsKeyForm.hidden = !deepl.editable;
  el.translationsRemoveBtn.hidden = deepl.source !== "kv";
}

el.translationsKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.translationsError.hidden = true;
  el.translationsKeyInput.classList.remove("input-bad");

  const key = el.translationsKeyInput.value.trim();
  if (key === "") return failTranslations("Paste the key you want to use.", "deeplKey");

  await run(
    el.translationsSaveBtn,
    "Checking with DeepL…",
    async () => {
      const result = await api("/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deeplKey: key }),
      });
      // Cleared immediately, and never kept in `state`: the page holds a
      // credential for exactly as long as it takes to post it.
      el.translationsKeyInput.value = "";
      state.translations = { loaded: true, deepl: result.deepl };
      renderTranslations();
      showBanner(result.message, true);
    },
    failTranslations,
  );
});

el.translationsRemoveBtn.addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Remove this key?",
    body: "Translations will fall back to the key a maintainer set, if there is one.",
    warning: "If there isn't, events will save without their translations until a new key is added here.",
    action: "Remove",
  });
  if (!ok) return;

  await run(
    el.translationsRemoveBtn,
    "Removing…",
    async () => {
      const result = await api("/admin/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: true }),
      });
      state.translations = { loaded: true, deepl: result.deepl };
      renderTranslations();
      showBanner(result.message, true);
    },
    failTranslations,
  );
});

/** Errors from this section, in this section — see failAccess for the reasoning. */
function failTranslations(message, field) {
  el.translationsError.textContent = message;
  el.translationsError.hidden = false;

  if (field === "deeplKey") {
    el.translationsKeyInput.classList.add("input-bad");
    el.translationsKeyInput.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------------------
// Plumbing

/**
 * One API call. Every endpoint answers with {ok, …}, so a failure carries a
 * sentence written for a board member rather than an HTTP status.
 */
async function api(path, init) {
  const response = await fetch(path, { ...init, credentials: "same-origin" });

  let data;
  try {
    data = await response.json();
  } catch {
    // Not JSON at all — almost always the Cloudflare Access session having
    // expired and an HTML login page coming back instead.
    throw Object.assign(
      new Error("your session has expired. Reload the page to sign in again."),
      { expired: true },
    );
  }

  if (!data.ok) throw Object.assign(new Error(data.error ?? "Unknown error"), { field: data.field });
  return data;
}

/**
 * Run an action with the button disabled, turning a thrown error into a message.
 *
 * `fail` says where that message goes. It defaults to the entry form's error
 * line, which is where all of this started; the access list passes its own,
 * because writing into a hidden section's error line is the same as swallowing
 * the error.
 */
async function run(button, busyLabel, action, fail = failForm) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await action();
  } catch (error) {
    fail(error.message, error.field);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/**
 * The shared confirmation dialog, awaited: true if they went through with it.
 *
 * Every word is passed in because the same dialog now guards two different kinds
 * of action, and they are not equally final — deleting an event takes its photo
 * with it, whereas an address that was removed can simply be added back. A
 * warning line that overstates the consequence trains people to ignore it.
 */
async function confirmAction({ title, body, warning, action }) {
  el.confirmTitle.textContent = title;
  el.confirmBody.textContent = body;
  el.confirmWarning.textContent = warning;
  el.confirmGoBtn.textContent = action;

  el.confirmDialog.returnValue = "cancel";
  el.confirmDialog.showModal();

  const choice = await new Promise((resolve) => {
    el.confirmDialog.addEventListener("close", () => resolve(el.confirmDialog.returnValue), {
      once: true,
    });
  });
  return choice === "go";
}

function failForm(message, fieldName) {
  el.formError.textContent = message;
  el.formError.hidden = false;
  el.formError.scrollIntoView({ block: "center", behavior: "smooth" });

  const input = fieldName && el.form.elements[fieldName];
  if (input && input.classList) {
    input.classList.add("input-bad");
    input.focus({ preventScroll: true });
  }
}

function showBanner(message, ok) {
  el.banner.textContent = message;
  el.banner.className = `banner ${ok ? "banner-ok" : "banner-bad"}`;
  el.banner.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showList() {
  el.listView.hidden = false;
  el.editView.hidden = true;
  state.editing = null;
}

function showEdit() {
  el.listView.hidden = true;
  el.editView.hidden = false;
  el.banner.hidden = true;
  window.scrollTo({ top: 0 });
}

function wireUpChrome() {
  el.addBtn.addEventListener("click", () => openForm(null));
  el.backBtn.addEventListener("click", showList);
  el.cancelBtn.addEventListener("click", showList);

  // Remembered per collection, so switching tabs and coming back keeps the
  // order you chose rather than snapping back to the default.
  el.sortSelect.addEventListener("change", () => {
    state.sort[state.active] = el.sortSelect.value;
    renderList();
  });

  el.helpToggle.addEventListener("click", () => toggleHelp(el.helpPanel.hidden));
  el.helpClose.addEventListener("click", () => toggleHelp(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.helpPanel.hidden) toggleHelp(false);
  });
}

function toggleHelp(open) {
  el.helpPanel.hidden = !open;
  el.helpToggle.setAttribute("aria-expanded", String(open));
  if (open) el.helpPanel.querySelector("h2").scrollIntoView({ block: "nearest" });
}
