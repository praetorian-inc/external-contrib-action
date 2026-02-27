import * as core from "@actions/core";
import * as github from "@actions/github";
import { checkMembership } from "./membership";
import { createLinearIssue } from "./linear";
import { postSlackNotification } from "./slack";
import { ActionInputs, ContributionEvent } from "./types";

function parseInputs(): ActionInputs {
  return {
    linearTeamId: core.getInput("linear-team-id", { required: true }),
    linearProjectId: core.getInput("linear-project-id") || undefined,
    linearAssigneeId: core.getInput("linear-assignee-id") || undefined,
    linearParentIssueId: core.getInput("linear-parent-issue-id") || undefined,
    linearStateName: core.getInput("linear-state-name") || "Backlog",
    slackChannelId: core.getInput("slack-channel-id", { required: true }),
    githubOrg: core.getInput("github-org") || "praetorian-inc",
    dryRun: core.getBooleanInput("dry-run"),
  };
}

function parseEvent(): ContributionEvent {
  const context = github.context;

  if (context.eventName === "pull_request_target" || context.eventName === "pull_request") {
    const pr = context.payload.pull_request!;
    return {
      type: "pull_request",
      title: pr.title as string,
      body: (pr.body as string) || "",
      url: pr.html_url as string,
      number: pr.number as number,
      author: (pr.user as { login: string }).login,
      repo: context.repo.repo,
      repoFullName: `${context.repo.owner}/${context.repo.repo}`,
      labels: ((pr.labels || []) as Array<{ name: string }>).map((l) => l.name),
    };
  }

  if (context.eventName === "issues") {
    const issue = context.payload.issue!;
    return {
      type: "issue",
      title: issue.title as string,
      body: (issue.body as string) || "",
      url: issue.html_url as string,
      number: issue.number as number,
      author: (issue.user as { login: string }).login,
      repo: context.repo.repo,
      repoFullName: `${context.repo.owner}/${context.repo.repo}`,
      labels: ((issue.labels || []) as Array<{ name: string }>).map((l) => l.name),
    };
  }

  throw new Error(`Unsupported event: ${context.eventName}`);
}

export async function run(): Promise<void> {
  try {
    const inputs = parseInputs();
    const event = parseEvent();

    core.info(`Processing ${event.type} #${event.number} by ${event.author} on ${event.repoFullName}`);

    // Step 1: Check org membership
    const orgToken = process.env.ORG_MEMBER_CHECK_PAT;
    if (!orgToken) {
      throw new Error("ORG_MEMBER_CHECK_PAT environment variable is required");
    }

    const membership = await checkMembership(event.author, inputs.githubOrg, orgToken);

    if (membership.isMember) {
      core.info(`${event.author} is an org member (${membership.reason}) — skipping notification`);
      core.setOutput("is-external", "false");
      return;
    }

    if (membership.reason === "bot") {
      core.info(`${event.author} is a bot — skipping notification`);
      core.setOutput("is-external", "false");
      return;
    }

    core.info(`${event.author} is external (${membership.reason}) — creating notifications`);
    core.setOutput("is-external", "true");

    // Step 2: Create Linear issue
    const linearApiKey = process.env.LINEAR_API_KEY;
    if (!linearApiKey) {
      throw new Error("LINEAR_API_KEY environment variable is required");
    }

    const linearResult = await createLinearIssue(
      event,
      inputs.linearTeamId,
      inputs.linearProjectId,
      inputs.linearAssigneeId,
      inputs.linearParentIssueId,
      inputs.linearStateName,
      linearApiKey,
      inputs.dryRun
    );

    if (linearResult.issueUrl) {
      core.setOutput("linear-issue-url", linearResult.issueUrl);
    }
    if (linearResult.issueIdentifier) {
      core.setOutput("linear-issue-id", linearResult.issueIdentifier);
    }

    // Step 3: Post Slack notification
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      throw new Error("SLACK_BOT_TOKEN environment variable is required");
    }

    await postSlackNotification(
      event,
      inputs.slackChannelId,
      linearResult,
      slackToken,
      inputs.dryRun
    );

    core.info("External contribution notification complete");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

// Auto-run when called as action
run();
