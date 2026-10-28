import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardMembers } from "@/components/BoardMembers";
import type { Member, Role } from "@/lib/kanban";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

const members: Member[] = [
  { username: "alice", role: "owner" },
  { username: "bob", role: "member" },
];

const renderMembers = ({
  role = "owner" as Role,
  username = "alice",
  list = members,
  onMembersChange = vi.fn(),
  onMemberRemoved = vi.fn(),
  onLeave = vi.fn(),
  onSessionExpired = vi.fn(),
} = {}) =>
  render(
    <BoardMembers
      boardId={2}
      role={role}
      username={username}
      members={list}
      onMembersChange={onMembersChange}
      onMemberRemoved={onMemberRemoved}
      onLeave={onLeave}
      onSessionExpired={onSessionExpired}
    />,
  );

const share = async (username: string) => {
  await userEvent.type(screen.getByLabelText("Share with username"), username);
  await userEvent.click(screen.getByRole("button", { name: "Add member" }));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BoardMembers", () => {
  it("lists the owner and members", async () => {
    renderMembers();
    const rows = screen.getAllByTestId("member");
    expect(rows.map((row) => row.textContent)).toEqual([
      "alice (you)owner",
      "bobmemberRemove",
    ]);
  });

  it("shares with a user", async () => {
    const fetchMock = mockApi({
      "POST /api/boards/2/members": () =>
        jsonResponse(201, { username: "carol", role: "member" }),
    });
    const onMembersChange = vi.fn();
    renderMembers({ onMembersChange });
    await share(" carol ");

    await vi.waitFor(() =>
      expect(onMembersChange).toHaveBeenCalledWith([
        ...members,
        { username: "carol", role: "member" },
      ]),
    );
    expect(requestsTo(fetchMock, "POST", "/api/boards/2/members")).toEqual([
      { username: "carol" },
    ]);
    expect(screen.getByLabelText("Share with username")).toHaveValue("");
  });

  it("explains an unknown user and an existing member", async () => {
    let status = 404;
    mockApi({
      "POST /api/boards/2/members": () => jsonResponse(status, {}),
    });
    renderMembers();
    await share("nobody");
    expect(await screen.findByRole("alert")).toHaveTextContent("No user with that username");

    status = 409;
    await userEvent.clear(screen.getByLabelText("Share with username"));
    await share("bob");
    expect(await screen.findByRole("alert")).toHaveTextContent("already has access");
  });

  it("ignores a blank username", async () => {
    const fetchMock = mockApi({});
    renderMembers();
    await share("   ");
    expect(requestsTo(fetchMock, "POST", "/api/boards/2/members")).toEqual([]);
  });

  it("removes a member", async () => {
    mockApi({
      "DELETE /api/boards/2/members/bob": () => jsonResponse(204),
    });
    const onMembersChange = vi.fn();
    const onMemberRemoved = vi.fn();
    renderMembers({ onMembersChange, onMemberRemoved });
    await userEvent.click(screen.getByRole("button", { name: "Remove bob" }));
    await vi.waitFor(() => expect(onMemberRemoved).toHaveBeenCalledOnce());
    expect(onMembersChange).toHaveBeenCalledWith([members[0]]);
  });

  it("lets a member leave after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi({
      "DELETE /api/boards/2/members/bob": () => jsonResponse(204),
    });
    const onLeave = vi.fn();
    renderMembers({ role: "member", username: "bob", onLeave });
    expect(screen.queryByLabelText("Share with username")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    await vi.waitFor(() => expect(onLeave).toHaveBeenCalledOnce());
  });

  it("stays when leaving is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockApi({});
    renderMembers({ role: "member", username: "bob" });
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(requestsTo(fetchMock, "DELETE", "/api/boards/2/members/bob")).toEqual([]);
  });

  it("does not let members remove others", async () => {
    renderMembers({
      role: "member",
      username: "bob",
      list: [...members, { username: "carol", role: "member" }],
    });
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("reports an expired session", async () => {
    mockApi({ "POST /api/boards/2/members": () => jsonResponse(401, {}) });
    const onSessionExpired = vi.fn();
    renderMembers({ onSessionExpired });
    await share("carol");
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });
});
