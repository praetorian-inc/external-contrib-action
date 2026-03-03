// Must mock before imports
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  context: {
    eventName: "pull_request_target",
    payload: {
      action: "opened",
      pull_request: {
        title: "Fix bug",
        body: "Fixes a bug",
        html_url: "https://github.com/praetorian-inc/repo/pull/1",
        number: 1,
        user: { login: "external-user" },
        labels: [{ name: "bug" }],
      },
    },
    repo: { owner: "praetorian-inc", repo: "test-repo" },
  },
}));
jest.mock("../src/membership");
jest.mock("../src/linear");
jest.mock("../src/slack");
jest.mock("../src/github-comment");

import * as core from "@actions/core";
import * as github from "@actions/github";
import { checkMembership } from "../src/membership";
import { createLinearIssue } from "../src/linear";
import { postSlackNotification } from "../src/slack";
import { postGitHubComment } from "../src/github-comment";
import { run } from "../src/index";

const mockGetInput = core.getInput as jest.MockedFunction<typeof core.getInput>;
const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<typeof core.getBooleanInput>;
const mockSetOutput = core.setOutput as jest.MockedFunction<typeof core.setOutput>;
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;
const mockCheckMembership = checkMembership as jest.MockedFunction<typeof checkMembership>;
const mockCreateLinearIssue = createLinearIssue as jest.MockedFunction<typeof createLinearIssue>;
const mockPostSlackNotification = postSlackNotification as jest.MockedFunction<typeof postSlackNotification>;
const mockPostGitHubComment = postGitHubComment as jest.MockedFunction<typeof postGitHubComment>;

describe("run (orchestrator)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default inputs
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "linear-team-id": "team-abc",
        "slack-channel-id": "C0TEST",
        "github-org": "praetorian-inc",
        "auto-reply-enabled": "true",
      };
      return inputs[name] || "";
    });
    mockGetBooleanInput.mockReturnValue(false);

    // Default env
    process.env.ORG_MEMBER_CHECK_PAT = "fake-pat";
    process.env.LINEAR_API_KEY = "lin_fake";
    process.env.SLACK_BOT_TOKEN = "xoxb-fake";
    process.env.GITHUB_TOKEN = "ghp-fake-token";

    // Default: external contributor
    mockCheckMembership.mockResolvedValue({ isMember: false, reason: "not_member" });

    // Default: Linear issue created
    mockCreateLinearIssue.mockResolvedValue({
      created: true,
      issueId: "issue-1",
      issueUrl: "https://linear.app/issue/1",
      issueIdentifier: "ENG-1",
    });

    // Default: Slack succeeds
    mockPostSlackNotification.mockResolvedValue(undefined);

    // Default: GitHub comment succeeds
    mockPostGitHubComment.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.ORG_MEMBER_CHECK_PAT;
    delete process.env.LINEAR_API_KEY;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it("should create Linear issue and post Slack for external PR", async () => {
    await run();

    expect(mockCheckMembership).toHaveBeenCalledWith("external-user", "praetorian-inc", "fake-pat");
    expect(mockCreateLinearIssue).toHaveBeenCalled();
    expect(mockPostSlackNotification).toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith("is-external", "true");
    expect(mockSetOutput).toHaveBeenCalledWith("linear-issue-url", "https://linear.app/issue/1");
  });

  it("should skip Linear and Slack for org members", async () => {
    mockCheckMembership.mockResolvedValue({ isMember: true, reason: "member" });

    await run();

    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockPostSlackNotification).not.toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith("is-external", "false");
  });

  it("should handle issue events", async () => {
    const ctx = github.context as any;
    const originalEventName = ctx.eventName;
    const originalPayload = ctx.payload;

    ctx.eventName = "issues";
    ctx.payload = {
      action: "opened",
      issue: {
        title: "Bug report",
        body: "Found a bug",
        html_url: "https://github.com/praetorian-inc/repo/issues/5",
        number: 5,
        user: { login: "external-user" },
        labels: [{ name: "bug" }],
      },
    };

    await run();

    expect(mockCreateLinearIssue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "issue", title: "Bug report" }),
      "team-abc",
      undefined,
      undefined,
      undefined,
      "Backlog",
      "lin_fake",
      false
    );

    ctx.eventName = originalEventName;
    ctx.payload = originalPayload;
  });

  it("should call setFailed on unexpected errors", async () => {
    mockCheckMembership.mockRejectedValue(new Error("API down"));

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith("API down");
  });

  // --- New auto-reply tests ---

  it("should post GitHub comment on opened event when auto-reply enabled", async () => {
    await run();

    expect(mockPostGitHubComment).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opened", author: "external-user" }),
      "ghp-fake-token",
      false
    );
  });

  it("should post comment but NOT Linear/Slack on assigned event", async () => {
    const ctx = github.context as any;
    const originalEventName = ctx.eventName;
    const originalPayload = ctx.payload;

    ctx.eventName = "issues";
    ctx.payload = {
      action: "assigned",
      assignee: { login: "nsportsman" },
      issue: {
        title: "Bug report",
        body: "Found a bug",
        html_url: "https://github.com/praetorian-inc/repo/issues/5",
        number: 5,
        user: { login: "external-user" },
        labels: [{ name: "bug" }],
      },
    };

    await run();

    expect(mockPostGitHubComment).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assigned", assignee: "nsportsman" }),
      "ghp-fake-token",
      false
    );
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockPostSlackNotification).not.toHaveBeenCalled();

    ctx.eventName = originalEventName;
    ctx.payload = originalPayload;
  });

  it("should post comment but NOT Linear/Slack on closed event", async () => {
    const ctx = github.context as any;
    const originalEventName = ctx.eventName;
    const originalPayload = ctx.payload;

    ctx.eventName = "issues";
    ctx.payload = {
      action: "closed",
      sender: { login: "nsportsman" },
      issue: {
        title: "Bug report",
        body: "Found a bug",
        html_url: "https://github.com/praetorian-inc/repo/issues/5",
        number: 5,
        user: { login: "external-user" },
        labels: [{ name: "bug" }],
      },
    };

    await run();

    expect(mockPostGitHubComment).toHaveBeenCalledWith(
      expect.objectContaining({ action: "closed" }),
      "ghp-fake-token",
      false
    );
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockPostSlackNotification).not.toHaveBeenCalled();

    ctx.eventName = originalEventName;
    ctx.payload = originalPayload;
  });

  it("should skip comment when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN;

    await run();

    expect(mockPostGitHubComment).not.toHaveBeenCalled();
    // Linear and Slack should still work
    expect(mockCreateLinearIssue).toHaveBeenCalled();
    expect(mockPostSlackNotification).toHaveBeenCalled();
  });

  it("should skip comment when auto-reply-enabled is false", async () => {
    mockGetInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "linear-team-id": "team-abc",
        "slack-channel-id": "C0TEST",
        "github-org": "praetorian-inc",
        "auto-reply-enabled": "false",
      };
      return inputs[name] || "";
    });

    await run();

    expect(mockPostGitHubComment).not.toHaveBeenCalled();
  });
});
