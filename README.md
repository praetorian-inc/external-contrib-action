# external-contrib-action

GitHub Action to detect external contributions (PRs and Issues) on praetorian-inc open-source repos. Automatically creates Linear issues and posts Slack notifications.

## Usage

**Preferred**: call via the centralized `praetorian-inc/public-workflows/.github/workflows/external-contrib-notify.yml` reusable workflow. Direct usage is documented below for reference.

Add to any open-source repo as `.github/workflows/external-contribution.yml`:

```yaml
name: External Contribution Notify

on:
  issues:
    types: [opened, assigned, closed]
  pull_request_target:
    types: [opened, assigned, closed]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: praetorian-inc/external-contrib-action@v3
        with:
          linear-team-id: "YOUR_TEAM_ID"
          slack-channel-id: "YOUR_CHANNEL_ID"
          github-app-id: ${{ secrets.EXTERNAL_CONTRIB_APP_ID }}
          github-app-private-key: ${{ secrets.EXTERNAL_CONTRIB_APP_PRIVATE_KEY }}
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## Authentication

Checking whether a PR/issue author is a praetorian-inc org member requires a token with `read:org` (or equivalent) scope. Two modes:

1. **GitHub App (preferred, v3+)** — pass `github-app-id` + `github-app-private-key` inputs. Action mints a short-lived (~1 hour) installation token via `@octokit/auth-app`. The App needs only `Organization > Members: Read` permission. Org-owned, per-installation scoped, rotation is an admin operation (not tied to any individual).
2. **PAT (deprecated)** — set `ORG_MEMBER_CHECK_PAT` env var to a user PAT with `read:org` scope. Still supported for backward compat; logs a deprecation warning on every run. Scheduled for removal in the next major release.

If both are provided, App credentials win.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `linear-team-id` | Yes | — | Linear team ID for issue creation |
| `linear-project-id` | No | — | Linear project ID (optional) |
| `linear-assignee-id` | No | — | Linear user ID to assign created issues |
| `linear-parent-issue-id` | No | — | Created issues become sub-issues of this parent |
| `linear-state-name` | No | `Backlog` | Linear state name for created issues |
| `slack-channel-id` | Yes | — | Slack channel ID to post notification |
| `github-org` | No | `praetorian-inc` | GitHub org to check membership against |
| `dry-run` | No | `false` | Log payloads instead of sending |
| `auto-reply-enabled` | No | `true` | Post auto-reply GitHub comment on external contributions |
| `github-app-id` | No | — | GitHub App ID for App-token membership checks (preferred). Pair with `github-app-private-key`. |
| `github-app-private-key` | No | — | PEM private key paired with `github-app-id`. |

## Outputs

| Output | Description |
|---|---|
| `is-external` | Whether the contributor is external (true/false) |
| `linear-issue-url` | URL of the created Linear issue (if created) |
| `linear-issue-id` | Identifier of the created Linear issue (if created) |

## Related

- ENG-3100 — centralization + App-auth migration tracking ticket
- `praetorian-inc/public-workflows` — reusable workflow that wraps this action
