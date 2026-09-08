import test from "node:test";
import assert from "node:assert/strict";

import { github } from "./github.js";

const ENV = {
  GITHUB_TOKEN: "secret-token",
  GITHUB_REPO: "alekswithk/yunited",
  GITHUB_BRANCH: "main",
};

const response = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? {} : { "Content-Type": "application/json" },
  });

function commitApi() {
  const calls = [];
  let blob = 0;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname.replace("/repos/alekswithk/yunited", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method, body, headers: init.headers });

    if (method === "GET" && path === "/git/ref/heads/main") {
      return response({ object: { sha: "parent-sha" } });
    }
    if (method === "GET" && path === "/git/commits/parent-sha") {
      return response({ tree: { sha: "base-tree" } });
    }
    if (method === "POST" && path === "/git/blobs") {
      blob += 1;
      return response({ sha: `blob-${blob}` });
    }
    if (method === "POST" && path === "/git/trees") return response({ sha: "new-tree" });
    if (method === "POST" && path === "/git/commits") return response({ sha: "new-commit" });
    if (method === "PATCH" && path === "/git/refs/heads/main") return response({});
    throw new Error(`Unexpected GitHub request: ${method} ${path}`);
  };
  return { calls, fetchImpl };
}

test("commit writes blobs, one tree, one commit and one fast-forward ref update", async () => {
  const { calls, fetchImpl } = commitApi();
  const result = await github(ENV, { fetchImpl }).commit("content: update", [
    { path: "content/events/one.json", content: "{\"title\":\"Šta\"}\n" },
    { path: "src/images/one.jpg", content: new Uint8Array([0, 1, 255]) },
    { path: "content/events/old.json", remove: true },
  ]);

  assert.deepEqual(result, {
    sha: "new-commit",
    url: "https://github.com/alekswithk/yunited/commit/new-commit",
  });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    "GET /git/ref/heads/main",
    "GET /git/commits/parent-sha",
    "POST /git/blobs",
    "POST /git/blobs",
    "POST /git/trees",
    "POST /git/commits",
    "PATCH /git/refs/heads/main",
  ]);

  const tree = calls.find((call) => call.path === "/git/trees").body;
  assert.equal(tree.base_tree, "base-tree");
  assert.deepEqual(tree.tree, [
    { path: "content/events/one.json", mode: "100644", type: "blob", sha: "blob-1" },
    { path: "src/images/one.jpg", mode: "100644", type: "blob", sha: "blob-2" },
    { path: "content/events/old.json", mode: "100644", type: "blob", sha: null },
  ]);
  const ref = calls.at(-1);
  assert.deepEqual(ref.body, { sha: "new-commit" });
  assert.equal("force" in ref.body, false);
  assert.match(calls[2].headers.Authorization, /^Bearer /);
  assert.equal(Buffer.from(calls[2].body.content, "base64").toString(), "{\"title\":\"Šta\"}\n");
  assert.deepEqual([...Buffer.from(calls[3].body.content, "base64")], [0, 1, 255]);
});

test("commit refuses a stale read before uploading anything", async () => {
  const { calls, fetchImpl } = commitApi();
  await assert.rejects(
    () =>
      github(ENV, { fetchImpl }).commit(
        "content: stale",
        [{ path: "src/i18n/en.json", content: "{}" }],
        { expectedHeadSha: "older-sha" },
      ),
    (error) => error.status === 409 && /branch moved/.test(error.message),
  );
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    "GET /git/ref/heads/main",
  ]);
});

test("readFilesAtHead pins all reads to one head and decodes UTF-8", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/repos/alekswithk/yunited", "") + parsed.search;
    calls.push(path);
    if (path === "/git/ref/heads/main") return response({ object: { sha: "head-sha" } });
    if (path === "/contents/src/i18n/en.json?ref=head-sha") {
      return response({ content: Buffer.from("{\"hello\":\"Živjo\"}").toString("base64") });
    }
    throw new Error(`Unexpected GitHub request: ${init.method ?? "GET"} ${path}`);
  };

  const result = await github(ENV, { fetchImpl }).readFilesAtHead(["src/i18n/en.json"]);
  assert.deepEqual(result, {
    headSha: "head-sha",
    files: { "src/i18n/en.json": "{\"hello\":\"Živjo\"}" },
  });
  assert.deepEqual(calls, [
    "/git/ref/heads/main",
    "/contents/src/i18n/en.json?ref=head-sha",
  ]);
});

test("readContent lists JSON blobs only and returns parsed entries", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname.replace("/repos/alekswithk/yunited", "");
    if (path === "/git/trees/main%3Acontent") {
      return response({ tree: [
        { type: "blob", path: "events/one.json", sha: "one" },
        { type: "blob", path: "events/photo.jpg", sha: "photo" },
        { type: "tree", path: "members", sha: "members" },
      ] });
    }
    if (path === "/git/blobs/one") {
      return response({ content: Buffer.from("{\"title\":\"One\"}").toString("base64") });
    }
    throw new Error(`Unexpected GitHub request: ${path}`);
  };
  const result = await github(ENV, { fetchImpl }).readContent();
  assert.deepEqual(result, { "events/one.json": { title: "One" } });
});

test("GitHub API failures preserve the status and readable message", async () => {
  const fetchImpl = async () => response({ message: "Bad credentials" }, 401);
  await assert.rejects(
    () => github(ENV, { fetchImpl }).readContent(),
    (error) => error.status === 401 && /Bad credentials/.test(error.message),
  );
});
