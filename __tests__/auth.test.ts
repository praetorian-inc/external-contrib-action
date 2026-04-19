import { resolveMembershipToken } from "../src/auth";

const mockAuth = jest.fn();
jest.mock("@octokit/auth-app", () => ({
  createAppAuth: jest.fn(() => mockAuth),
}));

const mockGetOrgInstallation = jest.fn();
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(() => ({
    rest: { apps: { getOrgInstallation: mockGetOrgInstallation } },
  })),
}));

const mockWarning = jest.fn();
jest.mock("@actions/core", () => ({
  warning: (...args: unknown[]) => mockWarning(...args),
}));

describe("resolveMembershipToken", () => {
  const org = "praetorian-inc";
  const originalPat = process.env.ORG_MEMBER_CHECK_PAT;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ORG_MEMBER_CHECK_PAT;
  });

  afterAll(() => {
    if (originalPat !== undefined) {
      process.env.ORG_MEMBER_CHECK_PAT = originalPat;
    }
  });

  it("mints an installation token when App credentials are provided", async () => {
    mockAuth
      .mockResolvedValueOnce({ token: "app-jwt" })
      .mockResolvedValueOnce({ token: "ghs_installation_token" });
    mockGetOrgInstallation.mockResolvedValue({ data: { id: 12345 } });

    const token = await resolveMembershipToken({
      githubAppId: "111",
      githubAppPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      githubOrg: org,
    });

    expect(token).toBe("ghs_installation_token");
    expect(mockGetOrgInstallation).toHaveBeenCalledWith({ org });
    expect(mockAuth).toHaveBeenNthCalledWith(1, { type: "app" });
    expect(mockAuth).toHaveBeenNthCalledWith(2, {
      type: "installation",
      installationId: 12345,
    });
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it("falls back to ORG_MEMBER_CHECK_PAT with a deprecation warning when App creds missing", async () => {
    process.env.ORG_MEMBER_CHECK_PAT = "ghp_legacy_pat";

    const token = await resolveMembershipToken({ githubOrg: org });

    expect(token).toBe("ghp_legacy_pat");
    expect(mockWarning).toHaveBeenCalledTimes(1);
    expect(mockWarning.mock.calls[0][0]).toMatch(/deprecated/i);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("prefers App credentials over ORG_MEMBER_CHECK_PAT when both are set", async () => {
    process.env.ORG_MEMBER_CHECK_PAT = "ghp_should_not_be_used";
    mockAuth
      .mockResolvedValueOnce({ token: "app-jwt" })
      .mockResolvedValueOnce({ token: "ghs_preferred" });
    mockGetOrgInstallation.mockResolvedValue({ data: { id: 42 } });

    const token = await resolveMembershipToken({
      githubAppId: "111",
      githubAppPrivateKey: "key",
      githubOrg: org,
    });

    expect(token).toBe("ghs_preferred");
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it("treats partial App credentials as missing (both inputs required)", async () => {
    process.env.ORG_MEMBER_CHECK_PAT = "ghp_fallback";

    const token = await resolveMembershipToken({
      githubAppId: "111",
      githubOrg: org,
    });

    expect(token).toBe("ghp_fallback");
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when neither App creds nor PAT are available", async () => {
    await expect(resolveMembershipToken({ githubOrg: org })).rejects.toThrow(
      /Missing org-membership credentials/
    );
  });
});
