export interface NotificationTarget {
  screen: string;
  detail?: string | null;
}

const screenByKind: Record<string, string> = {
  proposals: 'proposals',
  contracts: 'contracts',
  orders: 'orders',
  documents: 'documents',
  invoices: 'finance',
  payments: 'finance',
  finance: 'finance',
  tickets: 'support',
  support: 'support'
};

/**
 * Returns the canonical portal destination for a server notification.
 * Notifications created before targets were persisted are supported through
 * the kind/recordId fallback so old records remain actionable.
 */
export function notificationTarget(notification: any): NotificationTarget | null {
  if (notification?.target?.screen) {
    return {
      screen: String(notification.target.screen),
      detail: notification.target.detail == null ? null : String(notification.target.detail)
    };
  }

  const kind = String(notification?.kind || '').toLowerCase();
  const screen = screenByKind[kind];
  if (!screen) return null;

  const recordId = notification?.recordId == null ? '' : String(notification.recordId);
  const code = notification?.recordCode || notification?.code;
  const detail = code
    ? String(code)
    : kind === 'orders' && recordId
      ? `OS${recordId}`
      : ['tickets', 'support'].includes(kind) && recordId
        ? `TCK${recordId}`
        : recordId || null;
  return { screen, detail };
}

