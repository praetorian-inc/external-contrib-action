# external-contrib-action

GitHub Action to detect external contributions (PRs and Issues) on praetorian-inc open-source repos. Automatically creates Linear issues and posts Slack notifications.

## Usage

Add to any open-source repo as `.github/workflows/external-contribution.yml`:

```yaml
name: External Contribution Notify

on:
  issues:
    types: [opened]
  pull_request_target:
    types: [opened]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: praetorian-inc/external-contrib-action@v1
        with:
          linear-team-id: "YOUR_TEAM_ID"
          slack-channel-id: "YOUR_CHANNEL_ID"
        env:
          ORG_MEMBER_CHECK_PAT: ${{ secrets.ORG_MEMBER_CHECK_PAT }}
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `linear-team-id` | Yes | — | Linear team ID for issue creation |
| `linear-project-id` | No | — | Linear project ID (optional) |
| `slack-channel-id` | Yes | — | Slack channel ID to post notification |
| `github-org` | No | `praetorian-inc` | GitHub org to check membership against |
| `dry-run` | No | `false` | Log payloads instead of sending |

## Outputs

| Output | Description |
|---|---|
| `is-external` | Whether the contributor is external (true/false) |
| `linear-issue-url` | URL of the created Linear issue (if created) |
| `linear-issue-id` | Identifier of the created Linear issue (if created) |
