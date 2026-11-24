const ADMIN_PUSH_ENDPOINT = import.meta.env.VITE_ADMIN_PUSH_ENDPOINT || 'https://milano.admin.pages.dev/api/push/order';
const ADMIN_PUSH_EVENT_ENDPOINT = import.meta.env.VITE_ADMIN_PUSH_EVENT_ENDPOINT || 'https://milano.admin.pages.dev/api/push/event';

export const notifyAdminOfNewOrder = (order, source = 'storefront') => {
  const payload = { order: { ...order, source, id: order.id || order.orderId } };
  return fetch(ADMIN_PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
};

export const notifyAdminOfNewMessage = (message) => {
  if (!message?.id) return Promise.resolve();
  return fetch(ADMIN_PUSH_EVENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      message: { id: message.id, name: message.name, subject: message.subject }
    }),
    keepalive: true
  }).catch(() => undefined);
};
