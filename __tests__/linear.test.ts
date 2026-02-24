import { createLinearIssue } from "../src/linear";
import { ContributionEvent } from "../src/types";

// Mock @actions/core
jest.mock("@actions/core", () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

// Mock @linear/sdk
const mockCreateIssue = jest.fn();
const mockCreateLabel = jest.fn();
const mockIssues = jest.fn();
const mockIssueLabels = jest.fn();

jest.mock("@linear/sdk", () => ({
  LinearClient: jest.fn().mockImplementation(() => ({
    createIssue: mockCreateIssue,
    createIssueLabel: mockCreateLabel,
    issues: mockIssues,
    issueLabels: mockIssueLabels,
  })),
}));

const baseEvent: ContributionEvent = {
  type: "pull_request",
  title: "Fix buffer overflow",
  body: "This PR fixes a buffer overflow in the scanner.",
  url: "https://github.com/praetorian-inc/noseyparker/pull/42",
  number: 42,
  author: "external-user",
  repo: "noseyparker",
  repoFullName: "praetorian-inc/noseyparker",
  labels: ["bug", "security"],
};

describe("createLinearIssue", () => {
  const teamId = "team-abc";
  const apiKey = "lin_api_fake";

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no existing issues (no duplicates)
    mockIssues.mockResolvedValue({ nodes: [] });

    // Default: no existing labels
    mockIssueLabels.mockResolvedValue({ nodes: [] });

    // Default: successful creation
    mockCreateIssue.mockResolvedValue({
      success: true,
      issue: Promise.resolve({
        id: "issue-123",
        url: "https://linear.app/praetorian/issue/ENG-123",
        identifier: "ENG-123",
      }),
    });

    mockCreateLabel.mockResolvedValue({
      success: true,
      issueLabel: Promise.resolve({ id: "label-new" }),
    });
  });

  it("should create a Linear issue with correct title and description", async () => {
    const result = await createLinearIssue(baseEvent, teamId, undefined, apiKey, false);

    expect(result.created).toBe(true);
    expect(result.issueId).toBe("issue-123");
    expect(result.issueUrl).toBe("https://linear.app/praetorian/issue/ENG-123");

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-abc",
        title: "[External PR] Fix buffer overflow",
      })
    );
  });

  it("should skip creation when duplicate exists", async () => {
    mockIssues.mockResolvedValue({
      nodes: [{ id: "existing-123", url: "https://linear.app/existing" }],
    });

    const result = await createLinearIssue(baseEvent, teamId, undefined, apiKey, false);

    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe("duplicate");
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it("should include project ID when provided", async () => {
    await createLinearIssue(baseEvent, teamId, "project-xyz", apiKey, false);

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-xyz",
      })
    );
  });

  it("should truncate body longer than 10000 characters", async () => {
    const longEvent = { ...baseEvent, body: "x".repeat(15000) };

    await createLinearIssue(longEvent, teamId, undefined, apiKey, false);

    const callArgs = mockCreateIssue.mock.calls[0][0];
    expect(callArgs.description.length).toBeLessThanOrEqual(12000);
  });

  it("should use Issue type label for issues", async () => {
    const issueEvent = { ...baseEvent, type: "issue" as const };

    await createLinearIssue(issueEvent, teamId, undefined, apiKey, false);

    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[External Issue] Fix buffer overflow",
      })
    );
  });

  it("should not call APIs in dry-run mode", async () => {
    const result = await createLinearIssue(baseEvent, teamId, undefined, apiKey, true);

    expect(result.created).toBe(false);
    expect(result.skippedReason).toBe("dry_run");
    expect(mockCreateIssue).not.toHaveBeenCalled();
    expect(mockIssues).not.toHaveBeenCalled();
  });

  it("should throw on API errors", async () => {
    mockIssues.mockRejectedValue(new Error("Linear API error"));

    await expect(
      createLinearIssue(baseEvent, teamId, undefined, apiKey, false)
    ).rejects.toThrow("Linear API error");
  });

  it("should include repo, author, and GitHub link in description", async () => {
    await createLinearIssue(baseEvent, teamId, undefined, apiKey, false);

    const callArgs = mockCreateIssue.mock.calls[0][0];
    expect(callArgs.description).toContain("praetorian-inc/noseyparker");
    expect(callArgs.description).toContain("@external-user");
    expect(callArgs.description).toContain("https://github.com/praetorian-inc/noseyparker/pull/42");
    expect(callArgs.description).toContain("This PR fixes a buffer overflow");
  });

  it("should always create external-contribution label", async () => {
    await createLinearIssue(baseEvent, teamId, undefined, apiKey, false);

    expect(mockIssueLabels).toHaveBeenCalled();
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: expect.arrayContaining([expect.any(String)]),
      })
    );
  });
});
