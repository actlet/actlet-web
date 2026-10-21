#!/usr/bin/env node
// Prepares a release in release/: the packed tarball, its SHA-256, and
// release notes from the version's section of CHANGELOG.md. It checks
// that the tag names package.json's version and that the section has a
// date. It publishes nothing; publishing to npm is manual (RELEASING.md).
//
//   pnpm build && node scripts/release.mjs --tag v0.1.0
//   pnpm build && node scripts/release.mjs          a dry run: no tag, and the section may be unreleased
//
// --out <dir> writes elsewhere; --changelog <file> reads another changelog.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    tag: { type: "string" },
    out: { type: "string", default: "release" },
    changelog: { type: "string", default: "CHANGELOG.md" },
  },
});
const fail = (why) => {
  console.error(`release: ${why}`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
if (values.tag !== undefined && values.tag !== `v${version}`) {
  fail(`the tag ${values.tag} doesn't name package.json's version, ${version}: tag v${version}, or bump the version`);
}

// The version's section: from "## <version>" to the next "## ".
const changelog = readFileSync(resolve(root, values.changelog), "utf8").split("\n");
const start = changelog.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
if (start < 0) fail(`CHANGELOG.md has no section for ${version}: add "## ${version} - <date>"`);
const heading = changelog[start];
if (values.tag !== undefined && !/\d{4}-\d{2}-\d{2}/.test(heading)) {
  fail(`CHANGELOG.md's section for ${version} has no date ("${heading}"): give it the release's date`);
}
let end = changelog.findIndex((l, i) => i > start && l.startsWith("## "));
if (end < 0) end = changelog.length;
const section = changelog
  .slice(start + 1, end)
  .join("\n")
  .trim();
if (section === "") fail(`CHANGELOG.md's section for ${version} is empty`);

if (!existsSync(join(root, "dist", "index.js"))) fail("dist/ isn't built: run pnpm build first");
const out = resolve(root, values.out);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync("pnpm", ["pack", "--pack-destination", out], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
const tarball = readdirSync(out).find((f) => f.endsWith(".tgz"));
if (!tarball) fail("pnpm pack wrote no tarball");
const sha256 = createHash("sha256")
  .update(readFileSync(join(out, tarball)))
  .digest("hex");
writeFileSync(join(out, `${tarball}.sha256`), `${sha256}  ${tarball}\n`);

const notes = `${section}

---

**Tarball:** \`${tarball}\`
**SHA-256:** \`${sha256}\`

This release isn't published to npm: publishing is a manual step (see RELEASING.md).
`;
writeFileSync(join(out, "notes.md"), notes);

console.log(`release: ${pkg.name} ${version}${values.tag ? ` for ${values.tag}` : " (a dry run)"}`);
console.log(`release: ${join(values.out, tarball)}, sha256 ${sha256}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntarball=${join(values.out, tarball)}\nprerelease=${version.includes("-")}\n`,
  );
}
