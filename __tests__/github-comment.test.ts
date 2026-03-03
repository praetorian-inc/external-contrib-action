// Must mock before imports
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(),
}));

import * as core from "@actions/core";
import * as github from "@actions/github";
import { buildComment, postGitHubComment } from "../src/github-comment";
import { ContributionEvent } from "../src/types";

const mockGetOctokit = github.getOctokit as jest.MockedFunction<typeof github.getOctokit>;

function makeEvent(overrides: Partial<ContributionEvent> = {}): ContributionEvent {
  return {
    type: "issue",
    action: "opened",
    title: "Bug report",
    body: "Found a bug",
    url: "https://github.com/praetorian-inc/repo/issues/5",
    number: 5,
    author: "external-user",
    repo: "test-repo",
    repoFullName: "praetorian-inc/test-repo",
    labels: ["bug"],
    ...overrides,
  };
}

describe("buildComment", () => {
  it("should build welcome message for opened issues", () => {
    const event = makeEvent({ action: "opened", type: "issue" });
    const comment = buildComment(event);

    expect(comment).toContain("@external-user");
    expect(comment).toContain("thanks for taking the time");
    expect(comment).toContain("issue");
    expect(comment).toContain("picking this up shortly");
  });

  it("should build welcome message for opened PRs", () => {
    const event = makeEvent({ action: "opened", type: "pull_request" });
    const comment = buildComment(event);

    expect(comment).toContain("@external-user");
    expect(comment).toContain("PR");
  });

  it("should build investigating message with assignee display name", () => {
    const event = makeEvent({ action: "assigned", assignee: "nsportsman" });
    const comment = buildComment(event, "Nick");

    expect(comment).toContain("@external-user");
    expect(comment).toContain("I'm Nick");
    expect(comment).toContain("looking into this");
  });

  it("should fall back to username when no display name", () => {
    const event = makeEvent({ action: "assigned", assignee: "nsportsman" });
    const comment = buildComment(event);

    expect(comment).toContain("I'm nsportsman");
  });

  it("should build resolution message for closed events", () => {
    const event = makeEvent({ action: "closed" });
    const comment = buildComment(event);

    expect(comment).toContain("@external-user");
    expect(comment).toContain("should now be resolved");
    expect(comment).toContain("reopen");
    expect(comment).toContain("Thanks for helping us improve");
  });
});

describe("postGitHubComment", () => {
  const mockCreateComment = jest.fn().mockResolvedValue({});
  const mockListComments = jest.fn().mockResolvedValue({ data: [] });
  const mockGetByUsername = jest.fn().mockResolvedValue({ data: { name: "Nick" } });

  beforeEach(() => {
    jest.clearAllMocks();
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({});
    mockGetByUsername.mockResolvedValue({ data: { name: "Nick" } });

    mockGetOctokit.mockReturnValue({
      rest: {
        issues: {
          createComment: mockCreateComment,
          listComments: mockListComments,
        },
        users: {
          getByUsername: mockGetByUsername,
        },
      },
    } as any);
  });

  it("should post welcome comment on opened event", async () => {
    const event = makeEvent({ action: "opened" });
    await postGitHubComment(event, "fake-token", false);

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: "praetorian-inc",
      repo: "test-repo",
      issue_number: 5,
      body: expect.stringContaining("thanks for taking the time"),
    });
  });

  it("should post investigating comment with display name on assigned event", async () => {
    const event = makeEvent({ action: "assigned", assignee: "nsportsman" });
    await postGitHubComment(event, "fake-token", false);

    expect(mockGetByUsername).toHaveBeenCalledWith({ username: "nsportsman" });
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: "praetorian-inc",
      repo: "test-repo",
      issue_number: 5,
      body: expect.stringContaining("I'm Nick"),
    });
  });

  it("should skip if duplicate comment exists", async () => {
    mockListComments.mockResolvedValue({
      data: [
        { body: "Hey @external-user, thanks for taking the time to submit this issue!" },
      ],
    });

    const event = makeEvent({ action: "opened" });
    await postGitHubComment(event, "fake-token", false);

    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it("should log instead of posting in dry-run mode", async () => {
    const mockInfo = core.info as jest.MockedFunction<typeof core.info>;
    const event = makeEvent({ action: "opened" });

    await postGitHubComment(event, "fake-token", true);

    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
  });
});
