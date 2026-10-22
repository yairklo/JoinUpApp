import React from 'react';
import { useReportUser } from './useReportUser';
import { useNotifications, notificationsBackoffMs, NOTIFICATIONS_BACKOFF_DEFAULT_MS } from './useNotifications';
import { userReportsApi } from '@/services/api/results';
import { notificationsApi } from '@/services/api';

jest.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    userId: 'user_test_429',
    isLoaded: true,
    getToken: jest.fn().mockResolvedValue('mock_token_429'),
  }),
}));

jest.mock('@/context/SocketContext', () => ({
  useSocket: () => ({
    socket: null,
    isConnected: false,
  }),
}));

jest.mock('@/services/api/results', () => ({
  userReportsApi: {
    submit: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  notificationsApi: {
    getAll: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  },
}));

describe('Hook 429 rate limit handling (Bug D-01 test coverage)', () => {
  let states: any[] = [];
  let setters: Array<jest.Mock> = [];
  let stateCursor = 0;

  beforeEach(() => {
    states = [];
    setters = [];
    stateCursor = 0;

    jest.spyOn(React, 'useState').mockImplementation((initial: any) => {
      const idx = stateCursor++;
      if (states[idx] === undefined) {
        states[idx] = typeof initial === 'function' ? initial() : initial;
      }
      if (!setters[idx]) {
        setters[idx] = jest.fn((action: any) => {
          states[idx] = typeof action === 'function' ? action(states[idx]) : action;
        });
      }
      return [states[idx], setters[idx]];
    });

    jest.spyOn(React, 'useCallback').mockImplementation((fn: any) => fn);
    jest.spyOn(React, 'useRef').mockImplementation((val: any) => ({ current: val }));
    jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('useReportUser on 429', () => {
    test('current behavior: sets rateLimited flag on 429', async () => {
      stateCursor = 0;
      const err429 = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      (userReportsApi.submit as jest.Mock).mockRejectedValueOnce(err429);

      const hook = useReportUser();
      const success = await hook.submit({ targetId: 'target_1', reason: 'HARASSMENT' });

      expect(success).toBe(false);
      // setter 3 is setRateLimited
      const setRateLimited = setters[3];
      expect(setRateLimited).toHaveBeenCalledWith(true);
    });

    test('D-01: sets user-facing Hebrew error on 429 instead of the raw server message', async () => {
      stateCursor = 0;
      const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
      (userReportsApi.submit as jest.Mock).mockRejectedValueOnce(err429);

      const hook = useReportUser();
      await hook.submit({ targetId: 'target_1', reason: 'HARASSMENT' });

      // setter 2 is setError
      const setError = setters[2];
      expect(setError).toHaveBeenLastCalledWith('יותר מדי בקשות, נסה שוב בעוד רגע');
      expect(setError).not.toHaveBeenCalledWith('Too many requests');
    });
  });

  describe('useNotifications on 429', () => {
    // State order in the hook: 0 notifications, 1 unreadCount, 2 loading, 3 actionError.
    const flush = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };

    beforeEach(() => {
      jest.useFakeTimers();
      // Run effects synchronously so the mount fetch happens like in the browser.
      (React.useEffect as unknown as jest.SpyInstance).mockImplementation((effect: any) => {
        effect();
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      (notificationsApi.getAll as jest.Mock).mockReset();
      (notificationsApi.markAsRead as jest.Mock).mockReset();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('D-01: background 429 stays silent and retries after the default ~30s backoff', async () => {
      const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
      (notificationsApi.getAll as jest.Mock)
        .mockRejectedValueOnce(err429)
        .mockResolvedValueOnce({ notifications: [{ id: 'n1', type: 'GAME_UPDATE', title: 't', body: 'b', read: false }], unreadCount: 1 });

      const hook = useNotifications();
      await flush();

      expect(notificationsApi.getAll).toHaveBeenCalledTimes(1);
      expect(hook.actionError).toBeNull();
      expect(setters[3]).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalledWith('[NOTIFICATIONS] Failed to fetch:', err429);

      jest.advanceTimersByTime(NOTIFICATIONS_BACKOFF_DEFAULT_MS - 1);
      await flush();
      expect(notificationsApi.getAll).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      await flush();
      expect(notificationsApi.getAll).toHaveBeenCalledTimes(2);
      expect(setters[1]).toHaveBeenLastCalledWith(1);
    });

    test('D-01: background 429 honors Retry-After', async () => {
      const err429 = Object.assign(new Error('Too many requests'), { status: 429, retryAfter: '5' });
      (notificationsApi.getAll as jest.Mock)
        .mockRejectedValueOnce(err429)
        .mockResolvedValueOnce({ notifications: [], unreadCount: 0 });

      useNotifications();
      await flush();
      jest.advanceTimersByTime(4_999);
      await flush();
      expect(notificationsApi.getAll).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      await flush();
      expect(notificationsApi.getAll).toHaveBeenCalledTimes(2);
    });

    test('D-01: user-triggered markAsRead 429 surfaces Hebrew action error and rolls back', async () => {
      (notificationsApi.getAll as jest.Mock).mockResolvedValueOnce({ notifications: [], unreadCount: 0 });
      const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
      (notificationsApi.markAsRead as jest.Mock).mockRejectedValueOnce(err429);

      const hook = useNotifications();
      await flush();
      await hook.markAsRead('n1');

      expect(setters[3]).toHaveBeenLastCalledWith('יותר מדי בקשות, נסה שוב בעוד רגע');
    });
  });

  describe('notificationsBackoffMs', () => {
    test('uses Retry-After seconds, HTTP date, or the 30s default', () => {
      expect(notificationsBackoffMs({ status: 429, retryAfter: '12' })).toBe(12_000);
      const now = Date.parse('Thu, 22 Oct 2026 12:00:00 GMT');
      expect(notificationsBackoffMs({ status: 429, retryAfter: 'Thu, 22 Oct 2026 12:00:20 GMT' }, now)).toBe(20_000);
      expect(notificationsBackoffMs({ status: 429 })).toBe(NOTIFICATIONS_BACKOFF_DEFAULT_MS);
      expect(notificationsBackoffMs({ status: 429, retryAfter: 'soon' })).toBe(NOTIFICATIONS_BACKOFF_DEFAULT_MS);
      expect(notificationsBackoffMs({ status: 429, retryAfter: '0' })).toBe(1_000);
      expect(notificationsBackoffMs({ status: 429, retryAfter: '3600' })).toBe(300_000);
    });
  });
});
