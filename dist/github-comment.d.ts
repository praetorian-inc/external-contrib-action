import { ContributionEvent } from "./types";
export declare function buildComment(event: ContributionEvent, assigneeDisplayName?: string): string;
export declare function postGitHubComment(event: ContributionEvent, token: string, dryRun: boolean): Promise<void>;
