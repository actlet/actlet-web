import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The release workflow's steps, run here: scripts/release.mjs packs the
// built package and takes the notes from the changelog. It needs dist/,
// which pnpm check builds first.
const root = resolve(process.cwd());
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version as string;
const work = mkdtempSync(join(tmpdir(), "actlet-release-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function release(...args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync("node", ["scripts/release.mjs", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout: string; stderr: string };
    return { ok: false, out: err.stdout + err.stderr };
  }
}

describe.skipIf(!existsSync(join(root, "dist", "index.js")))("releasing", () => {
  it("refuses a tag that doesn't name the version, or an undated section", () => {
    expect(release("--tag", "v9.9.9", "--out", join(work, "a"))).toMatchObject({
      ok: false,
      out: expect.stringContaining(`doesn't name package.json's version, ${version}`),
    });
    const undated = join(work, "undated.md");
    writeFileSync(undated, `# Changelog\n\n## ${version} - unreleased\n\n- Something.\n`);
    expect(release("--tag", `v${version}`, "--changelog", undated, "--out", join(work, "b"))).toMatchObject({
      ok: false,
      out: expect.stringContaining("has no date"),
    });
    expect(release("--changelog", join(work, "missing.md"), "--out", join(work, "c")).ok).toBe(false);
  });

  it("packs the tarball with its SHA-256 and the version's notes", () => {
    const changelog = join(work, "dated.md");
    writeFileSync(
      changelog,
      `# Changelog\n\n## 9.0.0 - 2030-01-01\n\n- Later.\n\n## ${version} - 2026-10-22\n\nThe first version.\n\n- Something.\n\n## 0.0.1 - 2026-01-01\n\n- Earlier.\n`,
    );
    const out = join(work, "d");
    const r = release("--tag", `v${version}`, "--changelog", changelog, "--out", out);
    expect(r.ok, r.out).toBe(true);
    const files = readdirSync(out).sort();
    const tarball = `actlet-viewer-${version}.tgz`;
    expect(files).toEqual([tarball, `${tarball}.sha256`, "notes.md"]);
    const sha = createHash("sha256")
      .update(readFileSync(join(out, tarball)))
      .digest("hex");
    expect(readFileSync(join(out, `${tarball}.sha256`), "utf8")).toBe(`${sha}  ${tarball}\n`);
    const notes = readFileSync(join(out, "notes.md"), "utf8");
    expect(notes).toMatch(/^The first version\.\n\n- Something\.\n\n---\n/);
    expect(notes).not.toContain("Later.");
    expect(notes).not.toContain("Earlier.");
    expect(notes).toContain(`**SHA-256:** \`${sha}\``);
  });

  it("dry-runs the repository's own changelog", () => {
    const r = release("--out", join(work, "e"));
    expect(r.ok, r.out).toBe(true);
    expect(r.out).toContain("(a dry run)");
  });
});
