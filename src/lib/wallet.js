const DEVICE_ID_KEY = 'milano_customer_wallet_device_id';
const PHONE_WALLET_ID_KEY = 'milano_customer_wallet_phone_id';

export const getCustomerWalletId = () => {
    if (typeof window === 'undefined') return '';
    const phoneWalletId = localStorage.getItem(PHONE_WALLET_ID_KEY);
    if (phoneWalletId) return phoneWalletId;
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


export const getPhoneWalletId = (value = '') => {
    const digits = normalizePhone(value).replace(/[^0-9]/g, '');
    const phone = digits.startsWith('967') && digits.length === 12 ? digits.slice(3) : digits;
    return phone.length >= 7 ? `phone-${phone}` : '';
};

export const setCustomerPhoneWalletId = (value = '') => {
    const walletId = getPhoneWalletId(value);
    if (walletId && typeof window !== 'undefined') {
        localStorage.setItem(PHONE_WALLET_ID_KEY, walletId);
        window.dispatchEvent(new Event('milano-wallet-session-changed'));
    }
    return walletId;
};

export const clearCustomerPhoneWalletId = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(PHONE_WALLET_ID_KEY);
        window.dispatchEvent(new Event('milano-wallet-session-changed'));
    }
    return getCustomerWalletId();
};

export const isValidWalletPin = (pin) => /^[0-9]{4,6}$/.test(String(pin || ''));

export const hashWalletPin = async (pin) => {
    if (!isValidWalletPin(pin)) throw new Error('PIN_INVALID');
    const bytes = new TextEncoder().encode(`milano-wallet-v1:${pin}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const walletNumber = (value = 0) => Math.max(0, Number(value || 0)).toLocaleString('en-US');
