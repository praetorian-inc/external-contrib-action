export interface ActionInputs {
  linearTeamId: string;
  linearProjectId?: string;
  linearAssigneeId?: string;
  slackChannelId: string;
  githubOrg: string;
  dryRun: boolean;
}

export interface ContributionEvent {
  type: "pull_request" | "issue";
  title: string;
  body: string;
  url: string;
  number: number;
  author: string;
  repo: string;
  repoFullName: string;
  labels: string[];
}

export interface MembershipResult {
  isMember: boolean;
  reason: "member" | "not_member" | "bot" | "error";
}

export interface LinearIssueResult {
  created: boolean;
  issueId?: string;
  issueUrl?: string;
  issueIdentifier?: string;
  skippedReason?: "duplicate" | "dry_run";
}
