export interface ActionInputs {
    linearTeamId: string;
    linearProjectId?: string;
    linearAssigneeId?: string;
    linearParentIssueId?: string;
    linearStateName: string;
    slackChannelId: string;
    githubOrg: string;
    dryRun: boolean;
    autoReplyEnabled: boolean;
}
export interface ContributionEvent {
    type: "pull_request" | "issue";
    action: "opened" | "assigned" | "closed";
    title: string;
    body: string;
    url: string;
    number: number;
    author: string;
    assignee?: string;
    closedBy?: string;
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
