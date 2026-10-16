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
    const horizontalPadding = padding;
    const topPadding = 140;
    const bottomPadding = 84;
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

    const left = Math.max(0, minX - horizontalPadding);
    const right = Math.min(canvas.width, maxX + horizontalPadding + 1);
    // Preserve the complete captured invoice vertically. Automatic minY/maxY
    // cropping was cutting the header and footer before the margin was added.
    const top = 0;
    const bottom = canvas.height;
    const sourceWidth = right - left;
    const sourceHeight = bottom - top;
    const cropped = document.createElement('canvas');
    // Keep a real outer margin even when the detected invoice touches the
    // original canvas edge; clamping the source bounds must not clip the design.
    cropped.width = sourceWidth + horizontalPadding * 2;
    cropped.height = sourceHeight + topPadding + bottomPadding;

    const croppedContext = cropped.getContext('2d');
    croppedContext.fillStyle = '#ffffff';
    croppedContext.fillRect(0, 0, cropped.width, cropped.height);
    croppedContext.drawImage(
        canvas,
        left,
        top,
        sourceWidth,
        sourceHeight,
        horizontalPadding,
        topPadding,
        sourceWidth,
        sourceHeight
    );

    const outputWidth = 1080;
    const outputHeight = Math.round(cropped.height * outputWidth / cropped.width);
    const output = document.createElement('canvas');
    output.width = outputWidth;
    output.height = outputHeight;
    const outputContext = output.getContext('2d');
    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, output.width, output.height);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(cropped, 0, 0, output.width, output.height);
    return output;
};
