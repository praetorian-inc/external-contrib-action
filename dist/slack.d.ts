import { ContributionEvent, LinearIssueResult } from "./types";
export declare function postSlackNotification(event: ContributionEvent, channelId: string, linearResult: LinearIssueResult | undefined, token: string, dryRun: boolean): Promise<void>;
