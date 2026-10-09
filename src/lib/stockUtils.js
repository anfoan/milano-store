export const getAvailableSizeValues = (product) => {
    const values = product?.variants?.find((variant) => variant.type === 'size')?.values || [];
    if (!product?.sizeStocks || typeof product.sizeStocks !== 'object') return values;
    return values.filter((size) => Number(product.sizeStocks[size] || 0) > 0);
};

export const getAvailableStock = (product) => {
    if (product?.sizeStocks && typeof product.sizeStocks === 'object' && Object.keys(product.sizeStocks).length > 0) {
        return Object.values(product.sizeStocks).reduce((total, quantity) => total + Math.max(0, Number(quantity) || 0), 0);
    }
    return Math.max(0, Number(product?.stock) || 0);
};

export const hasAvailableStock = (product) => getAvailableStock(product) > 0;
