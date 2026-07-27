import type { Notification } from '@/services/api/notifications';
import i18n from '@/i18n';

export type RawNotification = {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  message?: string;
  text?: string;
  read?: boolean;
  createdAt?: string;
  data?: Record<string, unknown>;
  roomId?: string;
  chatId?: string;
  senderId?: string;
};

const CHAT_TYPE_VALUES = new Set(['message', 'NEW_MESSAGE', 'CHAT_MESSAGE', 'chat_message']);

/** True for ephemeral socket chat alerts and persisted NEW_MESSAGE rows. */
export function isChatNotification(raw: RawNotification): boolean {
  const type = String(raw.type || '').trim();
  const typeUpper = type.toUpperCase();
  if (CHAT_TYPE_VALUES.has(type) || typeUpper === 'NEW_MESSAGE' || typeUpper === 'MESSAGE') {
    return true;
  }
  return !!(raw.roomId || raw.chatId || raw.data?.chatId || raw.data?.roomId);
}

export function getChatId(raw: RawNotification): string | undefined {
  const id = raw.data?.chatId || raw.data?.roomId || raw.roomId || raw.chatId;
  return id ? String(id) : undefined;
}

/** Stable list key — never returns undefined. */
export function getNotificationKey(raw: RawNotification, index = 0): string {
  if (raw.id) return String(raw.id);

  const chatId = getChatId(raw);
  const createdAt = raw.createdAt || '';
  const sender = String(raw.data?.senderId || raw.senderId || '');
  const type = raw.type || 'unknown';
  const preview = String(raw.body || raw.message || raw.text || '').slice(0, 24);

  if (chatId) {
    return `chat-${chatId}-${createdAt || preview}-${sender || index}`;
  }
  return `notif-${type}-${createdAt || preview || index}`;
}

/** Prefer English title/body from payload when the app locale is English. */
export function resolveNotificationCopy(raw: RawNotification): { title: string; body: string } {
  const isEn = String(i18n.language || '').toLowerCase().startsWith('en');
  const data = raw.data || {};
  const titleEn = typeof data.titleEn === 'string' ? data.titleEn.trim() : '';
  const bodyEn = typeof data.bodyEn === 'string' ? data.bodyEn.trim() : '';

  const isChat = isChatNotification(raw);
  const fallbackTitle = isChat ? 'הודעה חדשה' : 'התראה';
  const fallbackBody = isChat ? 'הודעה חדשה בצ\'אט' : '';

  if (isEn && titleEn) {
    return {
      title: titleEn,
      body: bodyEn || String(raw.body || raw.message || raw.text || '').trim(),
    };
  }

  return {
    title: (raw.title?.trim() || fallbackTitle),
    body: String(raw.body || raw.message || raw.text || fallbackBody).trim(),
  };
}

export function normalizeNotification(raw: RawNotification, index = 0): Notification {
  const id = getNotificationKey(raw, index);
  const isChat = isChatNotification(raw);
  const chatId = getChatId(raw);
  const { title, body } = resolveNotificationCopy(raw);

  let createdAt = raw.createdAt;
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) {
    createdAt = new Date().toISOString();
  }

  const data: Notification['data'] = {
    ...(raw.data as Notification['data']),
    chatId,
    link: (raw.data?.link as string) || (chatId ? `/chat/${chatId}` : undefined),
    gameId: raw.data?.gameId as string | undefined,
    senderId: (raw.data?.senderId as string) || raw.senderId,
  };

  return {
    id,
    type: raw.type || (isChat ? 'NEW_MESSAGE' : 'GENERIC'),
    title,
    body,
    read: !!raw.read,
    createdAt,
    data,
  };
}

export function formatNotificationDate(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

/** Only persisted DB notifications can be marked read via API. */
export function isPersistedNotificationId(id: string): boolean {
  return !id.startsWith('chat-') && !id.startsWith('notif-');
}
