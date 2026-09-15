import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../../sw.js", import.meta.url), "utf8");

test("push displays the notification before awaited network reporting", () => {
  const showIndex = sw.indexOf("self.registration.showNotification");
  const handlerStart = sw.lastIndexOf("self.addEventListener", showIndex);
  const nextHandler = sw.indexOf("self.addEventListener", showIndex + 1);

  assert.ok(handlerStart >= 0, "push handler must exist");
  assert.ok(showIndex > handlerStart, "showNotification must exist in push handler");
  assert.ok(nextHandler > showIndex, "next event handler must exist");

  const beforeShow = sw.slice(handlerStart, showIndex);
  const pushHandler = sw.slice(handlerStart, nextHandler);

  assert.doesNotMatch(beforeShow, /await\s+(?:report|fetch)\s*\(/);
  assert.doesNotMatch(pushHandler, /notification\.close\s*\(/);
});
