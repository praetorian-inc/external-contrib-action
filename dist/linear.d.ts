import { ContributionEvent, LinearIssueResult } from "./types";
export declare function createLinearIssue(event: ContributionEvent, teamId: string, projectId: string | undefined, apiKey: string, dryRun: boolean): Promise<LinearIssueResult>;
