/** @jest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";
import PendingFieldPhotosPanel from "./admin/PendingFieldPhotosPanel";
import ReportedFieldPhotosPanel from "./admin/ReportedFieldPhotosPanel";

jest.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));
jest.mock("@/services/api/fieldPhotos", () => ({
    ...jest.requireActual("@/services/api/fieldPhotos"),
    fieldPhotosApi: {
        listPending: jest.fn(), approve: jest.fn(), reject: jest.fn(),
        listReports: jest.fn(), remove: jest.fn(), resolveReports: jest.fn(),
    },
}));
import { fieldPhotosApi } from "@/services/api/fieldPhotos";
const api = fieldPhotosApi as unknown as Record<string, jest.Mock>;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let confirmSpy: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, "confirm").mockImplementation(() => true);
});
afterEach(() => confirmSpy.mockRestore());

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("ConfirmDialog", () => {
    const props = { title: "למחוק?", message: "הפעולה לא הפיכה", confirmLabel: "מחיקה" };

    test("is an RTL, labelled alert dialog", () => {
        render(<ConfirmDialog open {...props} onConfirm={() => {}} onClose={() => {}} />);
        const dialog = screen.getByRole("alertdialog");
        expect(dialog.closest("[dir='rtl']")).toBeTruthy();
        expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
        expect(screen.getByRole("alertdialog", { name: "למחוק?" })).toBeTruthy();
        expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
        expect(screen.getByText("הפעולה לא הפיכה")).toBeTruthy();
    });

    test("confirm and cancel call their own handlers only", () => {
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(<ConfirmDialog open {...props} onConfirm={onConfirm} onClose={onClose} />);
        fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "מחיקה" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    test("a destructive dialog starts with Cancel focused, not the destructive button", async () => {
        render(<ConfirmDialog open destructive {...props} onConfirm={() => {}} onClose={() => {}} />);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "ביטול" })));
    });

    test("renders nothing when closed", () => {
        render(<ConfirmDialog open={false} {...props} onConfirm={() => {}} onClose={() => {}} />);
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });
});

describe("rejecting a suggested photo (admin queue)", () => {
    const pending = {
        id: "p1", url: "https://example.com/p1.jpg", status: "PENDING", sortOrder: 0, createdAt: "2026-11-23T00:00:00Z",
        field: { id: "f1", name: "מגרש הבדיקה", approvedCount: 2 }, uploader: { id: "u1", name: "דנה" },
    };

    test("asks in a dialog, never window.confirm, and rejects only after confirmation", async () => {
        api.listPending.mockResolvedValue([pending]);
        api.reject.mockResolvedValue({});
        render(<PendingFieldPhotosPanel />);
        await settle();

        fireEvent.click(await screen.findByRole("button", { name: "דחייה" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(dialog.textContent).toContain("מגרש הבדיקה");
        expect(api.reject).not.toHaveBeenCalled();
        expect(confirmSpy).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "דחיית התמונה" }));
        await waitFor(() => expect(api.reject).toHaveBeenCalledWith("p1", "tok"));
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    test("cancelling leaves the photo in the queue and rejects nothing", async () => {
        api.listPending.mockResolvedValue([pending]);
        render(<PendingFieldPhotosPanel />);
        await settle();
        fireEvent.click(await screen.findByRole("button", { name: "דחייה" }));
        fireEvent.click(await screen.findByRole("button", { name: "ביטול" }));
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
        expect(api.reject).not.toHaveBeenCalled();
        expect(screen.getByText("מגרש הבדיקה")).toBeTruthy();
    });
});

describe("removing a reported photo (admin queue)", () => {
    const entry = {
        count: 2, reasons: { PEOPLE: 2 }, firstReportedAt: "2026-11-23T00:00:00Z",
        photo: { id: "p9", url: "https://example.com/p9.jpg", status: "APPROVED", sortOrder: 0, createdAt: "2026-11-23T00:00:00Z", field: { id: "f9", name: "מגרש מדווח" } },
    };

    test("asks in a dialog, never window.confirm, and removes only after confirmation", async () => {
        api.listReports.mockResolvedValue([entry]);
        api.remove.mockResolvedValue({ ok: true });
        render(<ReportedFieldPhotosPanel />);
        await settle();

        fireEvent.click(await screen.findByRole("button", { name: "הסרת התמונה" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(dialog.textContent).toContain("מגרש מדווח");
        expect(api.remove).not.toHaveBeenCalled();

        // The dialog's own confirm button (the list's button of the same name is behind it).
        const confirm = screen.getAllByRole("button", { name: "הסרת התמונה" }).pop() as HTMLElement;
        fireEvent.click(confirm);
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith("f9", "p9", "tok"));
        expect(confirmSpy).not.toHaveBeenCalled();
    });

    test("dismissing the reports needs no confirmation", async () => {
        api.listReports.mockResolvedValue([entry]);
        api.resolveReports.mockResolvedValue({ ok: true, resolved: 2 });
        render(<ReportedFieldPhotosPanel />);
        await settle();
        fireEvent.click(await screen.findByRole("button", { name: "התעלמות" }));
        await waitFor(() => expect(api.resolveReports).toHaveBeenCalledWith("p9", "tok"));
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });
});
