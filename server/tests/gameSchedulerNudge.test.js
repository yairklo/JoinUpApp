const scheduler = require('../services/gameScheduler');

afterEach(() => {
  scheduler.stop();
  scheduler.setPublisher(null);
  scheduler.setReminderNudge(null);
});

describe('gameScheduler reminder nudges', () => {
  test('on the job leader a nudge calls the registered reminder driver', () => {
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.nudgeReminders();
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  test('on any other process a nudge is forwarded to the leader instead', () => {
    const publish = jest.fn();
    const nudge = jest.fn();
    scheduler.setPublisher(publish);
    scheduler.setReminderNudge(nudge); // a stale driver must not fire when not the runner
    scheduler.nudgeReminders();
    expect(publish).toHaveBeenCalledWith({ type: 'remindersReplan' });
    expect(nudge).not.toHaveBeenCalled();
  });

  test('the leader turns a forwarded signal into a local nudge (no re-publish ping-pong)', async () => {
    const publish = jest.fn();
    const nudge = jest.fn();
    scheduler.setPublisher(publish);
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    await scheduler.handleSignal({ type: 'remindersReplan' });
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  test('resyncGame nudges the reminder driver (a game write can move a reminder moment)', () => {
    const nudge = jest.fn();
    scheduler.init({ prisma: {}, io: null, notificationService: {} });
    scheduler.setReminderNudge(nudge);
    scheduler.resyncGame({ id: 'g1', status: 'CANCELLED', start: new Date(Date.now() + 3600e3) });
    expect(nudge).toHaveBeenCalled();
  });
});
