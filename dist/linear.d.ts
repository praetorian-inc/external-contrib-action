import { ContributionEvent, LinearIssueResult } from "./types";
export declare function createLinearIssue(event: ContributionEvent, teamId: string, projectId: string | undefined, assigneeId: string | undefined, parentIssueId: string | undefined, stateName: string, apiKey: string, dryRun: boolean): Promise<LinearIssueResult>;
