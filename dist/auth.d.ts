export interface AuthOptions {
    githubAppId?: string;
    githubAppPrivateKey?: string;
    githubOrg: string;
}
/**
 * Resolves the token used to call `orgs.checkMembershipForUser`.
 *
 * Precedence:
 *   1. GitHub App credentials (github-app-id + github-app-private-key) → short-lived installation token
 *   2. ORG_MEMBER_CHECK_PAT env var (deprecated) → logs a warning, still returned for backward compat
 *   3. Throws with migration guidance
 */
export declare function resolveMembershipToken(opts: AuthOptions): Promise<string>;
