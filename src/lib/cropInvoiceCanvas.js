const isVisiblePixel = (data, index) => {
    const alpha = data[index + 3];
    if (alpha < 10) return false;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    return red < 245 || green < 245 || blue < 245;
};

/**
 * Removes only the outer blank canvas around the invoice image used for WhatsApp.
 * Balanced white padding is retained so the design does not touch any image edge.
 */
export const cropInvoiceCanvasForWhatsApp = (canvas, padding = 52) => {
    if (!canvas || !canvas.width || !canvas.height) return canvas;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return canvas;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            if (!isVisiblePixel(data, (y * canvas.width + x) * 4)) continue;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < 0 || maxY < 0) return canvas;

    const left = Math.max(0, minX - padding);
    const top = Math.max(0, minY - padding);
    const right = Math.min(canvas.width, maxX + padding + 1);
    const bottom = Math.min(canvas.height, maxY + padding + 1);
    const cropped = document.createElement('canvas');
    cropped.width = right - left;
    cropped.height = bottom - top;

    const croppedContext = cropped.getContext('2d');
    croppedContext.fillStyle = '#ffffff';
    croppedContext.fillRect(0, 0, cropped.width, cropped.height);
    croppedContext.drawImage(
        canvas,
        left,
        top,
        cropped.width,
        cropped.height,
        0,
        0,
        cropped.width,
        cropped.height
    );

    return cropped;
};
