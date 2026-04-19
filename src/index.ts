import * as core from "@actions/core";
import * as github from "@actions/github";
import { checkMembership } from "./membership";
import { createLinearIssue } from "./linear";
import { postSlackNotification } from "./slack";
import { postGitHubComment } from "./github-comment";
import { resolveMembershipToken } from "./auth";
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
    autoReplyEnabled: core.getInput("auto-reply-enabled") !== "false",
    githubAppId: core.getInput("github-app-id") || undefined,
    githubAppPrivateKey: core.getInput("github-app-private-key") || undefined,
  };
}

function parseEvent(): ContributionEvent {
  const context = github.context;
  const action = (context.payload.action || "opened") as "opened" | "assigned" | "closed";
  const sender = (context.payload.sender as { login: string } | undefined)?.login;

  if (context.eventName === "pull_request_target" || context.eventName === "pull_request") {
    const pr = context.payload.pull_request!;
    return {
      type: "pull_request",
      action,
      title: pr.title as string,
      body: (pr.body as string) || "",
      url: pr.html_url as string,
      number: pr.number as number,
      author: (pr.user as { login: string }).login,
      assignee: context.payload.assignee?.login as string | undefined,
      closedBy: action === "closed" ? sender : undefined,
      repo: context.repo.repo,
      repoFullName: `${context.repo.owner}/${context.repo.repo}`,
      labels: ((pr.labels || []) as Array<{ name: string }>).map((l) => l.name),
    };
  }

  if (context.eventName === "issues") {
    const issue = context.payload.issue!;
    return {
      type: "issue",
      action,
      title: issue.title as string,
      body: (issue.body as string) || "",
      url: issue.html_url as string,
      number: issue.number as number,
      author: (issue.user as { login: string }).login,
      assignee: context.payload.assignee?.login as string | undefined,
      closedBy: action === "closed" ? sender : undefined,
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

    core.info(`Processing ${event.type} #${event.number} (${event.action}) by ${event.author} on ${event.repoFullName}`);

    // Step 1: Check org membership (prefer GitHub App installation token; PAT deprecated)
    const orgToken = await resolveMembershipToken({
      githubAppId: inputs.githubAppId,
      githubAppPrivateKey: inputs.githubAppPrivateKey,
      githubOrg: inputs.githubOrg,
    });

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

    core.info(`${event.author} is external (${membership.reason}) — processing ${event.action} event`);
    core.setOutput("is-external", "true");

    // Route by action: only "opened" triggers Linear + Slack
    if (event.action === "opened") {
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
    }

    // Step 4: Post GitHub auto-reply comment (all actions)
    if (inputs.autoReplyEnabled) {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        await postGitHubComment(event, githubToken, inputs.dryRun);
      } else {
        core.info("GITHUB_TOKEN not set — skipping auto-reply comment");
      }
    }

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
