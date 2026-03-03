import * as core from "@actions/core";
import * as github from "@actions/github";
import { ContributionEvent } from "./types";

// Signature phrases used for dedup detection
const SIGNATURES: Record<string, string> = {
  opened: "thanks for taking the time",
  assigned: "looking into this",
  closed: "should now be resolved",
};

export function buildComment(
  event: ContributionEvent,
  assigneeDisplayName?: string
): string {
  const typeLabel = event.type === "pull_request" ? "PR" : "issue";

  switch (event.action) {
    case "opened":
      return (
        `Hey @${event.author}, thanks for taking the time to submit this ${typeLabel}! ` +
        `Our team has been notified and someone will be picking this up shortly.`
      );

    case "assigned": {
      const name = assigneeDisplayName || event.assignee || "a team member";
      return (
        `Hey @${event.author}, I'm ${name} and I'll be looking into this. ` +
        `Hang tight and I'll follow up once I have an update.`
      );
    }

    case "closed":
      return (
        `Hey @${event.author}, this should now be resolved. ` +
        `If everything looks good on your end, no action needed. ` +
        `If you're still seeing issues, feel free to reopen and we'll take another look. ` +
        `Thanks for helping us improve!`
      );
  }
}

async function getDisplayName(
  octokit: ReturnType<typeof github.getOctokit>,
  username: string
): Promise<string | undefined> {
  try {
    const { data } = await octokit.rest.users.getByUsername({ username });
    return data.name || undefined;
  } catch {
    core.warning(`Failed to look up display name for ${username}`);
    return undefined;
  }
}

async function isDuplicate(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  issueNumber: number,
  action: string
): Promise<boolean> {
  const signature = SIGNATURES[action];
  if (!signature) return false;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return comments.some(
      (c: { body?: string }) => c.body && c.body.includes(signature)
    );
  } catch {
    core.warning("Failed to check for duplicate comments — proceeding with post");
    return false;
  }
}

export async function postGitHubComment(
  event: ContributionEvent,
  token: string,
  dryRun: boolean
): Promise<void> {
  const octokit = github.getOctokit(token);
  const [owner, repo] = event.repoFullName.split("/");

  // Look up assignee display name for assigned events
  let displayName: string | undefined;
  if (event.action === "assigned" && event.assignee) {
    displayName = await getDisplayName(octokit, event.assignee);
  }

  const body = buildComment(event, displayName);

  if (dryRun) {
    core.info(`[DRY RUN] Would post comment on ${event.repoFullName}#${event.number}:`);
    core.info(`[DRY RUN] ${body}`);
    return;
  }

  // Check for duplicate before posting
  const duplicate = await isDuplicate(octokit, owner, repo, event.number, event.action);
  if (duplicate) {
    core.info(`Duplicate ${event.action} comment already exists on #${event.number} — skipping`);
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: event.number,
    body,
  });

  core.info(`Posted ${event.action} comment on ${event.repoFullName}#${event.number}`);
}
