const DEVICE_ID_KEY = 'milano_customer_wallet_device_id';

export const getCustomerWalletId = () => {
    if (typeof window === 'undefined') return '';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        const random = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        deviceId = `milano-${random}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
};

export const normalizePhone = (value = '') => String(value)
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[^0-9+]/g, '');

export const isValidWalletPin = (pin) => /^[0-9]{4,6}$/.test(String(pin || ''));

export const hashWalletPin = async (pin) => {
    if (!isValidWalletPin(pin)) throw new Error('PIN_INVALID');
    const bytes = new TextEncoder().encode(`milano-wallet-v1:${pin}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const walletNumber = (value = 0) => Math.max(0, Number(value || 0)).toLocaleString('en-US');
