# Releasing

This plugin is published through three channels. The DSH plugin market installs directly
from this GitHub repository, so a release does **not** depend on npm.

## 1. Push the code

```sh
node scripts/build.mjs --check
node scripts/verify.mjs
node scripts/build.mjs
git add -A
git commit -m "feat: ..."
git push origin main
```

`client.js` is generated from `src/*.js` and committed, because the DSH Client loads the
single-file bundle straight from the package directory.

## 2. Tag a release

```sh
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <notes>
```

Update [`CHANGELOG.md`](../CHANGELOG.md) before tagging.

## 3. Publish to the DSH plugin market

The market index is the [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
catalog: one YAML file per plugin under `data/plugins/<owner>__<repo>.yml`. A GitHub source
repository is enough — npm publishing is optional.

```sh
node scripts/submit-market.mjs            # add the catalog entry on a fork branch + open the PR
node scripts/submit-market.mjs --dry-run  # print the entry without touching GitHub
```

The script is idempotent:

- it exits `2` while the GitHub repository is younger than one day (the catalog's CI gate)
  and prints the earliest retry time;
- it exits `0` when the entry is already upstream or the PR is already open;
- otherwise it syncs the personal fork, pushes a branch and opens the PR.

A scheduled reminder can call this script daily until the entry is merged — re-running is
safe.

## 4. Publish to npm (optional)

`npm view dsh-pixel-office` is free, but publishing needs a logged-in npm account:

```sh
npm login
npm publish --access public
```

After the first npm publication, the market card can show download counts, and users may
install with:

```sh
dsh plugin --profile desktop add dsh-pixel-office
```

The first publish of a brand-new name may show a `0.0.0-stage` placeholder for a moment:
npm publishes through its staged-publishing queue, and the `latest` dist-tag flips to the
real version once the publish settles (`npm view <name> dist-tags`). npm CLI 11.15+ exposes
`npm stage list / approve / reject` if a human approval queue is ever required.

Keep `package.json` `repository` pointing at this repository so the catalog can link the two.
