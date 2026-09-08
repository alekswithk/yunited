// The only thing in this project that talks to GitHub with a write token.
//
// It exposes two operations, deliberately no more: read the whole content tree,
// and make ONE commit containing any number of file writes and deletions.
//
// WHY ONE COMMIT AND NOT SEVERAL. The obvious implementation is the Contents
// API — PUT a file, PUT another — and it is wrong here, because adding an event
// with a photo is two files. Whichever order you write them in, there is a
// window where the repo is inconsistent, and Cloudflare builds on every push:
// commit the JSON first and the next build fails outright, because
// src/lib/images.js throws when an entry names an image file that does not
// exist yet. The board would see a red deploy for a save they did correctly.
//
// So this uses the Git Data API instead — blobs, then a tree, then a commit,
// then a single ref update. Everything lands together or nothing does, one
// commit means one build, and a delete is just another entry in the same tree.
// It is about thirty more lines than the naive version and removes a whole
// class of half-saved states.

const API = "https://api.github.com";

/**
 * @param {{ GITHUB_TOKEN: string, GITHUB_REPO: string, GITHUB_BRANCH: string }} env
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function github(env, deps = {}) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const fetchImpl = deps.fetchImpl ?? fetch;

  /**
   * One GitHub REST call. Throws a readable Error on any non-2xx, because every
   * caller here treats a failed GitHub call the same way: give up and tell the
   * board, rather than press on with half the work done.
   */
  async function api(path, init = {}) {
    const response = await fetchImpl(`${API}/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        // GitHub rejects API requests without one.
        "User-Agent": "yunited-admin",
        // Reads immediately after a write can otherwise come back stale — the
        // tree-by-branch-name lookup is served from a cache for a short window,
        // so the panel could show the value it just replaced. The save and
        // delete responses avoid re-reading entirely (see collectionAfter in
        // index.js); this covers the page's first load, where a change made
        // elsewhere — the auto-translate bot, a hand edit — should still show up.
        "Cache-Control": "no-cache",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body.slice(0, 300);
      try {
        detail = JSON.parse(body).message ?? detail;
      } catch {
        // Not JSON — the truncated body is the best detail available.
      }
      const error = new Error(`GitHub ${response.status} on ${path}: ${detail}`);
      // @ts-expect-error — attaching the status so index.js can special-case 409.
      error.status = response.status;
      throw error;
    }

    return response.status === 204 ? null : response.json();
  }

  return {
    repo,
    branch,

    /**
     * Every JSON entry under content/, as
     * `{ "events/karaoke-2026.json": {...parsed...} }`.
     *
     * One tree call lists the lot (paths come back relative to content/), then
     * the blobs are fetched in parallel. It is N+1 requests for N entries,
     * which at the size of this repo — around fifteen files — is a few hundred
     * milliseconds and not worth a smarter design.
     */
    async readContent() {
      const tree = await api(
        `/git/trees/${encodeURIComponent(`${branch}:content`)}?recursive=1`,
      );

      const files = (tree.tree ?? []).filter(
        (node) => node.type === "blob" && node.path.endsWith(".json"),
      );

      const entries = await Promise.all(
        files.map(async (node) => {
          const blob = await api(`/git/blobs/${node.sha}`);
          const json = new TextDecoder().decode(base64ToBytes(blob.content));
          return [node.path, JSON.parse(json)];
        }),
      );

      return Object.fromEntries(entries);
    },

    /**
     * Read a handful of files at the current branch head, and report that head.
     *
     * Used by the inline copy editor, which reads the four i18n dictionaries,
     * changes one key, and writes them back. Returning `headSha` lets the
     * follow-up `commit()` reject (409) if the branch moved in between —
     * `commit()`'s own fast-forward check does not catch that, because it would
     * layer the stale blob onto whatever tree is current and fast-forward
     * cleanly, silently reverting someone else's edit to a different key.
     *
     * Each path segment is encoded separately: `encodeURIComponent` on the whole
     * path would turn the slashes into %2F and 404.
     *
     * @param {string[]} paths  repo-relative
     * @returns {Promise<{ files: Record<string, string>, headSha: string }>}
     */
    async readFilesAtHead(paths) {
      const ref = await api(`/git/ref/heads/${branch}`);
      const headSha = ref.object.sha;
      const files = {};
      await Promise.all(
        paths.map(async (path) => {
          const encoded = path.split("/").map(encodeURIComponent).join("/");
          const res = await api(`/contents/${encoded}?ref=${headSha}`);
          files[path] = new TextDecoder().decode(base64ToBytes(res.content));
        }),
      );
      return { files, headSha };
    },

    /**
     * Commit a set of changes as one commit on `branch`.
     *
     * @param {string} message
     * @param {{ path: string, content?: string | Uint8Array, remove?: boolean }[]} changes
     *        `path` is repo-relative. Give `content` to write, or `remove: true`
     *        to delete.
     * @param {{ expectedHeadSha?: string }} [options]
     *        When given, the commit is refused (409) if the branch has moved off
     *        `expectedHeadSha` since it was read — see readFilesAtHead.
     * @returns {Promise<{ sha: string, url: string }>}
     */
    async commit(message, changes, { expectedHeadSha } = {}) {
      // 1. Where the branch is now. This sha becomes the new commit's parent,
      //    and the fast-forward check in step 5 is what makes a concurrent save
      //    fail loudly instead of silently overwriting.
      const ref = await api(`/git/ref/heads/${branch}`);
      const parentSha = ref.object.sha;
      if (expectedHeadSha && parentSha !== expectedHeadSha) {
        throw Object.assign(
          new Error(`branch moved: read ${expectedHeadSha}, now ${parentSha}`),
          { status: 409 },
        );
      }
      const parent = await api(`/git/commits/${parentSha}`);

      // 2. Upload the new file contents as blobs. Base64 for everything,
      //    including JSON: it is the one encoding that is correct for a photo
      //    and for text with a š in it alike.
      const tree = await Promise.all(
        changes.map(async (change) => {
          if (change.remove) {
            // A null sha against an existing path is how the Git Data API spells
            // "delete this file" when building on top of a base_tree.
            return { path: change.path, mode: "100644", type: "blob", sha: null };
          }
          const bytes =
            typeof change.content === "string"
              ? new TextEncoder().encode(change.content)
              : change.content;
          const blob = await api("/git/blobs", {
            method: "POST",
            body: JSON.stringify({ content: bytesToBase64(bytes), encoding: "base64" }),
          });
          return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
        }),
      );

      // 3. A new tree layered on the current one, so untouched files are kept.
      const newTree = await api("/git/trees", {
        method: "POST",
        body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
      });

      // 4. The commit object itself.
      const newCommit = await api("/git/commits", {
        method: "POST",
        body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
      });

      // 5. Move the branch. `force` is left off on purpose: GitHub then requires
      //    a fast-forward, so if someone else saved while this request was in
      //    flight the update is rejected (422) rather than quietly discarding
      //    their commit. index.js turns that into "someone else just saved".
      await api(`/git/refs/heads/${branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: newCommit.sha }),
      });

      return {
        sha: newCommit.sha,
        url: `https://github.com/${repo}/commit/${newCommit.sha}`,
      };
    },
  };
}

// --- base64, which Workers only half provide ---------------------------------
// atob/btoa exist but are defined over "binary strings", so they cannot be
// pointed at a Uint8Array or a UTF-8 string directly. These two bridge the gap.
// Chunked because String.fromCharCode(...bytes) blows the argument limit on
// anything the size of a photo.

/** @param {Uint8Array} bytes */
function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** @param {string} base64 */
function base64ToBytes(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
