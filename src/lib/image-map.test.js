import { test } from "node:test";
import assert from "node:assert/strict";

import { caseInsensitiveImageMap } from "./image-map.js";

test("caseInsensitiveImageMap resolves paths without regard to case", () => {
  const image = { default: "asset" };
  const map = caseInsensitiveImageMap([["/src/images/Photo.JPG", image]]);
  assert.equal(map.get("/src/images/photo.jpg"), image);
});

test("caseInsensitiveImageMap rejects two files that differ only by case", () => {
  assert.throws(
    () =>
      caseInsensitiveImageMap([
        ["/src/images/Photo.jpg", {}],
        ["/src/images/photo.jpg", {}],
      ]),
    /differ only by case.*Photo\.jpg.*photo\.jpg/,
  );
});
