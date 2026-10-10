export const optimizeProductImage = (url, width, quality = 90) => {
    if (!url || typeof url !== 'string') return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.hostname.includes('res.cloudinary.com') && parsed.pathname.includes('/upload/')) {
            const transformation = `f_auto,q_${quality},dpr_auto${width ? `,w_${width}` : ''}`;
            parsed.pathname = parsed.pathname.replace('/upload/', `/upload/${transformation}/`);
            return parsed.toString();
        }
        if (parsed.hostname.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format');
            parsed.searchParams.set('fit', width ? 'max' : 'clip');
            parsed.searchParams.set('q', String(quality));
            if (width) parsed.searchParams.set('w', String(width));
            return parsed.toString();
        }
    } catch {
        return url;
    }
    return url;
};
