import * as github from "@actions/github";
import { MembershipResult } from "./types";

const BOT_SUFFIX = "[bot]";

export async function checkMembership(
  username: string,
  org: string,
  token: string
): Promise<MembershipResult> {
  // Skip bot accounts
  if (username.endsWith(BOT_SUFFIX)) {
    return { isMember: false, reason: "bot" };
  }

  const octokit = github.getOctokit(token);

  try {
    await octokit.rest.orgs.checkMembershipForUser({
      org,
      username,
    });

    // If the call succeeds (204), user is a member
    return { isMember: true, reason: "member" };
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };

    if (err.status === 404) {
      return { isMember: false, reason: "not_member" };
    }

    if (err.status === 302) {
      // 302 means the requester is not an org member themselves
      // This indicates the PAT is not properly SAML-authorized
      return { isMember: false, reason: "error" };
    }

    // Unexpected error — log and treat as error
    throw new Error(
      `Failed to check org membership for ${username}: ${err.message || "unknown error"}`
    );
  }
}
