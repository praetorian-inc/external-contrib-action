import { WebClient } from "@slack/web-api";
import * as core from "@actions/core";
import { ContributionEvent, LinearIssueResult } from "./types";

const MAX_DESCRIPTION_PREVIEW = 300;

function buildBlocks(
  event: ContributionEvent,
  linearResult?: LinearIssueResult
): Record<string, unknown>[] {
  const typeLabel = event.type === "pull_request" ? "Pull Request" : "Issue";
  const descriptionPreview =
    event.body.length > MAX_DESCRIPTION_PREVIEW
      ? event.body.substring(0, MAX_DESCRIPTION_PREVIEW) + "..."
      : event.body;

  const labelsText =
    event.labels.length > 0 ? event.labels.join(", ") : "none";

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `External ${typeLabel} on ${event.repo}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${event.title}*`,
      },
      fields: [
        { type: "mrkdwn", text: `*Author:* ${event.author}` },
        { type: "mrkdwn", text: `*Repo:* ${event.repoFullName}` },
        { type: "mrkdwn", text: `*Type:* ${typeLabel}` },
        { type: "mrkdwn", text: `*Labels:* ${labelsText}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: descriptionPreview,
      },
    },
  ];

  // Action buttons
  const buttons: Record<string, unknown>[] = [
    {
      type: "button",
      text: { type: "plain_text", text: "View on GitHub" },
      url: event.url,
      style: "primary",
    },
  ];

  if (linearResult?.created && linearResult.issueUrl) {
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: "View Linear Issue" },
      url: linearResult.issueUrl,
    });
  }

  blocks.push({
    type: "actions",
    elements: buttons,
  });

  return blocks;
}

export async function postSlackNotification(
  event: ContributionEvent,
  channelId: string,
  linearResult: LinearIssueResult | undefined,
  token: string,
  dryRun: boolean
): Promise<void> {
  const blocks = buildBlocks(event, linearResult);

  if (dryRun) {
    core.info(`[DRY RUN] Would post to Slack channel ${channelId}:`);
    core.info(JSON.stringify(blocks, null, 2));
    return;
  }

  const client = new WebClient(token);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.chat.postMessage({
      channel: channelId,
      blocks: blocks as any,
      text: `External ${event.type === "pull_request" ? "PR" : "Issue"} on ${event.repo}: ${event.title} by ${event.author}`,
    } as any);

    core.info(`Posted Slack notification to channel ${channelId}`);
  } catch (error: unknown) {
    const err = error as { data?: { error?: string }; message?: string };
    const slackError = err.data?.error || err.message || "unknown error";

    if (slackError === "channel_not_found" || slackError === "not_in_channel") {
      throw new Error(
        `Slack error: ${slackError}. Ensure the bot is invited to channel ${channelId} (/invite @bot-name).`
      );
    }

    throw new Error(`Slack error: ${slackError}`);
  }
}
