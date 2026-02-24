import { checkMembership } from "../src/membership";

// Mock @actions/github
const mockCheckMembershipForUser = jest.fn();
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn().mockImplementation(() => ({
    rest: {
      orgs: {
        checkMembershipForUser: mockCheckMembershipForUser,
      },
    },
  })),
}));

describe("checkMembership", () => {
  const org = "praetorian-inc";
  const token = "fake-token";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return isMember=false, reason=bot for bot accounts", async () => {
    const result = await checkMembership("dependabot[bot]", org, token);
    expect(result).toEqual({ isMember: false, reason: "bot" });
  });

  it("should return isMember=false, reason=bot for github-actions bot", async () => {
    const result = await checkMembership("github-actions[bot]", org, token);
    expect(result).toEqual({ isMember: false, reason: "bot" });
  });

  it("should return isMember=true, reason=member when API succeeds", async () => {
    mockCheckMembershipForUser.mockResolvedValue({ status: 204 });

    const result = await checkMembership("internal-user", org, token);
    expect(result).toEqual({ isMember: true, reason: "member" });
  });

  it("should return isMember=false, reason=not_member when API returns 404", async () => {
    mockCheckMembershipForUser.mockRejectedValue({
      status: 404,
      message: "Not Found",
    });

    const result = await checkMembership("external-user", org, token);
    expect(result).toEqual({ isMember: false, reason: "not_member" });
  });

  it("should return isMember=false, reason=error when API returns 302", async () => {
    mockCheckMembershipForUser.mockRejectedValue({
      status: 302,
      message: "Redirect",
    });

    const result = await checkMembership("any-user", org, token);
    expect(result).toEqual({ isMember: false, reason: "error" });
  });

  it("should throw on unexpected API errors (e.g., 500)", async () => {
    mockCheckMembershipForUser.mockRejectedValue({
      status: 500,
      message: "Internal Server Error",
    });

    await expect(
      checkMembership("any-user", org, token)
    ).rejects.toThrow("Failed to check org membership");
  });

  it("should handle empty username gracefully", async () => {
    mockCheckMembershipForUser.mockRejectedValue({
      status: 404,
      message: "Not Found",
    });

    const result = await checkMembership("", org, token);
    expect(result).toEqual({ isMember: false, reason: "not_member" });
  });
});
