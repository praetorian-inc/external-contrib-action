import { postSlackNotification } from "../src/slack";
import { ContributionEvent, LinearIssueResult } from "../src/types";

// Mock @actions/core
jest.mock("@actions/core", () => ({
  info: jest.fn(),
}));

// Mock @slack/web-api
const mockPostMessage = jest.fn();
jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockPostMessage,
    },
  })),
}));

const baseEvent: ContributionEvent = {
  type: "pull_request",
  action: "opened",
  title: "Fix buffer overflow",
  body: "This PR fixes a buffer overflow in the scanner that occurs when processing large files.",
  url: "https://github.com/praetorian-inc/noseyparker/pull/42",
  number: 42,
  author: "external-user",
  repo: "noseyparker",
  repoFullName: "praetorian-inc/noseyparker",
  labels: ["bug", "security"],
};

const linearResult: LinearIssueResult = {
  created: true,
  issueId: "issue-123",
  issueUrl: "https://linear.app/praetorian/issue/ENG-123",
  issueIdentifier: "ENG-123",
};

describe("postSlackNotification", () => {
  const channelId = "C0TEST123";
  const token = "xoxb-fake-token";

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostMessage.mockResolvedValue({ ok: true });
  });

  it("should post a Block Kit message for a PR", async () => {
    await postSlackNotification(baseEvent, channelId, linearResult, token, false);

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const call = mockPostMessage.mock.calls[0][0];
    expect(call.channel).toBe("C0TEST123");
    expect(call.blocks).toBeDefined();
    expect(call.blocks.length).toBeGreaterThanOrEqual(3);
  });

  it("should include header with repo name and type", async () => {
    await postSlackNotification(baseEvent, channelId, linearResult, token, false);

    const call = mockPostMessage.mock.calls[0][0];
    const headerBlock = call.blocks.find((b: Record<string, unknown>) => b.type === "header");
    expect((headerBlock.text as Record<string, unknown>).text).toContain("Pull Request");
    expect((headerBlock.text as Record<string, unknown>).text).toContain("noseyparker");
  });

  it("should include View on GitHub and View Linear Issue buttons", async () => {
    await postSlackNotification(baseEvent, channelId, linearResult, token, false);

    const call = mockPostMessage.mock.calls[0][0];
    const actionsBlock = call.blocks.find((b: Record<string, unknown>) => b.type === "actions");
    expect(actionsBlock).toBeDefined();
    const elements = actionsBlock.elements as Record<string, unknown>[];
    expect(elements).toHaveLength(2);
    expect(elements[0].url).toBe(baseEvent.url);
    expect(elements[1].url).toBe(linearResult.issueUrl);
  });

  it("should omit Linear button when no Linear issue was created", async () => {
    const noLinear: LinearIssueResult = {
      created: false,
      skippedReason: "duplicate",
    };

    await postSlackNotification(baseEvent, channelId, noLinear, token, false);

    const call = mockPostMessage.mock.calls[0][0];
    const actionsBlock = call.blocks.find((b: Record<string, unknown>) => b.type === "actions");
    const elements = actionsBlock.elements as Record<string, unknown>[];
    expect(elements).toHaveLength(1);
    expect(elements[0].url).toBe(baseEvent.url);
  });

  it("should not call Slack API in dry-run mode", async () => {
    await postSlackNotification(baseEvent, channelId, linearResult, token, true);

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it("should throw with helpful message on channel_not_found", async () => {
    mockPostMessage.mockRejectedValue({
      code: "slack_webapi_platform_error",
      data: { error: "channel_not_found" },
    });

    await expect(
      postSlackNotification(baseEvent, channelId, linearResult, token, false)
    ).rejects.toThrow(/channel_not_found/);
  });

  it("should truncate long descriptions to 300 chars", async () => {
    const longEvent = { ...baseEvent, body: "x".repeat(500) };

    await postSlackNotification(longEvent, channelId, linearResult, token, false);

    const call = mockPostMessage.mock.calls[0][0];
    // The description block is the third block (index 2) — after header and fields
    const descBlock = call.blocks[2];
    const text = (descBlock.text as Record<string, unknown>).text as string;
    expect(text.length).toBeLessThanOrEqual(303);
    expect(text.endsWith("...")).toBe(true);
  });

  it("should format header correctly for Issues", async () => {
    const issueEvent = { ...baseEvent, type: "issue" as const };

    await postSlackNotification(issueEvent, channelId, linearResult, token, false);

    const call = mockPostMessage.mock.calls[0][0];
    const headerBlock = call.blocks.find((b: Record<string, unknown>) => b.type === "header");
    expect((headerBlock.text as Record<string, unknown>).text).toContain("Issue");
    expect((headerBlock.text as Record<string, unknown>).text).not.toContain("Pull Request");
  });
});
