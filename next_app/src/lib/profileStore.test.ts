import { createProfileStore } from './profileStore';

const make = () => {
    const timers: Array<() => void> = [];
    const store = createProfileStore(1000, (fn) => { timers.push(fn); });
    return { store, runTimers: () => timers.splice(0).forEach((f) => f()) };
};

describe('profileStore', () => {
    it('signIn asks for a load once per user', () => {
        const { store } = make();
        expect(store.signIn('a')).toBe(true);
        expect(store.signIn('a')).toBe(false);
    });

    it('applyLoaded fills name and imageUrl (empty -> null)', () => {
        const { store } = make();
        store.signIn('a');
        store.applyLoaded('a', { name: 'Dana', imageUrl: '' });
        expect(store.getSnapshot()).toEqual({ userId: 'a', name: 'Dana', imageUrl: null });
    });

    it('drops a stale response after the user switched', () => {
        const { store } = make();
        store.signIn('a');
        store.signIn('b');
        store.applyLoaded('a', { name: 'A', imageUrl: 'x' });
        expect(store.getSnapshot()).toMatchObject({ userId: 'b', name: undefined, imageUrl: undefined });
    });

    it('does not carry user a values over to user b', () => {
        const { store } = make();
        store.signIn('a');
        store.applyLoaded('a', { name: 'A', imageUrl: 'x' });
        expect(store.signIn('b')).toBe(true);
        expect(store.getSnapshot()).toMatchObject({ name: undefined, imageUrl: undefined });
    });

    it('keeps a value notified before sign-in and does not overwrite it on load', () => {
        const { store } = make();
        store.setAvatar('new.png');
        expect(store.signIn('a')).toBe(true); // name still unknown
        store.applyLoaded('a', { name: 'Dana', imageUrl: 'old.png' });
        expect(store.getSnapshot()).toEqual({ userId: 'a', name: 'Dana', imageUrl: 'new.png' });
    });

    it('a notify after sign-in but before the response wins over the response', () => {
        const { store } = make();
        store.signIn('a');
        store.setName('Edited');
        store.applyLoaded('a', { name: 'Old', imageUrl: null });
        expect(store.getSnapshot().name).toBe('Edited');
    });

    it('signOut resets, and ignores a late response', () => {
        const { store } = make();
        store.signIn('a');
        store.signOut();
        store.applyLoaded('a', { name: 'A', imageUrl: 'x' });
        expect(store.getSnapshot()).toEqual({ userId: null, name: undefined, imageUrl: undefined });
    });

    it('retries after a failed load', () => {
        const { store, runTimers } = make();
        store.signIn('a');
        store.loadFailed('a');
        expect(store.signIn('a')).toBe(false); // not yet
        runTimers();
        expect(store.getSnapshot().userId).toBeNull();
        expect(store.signIn('a')).toBe(true);
    });

    it('does not reset on retry timer when the load succeeded meanwhile', () => {
        const { store, runTimers } = make();
        store.signIn('a');
        store.loadFailed('a');
        store.applyLoaded('a', { name: 'A', imageUrl: null });
        runTimers();
        expect(store.getSnapshot().userId).toBe('a');
    });

    it('notifies subscribers', () => {
        const { store } = make();
        const l = jest.fn();
        const off = store.subscribe(l);
        store.setName('x');
        off();
        store.setName('y');
        expect(l).toHaveBeenCalledTimes(1);
    });
});
