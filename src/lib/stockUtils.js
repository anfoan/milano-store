export const toStockNumber = (value) => {
    const normalized = String(value ?? '')
        .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
        .replace(/,/g, '')
        .trim();
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
};

export const normalizeSize = (value) => String(value ?? '')
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/^\s*مقاس\s*/i, '')
    .replace(/[：:]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

export const getSizeStock = (product, requestedSize) => {
    const stocks = product?.sizeStocks;
    if (!stocks || typeof stocks !== 'object') return toStockNumber(product?.stock);
    const exact = Object.prototype.hasOwnProperty.call(stocks, requestedSize) ? requestedSize : Object.keys(stocks).find(key => normalizeSize(key) === normalizeSize(requestedSize));
    return exact == null ? 0 : Math.max(0, toStockNumber(stocks[exact]));
};

export const getAvailableSizeValues = (product) => {
    const values = product?.variants?.find((variant) => variant.type === 'size')?.values || [];
    if (!product?.sizeStocks || typeof product.sizeStocks !== 'object') return values;
    return values.filter((size) => getSizeStock(product, size) > 0);
};

export const getAvailableStock = (product) => {
    if (product?.sizeStocks && typeof product.sizeStocks === 'object' && Object.keys(product.sizeStocks).length > 0) {
        return Object.values(product.sizeStocks).reduce((total, quantity) => total + Math.max(0, toStockNumber(quantity)), 0);
    }
    return Math.max(0, toStockNumber(product?.stock));
};

export const hasAvailableStock = (product) => getAvailableStock(product) > 0;
