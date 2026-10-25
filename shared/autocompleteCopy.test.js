const { AUTOCOMPLETE_COPY } = require('./autocompleteCopy');

describe('autocomplete copy', () => {
  test('screen-reader labels are Hebrew, not the MUI English defaults', () => {
    expect(AUTOCOMPLETE_COPY).toEqual({
      openText: 'פתח',
      closeText: 'סגור',
      clearText: 'נקה',
      noOptionsText: 'אין אפשרויות',
      loadingText: 'טוען…',
    });
    const joined = Object.values(AUTOCOMPLETE_COPY).join(' ');
    expect(joined).not.toMatch(/\b(Open|Close|Clear|Loading|No options)\b/);
  });
});
