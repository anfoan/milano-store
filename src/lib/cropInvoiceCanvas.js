const isVisiblePixel = (data, index) => {
    const alpha = data[index + 3];
    if (alpha < 10) return false;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    return red < 245 || green < 245 || blue < 245;
};

/**
 * Produces a clean, full-height WhatsApp image with a moderate white frame.
 * The source is detected from its visible invoice content, so headers, logos,
 * totals and the footer remain inside the captured image on every screen size.
 */
export const cropInvoiceCanvasForWhatsApp = (canvas) => {
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

    const detectedWidth = maxX - minX + 1;
    const contentPadding = Math.max(80, Math.round(detectedWidth * 0.035));
    const topSafety = Math.round(contentPadding * 1.1);
    const bottomSafety = Math.round(contentPadding * 0.9);

    const left = Math.max(0, minX - contentPadding);
    const right = Math.min(canvas.width, maxX + contentPadding + 1);
    const top = Math.max(0, minY - topSafety);
    const bottom = Math.min(canvas.height, maxY + bottomSafety + 1);
    const sourceWidth = right - left;
    const sourceHeight = bottom - top;

    const frameX = Math.max(64, Math.round(contentPadding * 0.85));
    const frameTop = Math.round(contentPadding * 0.9);
    const frameBottom = Math.round(contentPadding * 0.8);
    const framed = document.createElement('canvas');
    framed.width = sourceWidth + frameX * 2;
    framed.height = sourceHeight + frameTop + frameBottom;

    const framedContext = framed.getContext('2d');
    framedContext.fillStyle = '#ffffff';
    framedContext.fillRect(0, 0, framed.width, framed.height);
    framedContext.drawImage(canvas, left, top, sourceWidth, sourceHeight, frameX, frameTop, sourceWidth, sourceHeight);

    const outputWidth = 1440;
    const outputHeight = Math.round(framed.height * outputWidth / framed.width);
    const output = document.createElement('canvas');
    output.width = outputWidth;
    output.height = outputHeight;

    const outputContext = output.getContext('2d');
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(framed, 0, 0, output.width, output.height);
    return output;
};
