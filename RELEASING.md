# Releasing @actlet/viewer

A release is a tag. Pushing `v<version>` runs every check, packs the package and opens a **draft** GitHub release with
the tarball. Nothing is published to npm automatically: publishing is a manual step, done when the owner decides.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- `pnpm check`: build, typecheck, lint, test and Go parity.
- `pnpm check:examples`, in the runner's Chrome.
- `pnpm smoke`.

Node comes from `.nvmrc` and pnpm from `packageManager`, and the install uses the frozen lockfile.

**Go parity** needs the private `actlet/actlet` repository at the commit in `.actlet-commit`. Give CI read access with
one repository secret (Settings → Secrets and variables → Actions):

- `ACTLET_READ_TOKEN`: a fine-grained personal access token with read-only **Contents** on `actlet/actlet`, or
- `ACTLET_DEPLOY_KEY`: the private half of an SSH key added to `actlet/actlet` as a read-only deploy key.

With either, CI checks Actlet out next to this repository, builds `actlet-cli` and requires parity
(`REQUIRE_PARITY=1`). Without them, the rest still runs, and the run shows a "Go parity skipped" warning and a note in
its summary. Pull requests from forks get no secrets, so parity is skipped there.

## Cutting a release

1. **Version and changelog.** Set the version without tagging, with `pnpm version 0.2.0 --no-git-tag-version`. In
   `CHANGELOG.md`, give the version's section the release's date, as `## 0.2.0 - 2026-11-03`. The release workflow
   refuses a section that has no date.
2. **Check locally.** Run `REQUIRE_PARITY=1 pnpm check`, `pnpm check:examples` and `pnpm smoke`. Then try the release
   steps: `pnpm build && node scripts/release.mjs --tag v0.2.0` writes to `release/` what the workflow would attach.
3. **Commit, tag and push.** Commit as `chore(release): 0.2.0`. Tag with `git tag -a v0.2.0 -m 0.2.0`, then
   `git push origin main v0.2.0`.
4. **The workflow** (`.github/workflows/release.yml`) checks that the tag names `package.json`'s version. It runs every
   check that CI runs, then builds and packs. It creates a draft release named after the tag, with:
   - `actlet-viewer-<version>.tgz`;
   - its `.sha256`;
   - notes from the version's section of `CHANGELOG.md`.

   A version with a pre-release part, such as `0.2.0-rc.1`, makes a pre-release.

To try the workflow without releasing, run **Release** by hand (Actions → Release → Run workflow). It runs every step
except creating the release, and uploads what it would attach as the `release` artifact.

## Checking the draft

Download the tarball and its checksum from the draft release, then:

```sh
shasum -a 256 -c actlet-viewer-0.2.0.tgz.sha256
tar -tzf actlet-viewer-0.2.0.tgz          # dist/, themes/, README.md, package.json
```

To try it in an app, install the tarball (`pnpm add ./actlet-viewer-0.2.0.tgz`), as `pnpm smoke` does.

## Publishing to npm, by hand

`package.json` has `"private": true`, and npm refuses to publish a private package. The tarball carries the
`package.json` of the tagged commit. So for the first published release, remove `"private": true` in the release commit
(step 3), before tagging.

Then, logged in to npm as a member of the `@actlet` scope (`npm login`, with two-factor authentication):

```sh
npm publish ./actlet-viewer-0.2.0.tgz --access restricted   # private to the @actlet organisation on npm
npm publish ./actlet-viewer-0.2.0.tgz --access public       # or public
```

Publish the very tarball from the draft release, after checking its checksum, so what's on npm is what CI checked.
Then publish the draft release on GitHub.

**Provenance** (`npm publish --provenance`) links a package to the workflow run that built it. npm only accepts it from
a supported CI with an OIDC token, not from a laptop. To have it, publishing would move into a workflow with
`id-token: write` and an npm token or trusted publishing. That's a later choice; until then, the SHA-256 on the draft
release ties the published tarball to the run that checked it.

## After a release

Add a section for the next version at the top of `CHANGELOG.md`, as `## 0.3.0 - unreleased`, and note changes there as
they land.
