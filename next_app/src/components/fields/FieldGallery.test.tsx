/** @jest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import FieldGallery from "./FieldGallery";

jest.mock("@clerk/nextjs", () => ({
    useAuth: () => ({ isSignedIn: true, getToken: async () => "tok" }),
}));
// Real decoding needs a canvas, which jsdom does not have; the upload flow is what is under test.
jest.mock("@/utils/resizeImage", () => ({ resizeImageFile: async (f: File) => f }));
jest.mock("@/services/api/fieldPhotos", () => ({
    ...jest.requireActual("@/services/api/fieldPhotos"),
    fieldPhotosApi: { list: jest.fn(), upload: jest.fn(), remove: jest.fn(), report: jest.fn() },
}));

import { fieldPhotosApi } from "@/services/api/fieldPhotos";
const api = fieldPhotosApi as unknown as Record<"list" | "upload", jest.Mock>;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const photo = (id: string, status: "APPROVED" | "PENDING") => ({
    id, url: `https://example.com/${id}.jpg`, status, sortOrder: 0, createdAt: "2026-11-23T00:00:00Z",
});

beforeAll(() => {
    // The carousel (not the empty state) observes its slides.
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
    };
    URL.createObjectURL = jest.fn(() => "blob:preview");
    URL.revokeObjectURL = jest.fn();
});

beforeEach(() => jest.clearAllMocks());

const pick = (name: string) => {
    const input = screen.getByLabelText("בחירת תמונות להעלאה") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "image/jpeg" })] } });
};

describe("FieldGallery uploader", () => {
    test("on a field with no photos, the success message and the file row survive the switch to the carousel", async () => {
        // Empty gallery first; after the upload the user's own pending photo exists, so the gallery
        // switches from its empty state to the carousel.
        api.list
            .mockResolvedValueOnce({ photos: [], mine: [], remaining: 5, fieldFull: false })
            .mockResolvedValue({ photos: [], mine: [photo("p1", "PENDING")], remaining: 4, fieldFull: false });
        api.upload.mockResolvedValue(photo("p1", "PENDING"));

        render(<FieldGallery fieldId="f1" fieldName="מגרש" initialPhotos={[]} />);
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

        fireEvent.click(await screen.findByRole("button", { name: /הוסיפו תמונה ראשונה/ }));
        await screen.findByRole("dialog");
        pick("first.jpg");

        // The gallery has switched to its carousel (the pending photo's badge is its tell-tale)...
        await screen.findByText("ממתינה לאישור");
        // ...and the uploader, still the same instance, still shows what happened.
        expect(await screen.findByText(/התמונה הועלתה\. תודה!/)).toBeTruthy();
        expect(screen.getByText("first.jpg")).toBeTruthy();
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    test("the dialog is the same DOM node before and after the switch (it is not remounted)", async () => {
        api.list
            .mockResolvedValueOnce({ photos: [], mine: [], remaining: 5, fieldFull: false })
            .mockResolvedValue({ photos: [], mine: [photo("p1", "PENDING")], remaining: 4, fieldFull: false });
        api.upload.mockResolvedValue(photo("p1", "PENDING"));

        render(<FieldGallery fieldId="f1" fieldName="מגרש" initialPhotos={[]} />);
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        fireEvent.click(await screen.findByRole("button", { name: /הוסיפו תמונה ראשונה/ }));
        const before = await screen.findByRole("dialog");
        pick("first.jpg");
        await screen.findByText("ממתינה לאישור");
        await waitFor(() => expect(screen.getByRole("dialog")).toBe(before));
    });

    test("baseline: the same upload on a field that already has photos shows the confirmation", async () => {
        api.list
            .mockResolvedValueOnce({ photos: [photo("a", "APPROVED")], mine: [], remaining: 5, fieldFull: false })
            .mockResolvedValue({ photos: [photo("a", "APPROVED")], mine: [photo("p1", "PENDING")], remaining: 4, fieldFull: false });
        api.upload.mockResolvedValue(photo("p1", "PENDING"));

        render(<FieldGallery fieldId="f1" fieldName="מגרש" initialPhotos={["https://example.com/a.jpg"]} />);
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        fireEvent.click(await screen.findByRole("button", { name: /הוספת תמונות/ }));
        await screen.findByRole("dialog");
        pick("second.jpg");
        expect(await screen.findByText(/התמונה הועלתה\. תודה!/)).toBeTruthy();
        expect(screen.getByText("second.jpg")).toBeTruthy();
    });
});
