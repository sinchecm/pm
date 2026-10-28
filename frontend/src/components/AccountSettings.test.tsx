import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/components/AccountSettings";
import { jsonResponse, mockApi, requestsTo } from "@/test/mockApi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderSettings = (props: Partial<Parameters<typeof AccountSettings>[0]> = {}) =>
  render(
    <AccountSettings
      onClose={vi.fn()}
      onAccountDeleted={vi.fn()}
      onSessionExpired={vi.fn()}
      {...props}
    />,
  );

const changePassword = async (current: string, next: string) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.click(screen.getByRole("button", { name: /update password/i }));
};

const deleteAccount = async (password: string) => {
  await userEvent.type(screen.getByLabelText(/confirm with your password/i), password);
  await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
};

describe("AccountSettings", () => {
  it("changes the password", async () => {
    const fetchMock = mockApi({ "PUT /api/me/password": () => jsonResponse(204) });
    renderSettings();
    await changePassword("password", "new-password");

    expect(await screen.findByRole("status")).toHaveTextContent("Password updated.");
    expect(requestsTo(fetchMock, "PUT", "/api/me/password")).toEqual([
      { currentPassword: "password", newPassword: "new-password" },
    ]);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("reports a wrong current password", async () => {
    mockApi({ "PUT /api/me/password": () => jsonResponse(403, {}) });
    renderSettings();
    await changePassword("wrong", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
  });

  it("reports a rejected new password", async () => {
    mockApi({ "PUT /api/me/password": () => jsonResponse(422, {}) });
    renderSettings();
    await changePassword("password", "12345678");
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/);
  });

  it("reports an expired session", async () => {
    mockApi({ "PUT /api/me/password": () => jsonResponse(401, {}) });
    const onSessionExpired = vi.fn();
    renderSettings({ onSessionExpired });
    await changePassword("password", "new-password");
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  it("deletes the account after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = mockApi({ "DELETE /api/me": () => jsonResponse(204) });
    const onAccountDeleted = vi.fn();
    renderSettings({ onAccountDeleted });
    await deleteAccount("password");

    await vi.waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce());
    expect(requestsTo(fetchMock, "DELETE", "/api/me")).toEqual([{ password: "password" }]);
  });

  it("does nothing when deletion is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = mockApi({});
    renderSettings();
    await deleteAccount("password");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a wrong password when deleting", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockApi({ "DELETE /api/me": () => jsonResponse(403, {}) });
    const onAccountDeleted = vi.fn();
    renderSettings({ onAccountDeleted });
    await deleteAccount("wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("goes back to the board", async () => {
    const onClose = vi.fn();
    renderSettings({ onClose });
    await userEvent.click(screen.getByRole("button", { name: /back to board/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
