const { messageTickKind, markFailed, markPending, discardFailed, applyStatusUpdate } = require('./chatSend');

test('tick kind never implies delivery for blocked/rejected/unknown', () => {
  expect(messageTickKind('pending')).toBe('single');
  expect(messageTickKind('sent')).toBe('double');
  expect(messageTickKind('delivered')).toBe('double');
  expect(messageTickKind('read')).toBe('read');
  expect(messageTickKind('failed')).toBe('error');
  for (const s of ['blocked', 'rejected', undefined, 'weird']) expect(messageTickKind(s)).toBe('none');
});

test('markFailed only touches a still-pending message', () => {
  const msgs = [{ id: 1, status: 'pending' }, { id: 2, status: 'sent' }];
  expect(markFailed(msgs, 1)[0]).toMatchObject({ status: 'failed', retryable: true });
  expect(markFailed(msgs, 2)[1].status).toBe('sent');
  expect(markFailed(msgs, '1', false)[0].retryable).toBe(false);
});

test('retry only for retryable failed messages; discard only removes failed', () => {
  const msgs = [{ id: 1, status: 'failed', retryable: true }, { id: 2, status: 'failed', retryable: false }, { id: 3, status: 'sent' }];
  expect(markPending(msgs, 1)[0].status).toBe('pending');
  expect(markPending(msgs, 2)[1].status).toBe('failed');
  expect(discardFailed(msgs, 3)).toHaveLength(3);
  expect(discardFailed(msgs, 2).map((m) => m.id)).toEqual([1, 3]);
});

test('status updates skip unconfirmed, failed, blocked and read messages', () => {
  const msgs = ['pending', 'failed', 'blocked', 'read', 'sent'].map((status, i) => ({ id: i, status, userId: 'me' }));
  msgs.push({ id: 9, status: 'sent', userId: 'other' });
  expect(applyStatusUpdate(msgs, 'me', 'delivered').map((m) => m.status))
    .toEqual(['pending', 'failed', 'blocked', 'read', 'delivered', 'sent']);
});
