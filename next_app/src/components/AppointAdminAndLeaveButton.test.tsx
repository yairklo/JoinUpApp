/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import AppointAdminAndLeaveButton from "./AppointAdminAndLeaveButton";

jest.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const candidates = [
    { id: "u1", name: "דנה" },
    { id: "u2", name: "רון" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el: Element | null) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const byText = (text: string) =>
    Array.from(document.body.querySelectorAll("button, [role=button]")).find((b) => b.textContent?.includes(text)) || null;

function mount(props: Partial<React.ComponentProps<typeof AppointAdminAndLeaveButton>> = {}) {
    const onLeave = jest.fn().mockResolvedValue(undefined);
    act(() => root.render(<AppointAdminAndLeaveButton kind="game" candidates={candidates} onLeave={onLeave} testId="open" {...props} />));
    return onLeave;
}

describe("AppointAdminAndLeaveButton", () => {
    it("cancel closes the picker without leaving", async () => {
        const onLeave = mount();
        click(document.querySelector("[data-testid=open]"));
        expect(document.body.textContent).toContain("מנה מנהל חדש");
        click(byText("ביטול"));
        await flush();
        expect(onLeave).not.toHaveBeenCalled();
    });

    it("confirm stays disabled until someone is picked, then leaves with that successor", async () => {
        const onLeave = mount();
        click(document.querySelector("[data-testid=open]"));
        const confirmBtn = () => byText("מנה ועזוב") as HTMLButtonElement;
        expect(confirmBtn().disabled).toBe(true);
        click(document.querySelector("[data-testid=successor-u2]"));
        expect(confirmBtn().disabled).toBe(false);
        click(confirmBtn());
        await flush();
        expect(onLeave).toHaveBeenCalledWith("u2", "tok");
    });

    it("with no eligible successor it explains why and cannot confirm", () => {
        const onLeave = mount({ candidates: [] });
        click(document.querySelector("[data-testid=open]"));
        expect(document.body.textContent).toContain("אין כרגע מי שאפשר למנות");
        expect((byText("מנה ועזוב") as HTMLButtonElement).disabled).toBe(true);
        expect(onLeave).not.toHaveBeenCalled();
    });

    it("shows the server error and keeps the dialog open", async () => {
        const onLeave = jest.fn().mockRejectedValue(Object.assign(new Error("מצב המשחק השתנה, נסה שוב"), { code: "LEAVE_CONFLICT" }));
        mount({ onLeave });
        click(document.querySelector("[data-testid=open]"));
        click(document.querySelector("[data-testid=successor-u1]"));
        click(byText("מנה ועזוב"));
        await flush();
        expect(document.body.textContent).toContain("מצב המשחק השתנה");
        expect(byText("מנה ועזוב")).toBeTruthy();
    });
});
