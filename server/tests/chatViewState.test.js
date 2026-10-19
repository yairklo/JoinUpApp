const { setChatView, canSocketMarkRead } = require('../utils/chatViewState');

describe('chatViewState', () => {
  test('untracked sockets (mobile / old clients) keep legacy behaviour', () => {
    expect(canSocketMarkRead({}, 'r1')).toBe(true);
  });

  test('tracked socket counts reads only for rooms reported visible', () => {
    const data = {};
    setChatView(data, 'r1', false);
    expect(canSocketMarkRead(data, 'r1')).toBe(false);
    expect(canSocketMarkRead(data, 'r2')).toBe(false);
    setChatView(data, 'r1', true);
    expect(canSocketMarkRead(data, 'r1')).toBe(true);
    setChatView(data, 'r1', false);
    expect(canSocketMarkRead(data, 'r1')).toBe(false);
  });
});
