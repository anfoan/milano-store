const ADMIN_PUSH_ENDPOINT = import.meta.env.VITE_ADMIN_PUSH_ENDPOINT || 'https://milano.admin.pages.dev/api/push/order';

export const notifyAdminOfNewOrder = (order, source = 'storefront') => {
  const payload = { order: { ...order, source, id: order.id || order.orderId } };
  return fetch(ADMIN_PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
};
