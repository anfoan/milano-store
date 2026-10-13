export const formatOrderId = (value = '') => String(value || '').replace(/^#+/, '').trim();
