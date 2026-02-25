import { LinearClient } from "@linear/sdk";
import * as core from "@actions/core";
import { ContributionEvent, LinearIssueResult } from "./types";

const MAX_BODY_LENGTH = 10000;

function buildDescription(event: ContributionEvent): string {
  const truncatedBody =
    event.body.length > MAX_BODY_LENGTH
      ? event.body.substring(0, MAX_BODY_LENGTH) + "\n\n...(truncated)"
      : event.body;

  return `## External Contribution

**Type:** ${event.type === "pull_request" ? "Pull Request" : "Issue"}
**Repo:** ${event.repoFullName}
**Author:** @${event.author}
**GitHub Link:** ${event.url}

---

${truncatedBody}

---
*Auto-created by external-contrib-action*`;
}

function buildTitle(event: ContributionEvent): string {
  const typeLabel = event.type === "pull_request" ? "PR" : "Issue";
  return `[External ${typeLabel}] ${event.title}`;
}

async function findDuplicate(
  client: LinearClient,
  githubUrl: string
): Promise<{ id: string; url: string } | null> {
  const results = await client.issues({
    filter: {
      description: { contains: githubUrl },
    },
  });

  if (results.nodes.length > 0) {
    return {
      id: results.nodes[0].id,
      url: results.nodes[0].url,
    };
  }

  return null;
}

async function ensureLabel(
  client: LinearClient,
  teamId: string,
  labelName: string
): Promise<string> {
  const existingLabels = await client.issueLabels({
    filter: { name: { eq: labelName }, team: { id: { eq: teamId } } },
  });

  if (existingLabels.nodes.length > 0) {
    return existingLabels.nodes[0].id;
  }

  const created = await client.createIssueLabel({
    name: labelName,
    teamId,
  });

  if (!created.success) {
    throw new Error(`Failed to create label: ${labelName}`);
  }

  const label = await created.issueLabel;
  if (!label) {
    throw new Error(`Label creation returned no label: ${labelName}`);
  }

  return label.id;
}

export async function createLinearIssue(
  event: ContributionEvent,
  teamId: string,
  projectId: string | undefined,
  assigneeId: string | undefined,
  apiKey: string,
  dryRun: boolean
): Promise<LinearIssueResult> {
  if (dryRun) {
    core.info(`[DRY RUN] Would create Linear issue: ${buildTitle(event)}`);
    core.info(`[DRY RUN] Team: ${teamId}, Project: ${projectId || "none"}`);
    return { created: false, skippedReason: "dry_run" };
  }

  const client = new LinearClient({ apiKey });

  // Check for duplicates
  const duplicate = await findDuplicate(client, event.url);
  if (duplicate) {
    core.info(`Duplicate found: ${duplicate.url} — skipping creation`);
    return {
      created: false,
      issueId: duplicate.id,
      issueUrl: duplicate.url,
      skippedReason: "duplicate",
    };
  }

  // Ensure external-contribution label exists
  const labelIds: string[] = [];
  const externalLabelId = await ensureLabel(client, teamId, "external-contribution");
  labelIds.push(externalLabelId);

  // Copy GitHub labels
  for (const ghLabel of event.labels) {
    try {
      const labelId = await ensureLabel(client, teamId, ghLabel);
      labelIds.push(labelId);
    } catch (err) {
      core.warning(`Failed to create/find label "${ghLabel}": ${err}`);
    }
  }

  // Create the issue
  const issuePayload = {
    teamId,
    title: buildTitle(event),
    description: buildDescription(event),
    labelIds,
    ...(projectId ? { projectId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
  };

  const result = await client.createIssue(issuePayload);

  if (!result.success) {
    throw new Error("Failed to create Linear issue");
  }

  const issue = await result.issue;
  if (!issue) {
    throw new Error("Issue creation returned no issue");
  }

  core.info(`Created Linear issue: ${issue.identifier} — ${issue.url}`);

  return {
    created: true,
    issueId: issue.id,
    issueUrl: issue.url,
    issueIdentifier: issue.identifier,
  };
}
