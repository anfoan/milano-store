export const optimizeProductImage = (url, width, quality = 90, version) => {
    if (!url || typeof url !== 'string') return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.hostname.includes('res.cloudinary.com') && parsed.pathname.includes('/upload/')) {
            const transformation = `f_auto,q_${quality},dpr_auto${width ? `,w_${width}` : ''}`;
            parsed.pathname = parsed.pathname.replace('/upload/', `/upload/${transformation}/`);
            if (version) parsed.searchParams.set('v', String(version));
            return parsed.toString();
        }
        if (parsed.hostname.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format');
            parsed.searchParams.set('fit', width ? 'max' : 'clip');
            parsed.searchParams.set('q', String(quality));
            if (width) parsed.searchParams.set('w', String(width));
            if (version) parsed.searchParams.set('v', String(version));
            return parsed.toString();
        }
    } catch {
        return url;
    }
    return url;
};

const preloadedProductImages = new Set();

export const preloadProductImage = (url, version) => {
    const optimizedUrl = optimizeProductImage(url, 1200, 90, version);
    if (!optimizedUrl || preloadedProductImages.has(optimizedUrl)) return;
    preloadedProductImages.add(optimizedUrl);
    const image = new Image();
    image.decoding = 'async';
    image.src = optimizedUrl;
};
