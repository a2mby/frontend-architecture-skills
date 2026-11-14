import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../scripts/lib/frontmatter.mjs";

const fm = (s) => parseFrontmatter(`---\n${s}\n---\nbody`);

test("F-17: plain, quoted, and colon-containing values parse", () => {
  const { data } = fm(`name: fe-review\ndescription: "Review: a diff, with a # hash"\nlicense: 'it''s MIT'\nx: plain # comment`);
  assert.equal(data.name, "fe-review");
  assert.equal(data.description, "Review: a diff, with a # hash");
  assert.equal(data.license, "it's MIT");
  assert.equal(data.x, "plain");
});

test("F-17: folded, literal and plain multi-line descriptions parse", () => {
  assert.equal(fm("description: >\n  one\n  two\nname: a").data.description, "one two");
  assert.equal(fm("description: |\n  one\n  two\nname: a").data.description, "one\ntwo");
  assert.equal(fm("description: one\n  two\nname: a").data.description, "one two");
});

test("F-17: nested metadata map and lists parse", () => {
  const { data } = fm("name: a\nmetadata:\n  author: me\n  version: \"1.0\"\nallowed-tools: [Read, Bash]\ntags:\n  - x\n  - y");
  assert.deepEqual(data.metadata, { author: "me", version: "1.0" });
  assert.deepEqual(data["allowed-tools"], ["Read", "Bash"]);
  assert.deepEqual(data.tags, ["x", "y"]);
});

test("F-17: malformed frontmatter is rejected, not guessed", () => {
  assert.ok(parseFrontmatter("no frontmatter").error);
  assert.match(fm('description: "unterminated').error, /unterminated/);
  assert.match(fm("name: a\nname: b").error, /duplicate/);
  assert.match(fm("name a").error, /key: value/);
  assert.match(fm("name: a\n\tdescription: x").error, /tab|indent/);
});
