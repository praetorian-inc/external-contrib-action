import * as core from "@actions/core";
import * as github from "@actions/github";
import { createAppAuth } from "@octokit/auth-app";

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
export async function resolveMembershipToken(opts: AuthOptions): Promise<string> {
  if (opts.githubAppId && opts.githubAppPrivateKey) {
    return await mintAppInstallationToken(
      opts.githubAppId,
      opts.githubAppPrivateKey,
      opts.githubOrg
    );
  }

  const pat = process.env.ORG_MEMBER_CHECK_PAT;
  if (pat) {
    core.warning(
      "ORG_MEMBER_CHECK_PAT is deprecated. Migrate to GitHub App auth via the " +
        "`github-app-id` and `github-app-private-key` inputs. See ENG-3100 for details."
    );
    return pat;
  }

  throw new Error(
    "Missing org-membership credentials: provide `github-app-id` + `github-app-private-key` inputs " +
      "(preferred), or set the ORG_MEMBER_CHECK_PAT env var. See ENG-3100 for the App-auth migration."
  );
}

async function mintAppInstallationToken(
  appId: string,
  privateKey: string,
  org: string
): Promise<string> {
  const auth = createAppAuth({ appId, privateKey });

  const appAuth = await auth({ type: "app" });
  const appOctokit = github.getOctokit(appAuth.token);
  const { data: installation } = await appOctokit.rest.apps.getOrgInstallation({ org });

  const installationAuth = await auth({
    type: "installation",
    installationId: installation.id,
  });

  return installationAuth.token;
}
