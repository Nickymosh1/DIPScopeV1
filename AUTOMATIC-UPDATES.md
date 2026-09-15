# Automatic Elexon updates for DIPScope

This adds a weekly source check to Nickymosh1/DIPScopeV1. It prepares a GitHub pull request when sources change. You review and merge that request to update the site.

## Install once

1. Extract DIPScope-update-automation.zip.
2. Open https://github.com/Nickymosh1/DIPScopeV1 on the main branch. Choose Add file > Upload files.
3. Upload the CONTENTS of the extracted folder: .github, scripts, sources, js and this guide. Keep these paths at the repository root, beside index.html. Merge the folders with existing folders; do not remove your existing files. Commit the upload to main.
4. Check that .github/workflows/check-elexon.yml exists in GitHub. If your browser skipped the .github folder, choose Add file > Create new file, enter that full path, and paste the contents of the supplied check-elexon.yml file.
5. Open Settings > Actions > General. Enable Actions if necessary. Under Workflow permissions, tick "Allow GitHub Actions to create and approve pull requests", then Save. The workflow requests the required write permissions itself; no personal access token or Elexon API key is needed.
6. Open Actions > Check Elexon data > Run workflow. Select main, then Run workflow.
7. Open the completed run. A green result with "No source changes" means setup worked. If data changed, open Pull requests and review "Review Elexon reference data changes".

The upload does not replace interfaceData.json. It adds the updater and source baseline, plus a small technicalSchema.js label fix so future releases are not labelled 2.2.1.

## Everyday use

The check is scheduled for Monday at 07:17 UTC (08:17 British Summer Time). GitHub may delay scheduled jobs. You can run it manually at any time.

When a pull request appears, read its source/version summary and Files changed. Check that the release is appropriate for your use, then merge it. With Pages configured to publish main / root, your normal Pages build publishes the merged data. The updater does not enable automatic merging.

One automation branch, codex/elexon-data-update, is reused. Avoid editing that branch by hand. New checks refresh the pending proposal. If you decide to defer a release, leave its request unmerged; closing it does not permanently ignore that source change.

Actions shows the latest successful check, including runs with no changes. The website data timestamp changes only when a new specification is imported. Enable GitHub Actions failure notifications in your account if you want failed checks emailed.

GitHub can disable scheduled workflows in public repositories after 60 days without repository activity. If checks stop, open Actions, re-enable the workflow and run it manually.

## What is updated

- Published IF/PUB technical schemas, event variants, required flags and field constraints.
- Technical definitions/context attached to existing data items.
- Generated message examples, rebuilt against the new specification.
- Pinned source JSON, reconciliation report and a schema change summary.

It checks the published Elexon DIP documentation portal, discovers the highest advertised stable specification, and compares the actual file contents, including edits under the same version number.

It also watches the root unresolved YAML files in elexon-data/dip-api-documentation. Those changes open a review signal; raw GitHub YAML is not treated as a released replacement for the portal specification.

Business descriptions, business routing, rejection guidance, manually maintained catalogue material and operational release dates are not automatically refreshed. New or removed interfaces stop the import for a human review. A higher published version does not by itself mean it is active in production.

If sources are unavailable or their structure changes, the workflow fails and leaves the current website data in place. Conversion is staged and checked before any candidate data is copied. A successful run still requires your merge before publishing.

## Verification and maintenance

The package was tested against the current public repository catalogue and the live Elexon source on 15 September 2026. The live check found no new specification changes. Local regression checks cover complete schema reconciliation, preservation of business content, unchanged sources, same-version edits, GitHub-only changes, invalid references, added interfaces and downgrades.

The GitHub-hosted run and repository permissions can only be verified after installation.

To test locally with Node.js 24:
    node scripts/elexon/test.mjs

To check sources and prepare local changes:
    node scripts/elexon/update.mjs

Run these from a working copy of the full site, not this standalone upload package. No npm install is needed. Review the resulting git diff before committing.

Actions dependencies are pinned to exact commits. Review their versions periodically. To disable scheduled checks, disable "Check Elexon data" on the Actions page.

Official references:
- Elexon specification portal: https://dip-api-documentation.elexon.co.uk/
- Elexon source repository: https://github.com/elexon-data/dip-api-documentation
- GitHub workflow settings: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- GitHub scheduled events: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
