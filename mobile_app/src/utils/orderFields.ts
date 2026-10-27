interface HasId {
    id: string;
}

// Selected field first. If the selection isn't in `fields` (other city still loading, or past the
// page cap) it is prepended so it is always visible. Does not mutate `fields`.
export function orderFieldsWithSelectedFirst<T extends HasId>(fields: T[], selected: T | null | undefined): T[] {
    if (!selected) return fields;
    return [selected, ...fields.filter((f) => f.id !== selected.id)];
}
