/** @jest-environment jsdom */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import GameReminderLeadControl from "./GameReminderLeadControl";

const inputs = () => ({
    hours: screen.getByLabelText(/^(שעות|Hours)$/) as HTMLInputElement,
    minutes: screen.getByLabelText(/^(דקות|Minutes)$/) as HTMLInputElement,
});

describe("GameReminderLeadControl", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("value=60 shows 1 hour 0 minutes and no error", () => {
        render(<GameReminderLeadControl value={60} disabled={false} onChange={() => {}} />);
        const { hours, minutes } = inputs();
        expect(hours.value).toBe("1");
        expect(minutes.value).toBe("0");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    test("typing 1h 30m calls onChange(90) exactly once", () => {
        const onChange = jest.fn();
        const ui = (v: number) => <GameReminderLeadControl value={v} disabled={false} onChange={onChange} />;
        const { rerender } = render(ui(60));
        const { hours, minutes } = inputs();
        fireEvent.change(hours, { target: { value: "1" } });
        fireEvent.change(minutes, { target: { value: "30" } });
        act(() => { jest.advanceTimersByTime(700); });
        rerender(ui(90)); // parent applies the saved value
        fireEvent.blur(minutes);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(90);
    });

    test.each([["empty", ""], ["fractional", "2.5"]])("%s hours box shows the error and does not save", (_n, bad) => {
        const onChange = jest.fn();
        render(<GameReminderLeadControl value={60} disabled={false} onChange={onChange} />);
        const { hours } = inputs();
        fireEvent.change(hours, { target: { value: bad } });
        act(() => { jest.advanceTimersByTime(700); });
        fireEvent.blur(hours);
        expect(screen.getByRole("alert")).toBeTruthy();
        expect(onChange).not.toHaveBeenCalled();
    });
});
