import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDurationHM,
    splitDuration,
    buildDurationOptions,
    parseDecimalInput,
    nextWholeNumberInput,
} from './gameFormInput.ts';

test('formatDurationHM: hours to H:MM', () => {
    assert.equal(formatDurationHM(1), '1:00');
    assert.equal(formatDurationHM(2.5), '2:30');
    assert.equal(formatDurationHM(0.5), '0:30');
    assert.equal(formatDurationHM(1.25), '1:15');
    assert.equal(formatDurationHM(1.75), '1:45');
});

test('formatDurationHM: rounds to the minute and never shows :60', () => {
    assert.equal(formatDurationHM(1.999999), '2:00');
    assert.equal(formatDurationHM(1.1), '1:06');
});

test('formatDurationHM: invalid values give an empty label', () => {
    assert.equal(formatDurationHM(0), '');
    assert.equal(formatDurationHM(-1), '');
    assert.equal(formatDurationHM(NaN), '');
});

test('splitDuration: hours and minutes', () => {
    assert.deepEqual(splitDuration(2.5), { hours: 2, minutes: 30 });
    assert.deepEqual(splitDuration(0.5), { hours: 0, minutes: 30 });
    assert.deepEqual(splitDuration(1), { hours: 1, minutes: 0 });
    assert.deepEqual(splitDuration(1.999999), { hours: 2, minutes: 0 });
    assert.deepEqual(splitDuration(NaN), { hours: 0, minutes: 0 });
});

test('buildDurationOptions: 15-minute steps from 0:30 to 6:00', () => {
    const options = buildDurationOptions();
    assert.equal(options[0], 0.5);
    assert.equal(options[options.length - 1], 6);
    assert.equal(options.length, 23);
    assert.ok(options.includes(2.5));
    assert.ok(options.includes(1.25));
});

test('buildDurationOptions: every option is a finite number of hours (what onSelect receives)', () => {
    for (const option of buildDurationOptions(1.1)) {
        assert.equal(typeof option, 'number');
        assert.ok(Number.isFinite(option) && option > 0);
    }
    assert.equal(buildDurationOptions().find((o) => formatDurationHM(o) === '2:30'), 2.5);
});

test('buildDurationOptions: keeps an off-grid current value, in order, without duplicates', () => {
    assert.equal(buildDurationOptions(2.5).length, 23);
    const withOdd = buildDurationOptions(1.1);
    assert.equal(withOdd.length, 24);
    assert.deepEqual(withOdd.slice(2, 5), [1, 1.1, 1.25]);
    assert.equal(buildDurationOptions(0).length, 23);
    assert.equal(buildDurationOptions(NaN).length, 23);
});

test('parseDecimalInput: dot and comma separators', () => {
    assert.equal(parseDecimalInput('12.5'), 12.5);
    assert.equal(parseDecimalInput('12,5'), 12.5);
    assert.equal(parseDecimalInput('12'), 12);
    assert.equal(parseDecimalInput('0'), 0);
    assert.equal(parseDecimalInput(' 1,5 '), 1.5);
    assert.equal(parseDecimalInput('.5'), 0.5);
    assert.equal(parseDecimalInput('3.'), 3);
});

test('parseDecimalInput: rejects invalid input', () => {
    for (const bad of ['', ' ', 'abc', '-1', '1.2.3', '1,2,3', '1.2,3', '1e3', '.', ',', '12₪']) {
        assert.equal(parseDecimalInput(bad), null, bad);
    }
});

// Replays keystrokes one at a time the way a keyboard delivers them. '<' is backspace.
// `reset` = the TextInput re-asserts the controlled value after a rejected keystroke (React Native
// does); without it the native text keeps the rejected separator, which must still end up whole.
function type(keys, { reset = true, ...opts } = {}) {
    let value = '';
    let locked = false;
    let native = '';
    for (const key of keys) {
        const text = key === '<' ? native.slice(0, -1) : native + key;
        const result = nextWholeNumberInput(text, value, locked, opts);
        value = result.value;
        locked = result.locked;
        native = reset ? value : text;
    }
    return value;
}

test('whole number, typed key by key: a decimal never merges into the integer', () => {
    for (const reset of [true, false]) {
        assert.equal(type('12.5', { reset }), '12', `12.5 reset=${reset}`);
        assert.equal(type('12,5', { reset }), '12', `12,5 reset=${reset}`);
        assert.equal(type('1.5', { reset }), '1', `1.5 reset=${reset}`);
        assert.equal(type('1,5', { reset }), '1', `1,5 reset=${reset}`);
        assert.equal(type('12.50', { reset }), '12', `12.50 reset=${reset}`);
        assert.equal(type('.5', { reset }), '', `.5 reset=${reset}`);
    }
});

test('whole number, typed key by key: plain digits and noise', () => {
    assert.equal(type('14'), '14');
    assert.equal(type('1a2'), '12');
    assert.equal(type('007'), '007');
    assert.equal(type('1-2'), '12');
});

test('whole number, typed key by key: deleting unlocks the field', () => {
    assert.equal(type('12<3'), '13');
    assert.equal(type('12.<3'), '13');
    assert.equal(type('12.5<3'), '13');
    assert.equal(type('12.5<<3'), '3');
    assert.equal(type('1<'), '');
    assert.equal(type('12.<<<5'), '5');
});

test('whole number, pasted: keeps the integer part', () => {
    assert.equal(nextWholeNumberInput('12.5', '', false).value, '12');
    assert.equal(nextWholeNumberInput('12,5', '', false).value, '12');
    assert.equal(nextWholeNumberInput('25', '', false).value, '25');
    assert.equal(nextWholeNumberInput('3.75', '1', false).value, '3');
    assert.equal(nextWholeNumberInput('₪12', '', false).value, '12');
    assert.equal(nextWholeNumberInput('12.5', '', false).locked, false);
});

test('whole number, pasted thousands separator (price only)', () => {
    assert.equal(nextWholeNumberInput('1,000', '', false, { allowThousands: true }).value, '1000');
    assert.equal(nextWholeNumberInput('1,250,000', '', false, { allowThousands: true }).value, '1250000');
    assert.equal(nextWholeNumberInput('12,50', '', false, { allowThousands: true }).value, '12');
    assert.equal(nextWholeNumberInput('1,00', '', false, { allowThousands: true }).value, '1');
    assert.equal(nextWholeNumberInput('1,0000', '', false, { allowThousands: true }).value, '1');
    assert.equal(nextWholeNumberInput('1,000', '', false).value, '1');
});
