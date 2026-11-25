const toWesternDigits = (value) => String(value ?? '').replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const arabicIndex = arabic.indexOf(digit);
    return String(arabicIndex >= 0 ? arabicIndex : persian.indexOf(digit));
});

export const YEMEN_PHONE_PREFIXES = ['77', '78', '73', '72', '71', '70'];

export const normalizeYemenPhone = (value) => {
    let digits = toWesternDigits(value).replace(/\D/g, '');
    if (digits.startsWith('00967')) digits = digits.slice(5);
    if (digits.startsWith('967') && digits.length > 9) digits = digits.slice(3);
    return digits;
};

export const isValidYemenPhone = (value) => {
    const digits = normalizeYemenPhone(value);
    return digits.length === 9 && YEMEN_PHONE_PREFIXES.some((prefix) => digits.startsWith(prefix));
};

export const sanitizeYemenPhoneInput = (value) => {
    const digits = normalizeYemenPhone(value).slice(0, 9);
    if (!digits || digits === '7') return digits;
    if (digits[0] !== '7') return '';
    if (digits.length >= 2 && !YEMEN_PHONE_PREFIXES.some((prefix) => digits.startsWith(prefix))) return digits.slice(0, 1);
    return digits;
};
