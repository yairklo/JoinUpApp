import {
    defaultValues,
    fromTournament,
    knockoutByes,
    matchCountText,
    reviewWarnings,
    toCreateInput,
    validateAll,
    validateStep,
} from "./wizardModel";

const valid = () => ({ ...defaultValues(), title: "גביע", startsAt: "2030-01-01T10:00" });

describe("wizardModel", () => {
    it("step 1 requires title and start", () => {
        const e = validateStep(1, defaultValues());
        expect(e.title).toBeTruthy();
        expect(e.startsAt).toBeTruthy();
        expect(validateStep(1, valid())).toEqual({});
    });

    it("step 1 rejects end before start", () => {
        expect(validateStep(1, { ...valid(), endsAt: "2029-12-31T10:00" }).endsAt).toBeTruthy();
    });

    it("step 2 roster range errors", () => {
        expect(validateStep(2, { ...valid(), minPlayersPerTeam: 8, maxPlayersPerTeam: 6 }).players).toBe("המינימום גדול מהמקסימום");
        expect(validateStep(2, { ...valid(), startersPerTeam: 7, minPlayersPerTeam: 5 }).starters).toContain("(5)");
        expect(validateStep(2, { ...valid(), minTeams: 10, maxTeams: 4 }).teams).toBeTruthy();
        expect(validateStep(2, valid())).toEqual({});
    });

    it("step 4 ordering and publish requires close", () => {
        expect(
            validateStep(4, { ...valid(), registrationOpensAt: "2029-01-02T10:00", registrationClosesAt: "2029-01-01T10:00" })
                .registrationClosesAt
        ).toBeTruthy();
        expect(validateAll(valid(), false)).toEqual([]);
        expect(validateAll(valid(), true)[0].step).toBe(4);
    });

    it("counts matches and byes", () => {
        expect(knockoutByes(12)).toBe(4);
        expect(knockoutByes(8)).toBe(0);
        expect(matchCountText({ ...valid(), maxTeams: 12 })).toContain("66");
        expect(matchCountText({ ...valid(), format: "KNOCKOUT", maxTeams: 12 })).toContain("11");
        expect(reviewWarnings({ ...valid(), format: "KNOCKOUT" })).toContain("לא נקבע מועד סגירת הרשמה");
    });

    it("round-trips through the API shape", () => {
        const input = toCreateInput({ ...valid(), format: "GROUPS_KNOCKOUT", registrationClosesAt: "2029-12-01T10:00" });
        expect(input.rules?.groupCount).toBe(2);
        expect(input.openToMinors).toBe(false);
        expect(input.registrationClosesAt).toBeTruthy();
        const back = fromTournament({ ...input, id: "x", status: "DRAFT", isPublic: true, requireApproval: true } as never);
        expect(back.format).toBe("GROUPS_KNOCKOUT");
        expect(back.title).toBe("גביע");
        expect(back.registrationClosesAt).toBe("2029-12-01T10:00");
    });
});
