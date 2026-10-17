import html2canvas from 'html2canvas';
import { cropInvoiceCanvasForWhatsApp } from './cropInvoiceCanvas';

const CAPTURE_WIDTH = 794;
const CAPTURE_SCALE = 4;

const waitForInvoiceImages = async (element) => {
    const images = Array.from(element?.querySelectorAll?.('img') || []);
    await Promise.all(images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        });
    }));
};

const prepareClonedInvoice = (clonedDocument) => {
    const clonedHtml = clonedDocument.documentElement;
    const clonedBody = clonedDocument.body;
    const clonedContainer = clonedDocument.querySelector('.print-container');
    const clonedPage = clonedDocument.querySelector('.invoice-preview-page');

    clonedHtml.style.setProperty('width', `${CAPTURE_WIDTH}px`, 'important');
    clonedHtml.style.setProperty('min-width', `${CAPTURE_WIDTH}px`, 'important');
    clonedBody.style.setProperty('width', `${CAPTURE_WIDTH}px`, 'important');
    clonedBody.style.setProperty('min-width', `${CAPTURE_WIDTH}px`, 'important');
    clonedBody.style.setProperty('margin', '0', 'important');
    clonedBody.style.setProperty('padding', '0', 'important');
    clonedBody.style.setProperty('background', '#ffffff', 'important');

    clonedDocument.querySelectorAll('[data-html2canvas-ignore="true"], .invoice-preview-toolbar').forEach(node => node.remove());

    if (clonedContainer) {
        clonedContainer.style.setProperty('display', 'block', 'important');
        clonedContainer.style.setProperty('width', `${CAPTURE_WIDTH}px`, 'important');
        clonedContainer.style.setProperty('max-width', `${CAPTURE_WIDTH}px`, 'important');
        clonedContainer.style.setProperty('margin', '0', 'important');
        clonedContainer.style.setProperty('padding', '0', 'important');
    }

    if (clonedPage) {
        clonedPage.style.setProperty('display', 'flex', 'important');
        clonedPage.style.setProperty('width', `${CAPTURE_WIDTH}px`, 'important');
        clonedPage.style.setProperty('max-width', `${CAPTURE_WIDTH}px`, 'important');
        clonedPage.style.setProperty('min-height', '0', 'important');
        clonedPage.style.setProperty('height', 'auto', 'important');
        clonedPage.style.setProperty('margin', '0', 'important');
        clonedPage.style.setProperty('padding', '24px 32px', 'important');
        clonedPage.style.setProperty('border-radius', '0', 'important');
        clonedPage.style.setProperty('box-shadow', 'none', 'important');
        clonedPage.style.setProperty('overflow', 'visible', 'important');
        clonedPage.style.setProperty('background', '#ffffff', 'important');
    }
};

export const createWhatsAppInvoiceBlob = async (element) => {
    if (!element) throw new Error('INVOICE_CAPTURE_ELEMENT_MISSING');

    if (document.fonts?.ready) await document.fonts.ready;
    await waitForInvoiceImages(element);

    const canvas = await html2canvas(element, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: CAPTURE_WIDTH,
        windowHeight: Math.max(1600, element.scrollHeight + 160),
        onclone: prepareClonedInvoice,
    });

    const output = cropInvoiceCanvasForWhatsApp(canvas);
    return new Promise((resolve, reject) => {
        output.toBlob(blob => blob ? resolve(blob) : reject(new Error('INVOICE_IMAGE_CREATION_FAILED')), 'image/png');
    });
};
