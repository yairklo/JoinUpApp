import React from 'react';
import { useReportUser } from './useReportUser';
import { useNotifications } from './useNotifications';
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

    test.failing('D-01 missing behavior: useReportUser should set user-facing Hebrew error on 429 instead of raw message', async () => {
      stateCursor = 0;
      const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
      (userReportsApi.submit as jest.Mock).mockRejectedValueOnce(err429);

      const hook = useReportUser();
      await hook.submit({ targetId: 'target_1', reason: 'HARASSMENT' });

      // setter 2 is setError
      const setError = setters[2];
      // Expected Hebrew copy from apiError.getActionErrorMessage: "יותר מדי בקשות, נסה שוב בעוד רגע"
      // Current implementation passes e.message ("Too many requests"), so this test fails, noting bug D-01
      expect(setError).toHaveBeenCalledWith("יותר מדי בקשות, נסה שוב בעוד רגע");
    });
  });

  describe('useNotifications on 429', () => {
    test.failing('D-01 missing behavior: useNotifications should backoff/retry or expose rate limit error on 429', async () => {
      stateCursor = 0;
      const err429 = Object.assign(new Error('Too many requests'), { status: 429 });
      (notificationsApi.getAll as jest.Mock).mockRejectedValueOnce(err429);

      const hook = useNotifications();
      // useNotifications currently only catches and console.error, with no error state or backoff
      // We assert that an error state or retry mechanism is provided
      expect((hook as any).error).toBeDefined();
    });
  });
});
