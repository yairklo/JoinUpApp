import test from 'node:test';
import assert from 'node:assert/strict';
import { orderFieldsWithSelectedFirst } from './orderFields.ts';

const f = (id) => ({ id, name: id });

test('orderFields: no selection returns list unchanged', () => {
    const list = [f('a'), f('b')];
    assert.equal(orderFieldsWithSelectedFirst(list, null), list);
});

test('orderFields: moves selected to the front, keeps the rest in order', () => {
    const out = orderFieldsWithSelectedFirst([f('a'), f('b'), f('c')], f('c'));
    assert.deepEqual(out.map((x) => x.id), ['c', 'a', 'b']);
});

test('orderFields: prepends a selection missing from the list', () => {
    const out = orderFieldsWithSelectedFirst([f('a')], f('z'));
    assert.deepEqual(out.map((x) => x.id), ['z', 'a']);
});

test('orderFields: does not mutate input', () => {
    const list = [f('a'), f('b')];
    orderFieldsWithSelectedFirst(list, f('b'));
    assert.deepEqual(list.map((x) => x.id), ['a', 'b']);
});
