import { useState, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Check, ShoppingBag, Download, Star, Truck, MapPin, Package, FileText, ArrowLeft } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useSettings } from '../hooks/useSettings';
import InvoiceTemplate from '../components/InvoiceTemplate';

const OrderConfirmation = () => {
    const { t, direction, language } = useLanguage();
    const { formatPrice } = useCurrency();
    const { generalSettings, storeUrl, socialLinks } = useSettings();
    const location = useLocation();
    const orderData = location.state || {}; // { formData, cartItems, total, subTotal, discount, deliveryCost, orderId, date }

    const [downloading, setDownloading] = useState(false);

    // Fallback if accessed directly without data (optional)
    if (!orderData.orderId) {
        return (
            <div className="min-h-screen bg-[#111317] flex items-center justify-center text-white font-['Cairo']">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">{t('tracking.order_not_found')}</h2>
                    <Link to="/" className="text-brand-blue hover:underline">{t('tracking.return_home')}</Link>
                </div>
            </div>
        );
    }

    const { formData, cartItems, total, subTotal, discount, discountPercentage, deliveryCost, orderId, date, couponCode, currency } = orderData;

    const invoiceRef = useRef();

    const handleDownloadInvoice = async () => {
        if (!invoiceRef.current) return;
        try {
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2.5,
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: true,
                windowWidth: 1200,
                windowHeight: 1600,
                onclone: clonedDocument => {
                    const page = clonedDocument.querySelector('.invoice-preview-page');
                    if (page) {
                        page.style.width = '794px';
                        page.style.maxWidth = '794px';
                        page.style.margin = '0 auto';
                        page.style.height = 'auto';
                        page.style.minHeight = '0';
                    }
                    const card = clonedDocument.querySelector('[data-invoice-customer-card]');
                    if (card) {
                        card.style.fontSize = '16px';
                        card.querySelector('h3')?.style.setProperty('font-size', '20px', 'important');
                        card.querySelectorAll('span').forEach(span => {
                            span.style.setProperty('font-size', span.classList.contains('text-gray-500') ? '13px' : '16px', 'important');
                            span.style.setProperty('white-space', 'normal', 'important');
                            span.style.setProperty('overflow', 'visible', 'important');
                        });
                    }
                }
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imageHeight = (canvas.height * pdfWidth) / canvas.width;
            const fit = Math.min(1, (pdfHeight - 8) / imageHeight);
            const width = pdfWidth * fit;
            const height = imageHeight * fit;
            pdf.addImage(imgData, 'PNG', (pdfWidth - width) / 2, 4, width, height);
            pdf.save(`Milano-Invoice-${orderId.replace('#', '')}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("حدث خطأ أثناء تحميل الفاتورة.");
        }
    };

    const handleWhatsAppClick = async (e) => {
        e.preventDefault();
        if (downloading) return;
        setDownloading(true);

        const originalOverflow = document.body.style.overflow;
        const originalBg = document.body.style.backgroundColor;

        try {
            const element = invoiceRef.current;
            const parent = element.parentElement;

            parent.style.display = 'block';
            parent.style.position = 'fixed';
            parent.style.visibility = 'visible';
            parent.style.top = '0';
            parent.style.left = '0';
            parent.style.zIndex = '-9999';

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                allowTaint: true
            });

            parent.style.display = 'none';

            // WhatsApp number from admin settings (fallback if empty)
            const waLink = socialLinks?.whatsapp;
            const phone = !waLink ? "967783700707" : (waLink.includes('wa.me/') ? waLink.split('wa.me/')[1].split('?')[0] : waLink.replace(/\D/g, ''));
            const textMsg = encodeURIComponent(
                `مرحباً، أرغب في إكمال عملية الدفع ✅\n\n` +
                `📋 تفاصيل الطلب:\n` +
                `▪ رقم الطلب: ${orderId}\n` +
                `▪ تاريخ الطلب: ${date || new Date().toLocaleDateString('ar')}\n\n` +
                `👤 بيانات العميل:\n` +
                `▪ الاسم: ${formData.name}\n` +
                `▪ الهاتف: ${formData.phone}\n` +
                `▪ الدولة: ${formData.country}\n` +
                `▪ المدينة: ${formData.city}\n` +
                `▪ العنوان: ${formData.address}\n` +
                (formData.notes ? `▪ ملاحظات: ${formData.notes}\n\n` : `\n`) +
                `🛒 المنتجات:\n` +
                cartItems.map(item => {
                    const qty = item.quantity || 1;
                    const lineTotal = item.price * qty;
                    const sizePart = item.size ? `\n  المقاس: ${item.size}` : '';
                    return `▪ ${item.title}${sizePart}\n  الكمية: ${qty} × ${formatPrice(item.price, currency || 'YER')} = ${formatPrice(lineTotal, currency || 'YER')}`;
                }).join('\n') +
                `\n\n💰 ملخص الفاتورة:\n` +
                `▪ المجموع الفرعي: ${formatPrice(subTotal || total, currency || 'YER')}\n` +
                (() => {
                    const productDiscount = Number(discount || 0);
                    const couponDiscount = Math.round(Number(subTotal || 0) * (Number(discountPercentage || 0) / 100));
                    const totalD = productDiscount + couponDiscount;
                    return totalD > 0 ? `▪ الخصم: -${formatPrice(totalD, currency || 'YER')}\n` : '';
                })() +
                `▪ رسوم التوصيل: ${formatPrice(deliveryCost, currency || 'YER')}\n` +
                `▪ الإجمالي النهائي: ${formatPrice(total, currency || 'YER')}\n\n` +
                `▪ طريقة الدفع: واتساب`
            );
            
            const url = `whatsapp://send?phone=${phone}&text=${textMsg}`;
            const fallbackUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${textMsg}`;

            try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                const data = [new ClipboardItem({ [blob.type]: blob })];
                await navigator.clipboard.write(data);
            } catch (err) {
                console.error("Clipboard failed", err);
            }

            // Give mobile device extra time (1.2s) to finish clipboard write before redirection
            setTimeout(() => {
                window.location.href = url;
                setTimeout(() => {
                    if (document.hasFocus()) window.open(fallbackUrl, '_blank');
                }, 1000);
            }, 1200);

        } catch (error) {
            console.error("WhatsApp flow error:", error);
        } finally {
            setDownloading(false);
            document.body.style.overflow = originalOverflow;
            document.body.style.backgroundColor = originalBg;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white pb-24 font-['Cairo'] transition-colors duration-300">

            <div style={{ position: 'fixed', top: '-10000px', left: '-10000px' }}>
                <InvoiceTemplate ref={invoiceRef} orders={[{ ...orderData, id: orderId }]} lang={language} generalSettings={generalSettings} />
            </div>

            <div id="invoice-printable" className="pb-8">
                {/* 1. Header with Success Message */}
                <div className="bg-[#4f46e5] h-64 md:h-72 px-4 text-center relative overflow-hidden shadow-2xl">
                    {/* Back to Home Button */}
                    <Link
                        to="/"
                        className={`absolute top-8 z-30 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-sm border border-white/5 ${direction === 'rtl' ? 'right-6' : 'left-6'}`}
                    >
                        <ArrowLeft size={20} className="flip-rtl" />
                    </Link>
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10 h-full flex flex-col justify-center pb-8">
                        <div className="w-20 h-20 bg-[#22c55e] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-900/20 animate-bounce">
                            <Check size={40} className="text-white" strokeWidth={3} />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-white mb-2">{t('tracking.thanks')}</h1>
                        <p className="text-blue-100 font-bold text-sm md:text-base">{t('checkout.success_message')}</p>
                    </div>
                </div>

                <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-20 space-y-6">

                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                            <h3 className="font-black text-blue-500 dark:text-blue-400 flex items-center gap-2">
                                <Truck size={18} />
                                {t('tracking.track_order')}
                            </h3>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${storeUrl}/order-tracking/${orderId.replace('#', '')}`);
                                    alert(t('tracking.link_copied'));
                                }}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-500/20"
                            >
                                <span className="hidden md:inline">{t('tracking.copy_link')}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                            </button>
                        </div>

                        {/* Tracking Link Input */}
                        <div className="bg-gray-50 dark:bg-[#111317] border border-gray-200 dark:border-white/5 rounded-xl p-4 mb-6 flex items-center justify-between gap-4 font-mono text-sm text-gray-600 dark:text-gray-400 select-all">
                            <span className="truncate">{`${storeUrl}/order-tracking/${orderId.replace('#', '')}`}</span>
                        </div>

                        <div className="relative flex justify-between items-center px-2 md:px-6">
                            {/* Progress Bar Background */}
                            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 dark:bg-white/10 -z-10 -translate-y-1/2 rounded-full"></div>
                            {/* Active Progress */}
                            <div className="absolute top-1/2 right-0 w-[25%] h-1 bg-green-500 -z-10 -translate-y-1/2 rounded-full transition-all duration-1000 delay-500"></div>

                            {/* Steps */}
                            {[
                                { label: t('tracking.status_label.new'), active: true, icon: Check },
                                { label: t('tracking.status_label.processing'), active: false, icon: Package },
                                { label: t('tracking.status_label.shipping'), active: false, icon: Truck },
                                { label: t('tracking.status_label.completed'), active: false, icon: MapPin },
                            ].map((step, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-2">
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-colors ${step.active ? 'bg-green-500 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-gray-100 dark:bg-[#2b2d31] border-gray-200 dark:border-white/10 text-gray-500'}`}>
                                        <step.icon size={16} />
                                    </div>
                                    <span className={`text-[10px] md:text-xs font-bold ${step.active ? 'text-green-500' : 'text-gray-500'}`}>{step.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. Order Details Header */}
                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                            <h3 className="font-black text-blue-500 dark:text-blue-400 flex items-center gap-2">
                                <ShoppingBag size={18} />
                                {t('tracking.order_details')}
                            </h3>
                        </div>

                        {/* Product List Summary (Simplified) */}
                        <div className="space-y-4 mb-6">
                            {cartItems.map((item, idx) => (
                                <div key={idx} className="flex gap-4 bg-gray-50 dark:bg-[#111317] p-3 rounded-xl border border-gray-200 dark:border-white/5 transition-colors">
                                    <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0">
                                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-gray-900 dark:text-white font-bold text-sm mb-1">{item.title}</h4>
                                        <div className="flex items-center gap-3">
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">{t('tracking.qty')}: {item.quantity}</p>
                                            {item.size && <p className="text-blue-500 dark:text-blue-400 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 px-2 rounded">{item.size}</p>}
                                        </div>
                                        <div className="mt-1">
                                            <p className="text-[#16a34a] dark:text-[#4ADE80] font-bold text-sm">
                                                {formatPrice(item.price * (1 - (Number(discountPercentage || 0) / 100)), currency || 'YER')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Order Metadata Grid */}
                        <div className="bg-gray-50 dark:bg-[#111317] rounded-xl p-4 border border-gray-200 dark:border-white/5 space-y-3 transition-colors">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.payment_method')}</span>
                                <span className="text-gray-900 dark:text-white font-bold flex items-center gap-1">
                                    {formData.paymentMethod === 'cod' ? t('checkout.cod') : 'WhatsApp'}
                                    {formData.paymentMethod === 'cod' && <img src="https://cdn-icons-png.flaticon.com/512/5163/5163829.png" className="w-4 h-4 opacity-80 dark:invert" alt="" />}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.order_number')}</span>
                                <span className="text-gray-900 dark:text-white font-mono font-bold tracking-wider">{orderId}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.order_date')}</span>
                                <span className="text-gray-900 dark:text-white font-mono font-bold">{date}</span>
                            </div>
                        </div>
                    </div>

                    {/* 4. Customer Information */}
                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl space-y-4 transition-colors duration-300">
                        <h3 className="font-black text-blue-500 dark:text-blue-400 text-start mb-2 flex items-center gap-2">
                            <FileText size={18} />
                            {t('tracking.customer_info')}
                        </h3>

                        <div className="grid gap-2">
                            {/* Name */}
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.buyer_name')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData.name}</span>
                            </div>
                            {/* Phone */}
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.phone')}</span>
                                <span className="text-gray-900 dark:text-white font-mono font-bold">{formData.phone}</span>
                            </div>
                            {/* Country */}
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.country')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData.country}</span>
                            </div>
                            {/* City */}
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.city')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData.city}</span>
                            </div>
                            {/* Address */}
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.address')}</span>
                                <span className="text-gray-900 dark:text-white font-bold text-sm">{formData.address}</span>
                            </div>
                        </div>
                    </div>

                    {/* 5. Invoice Summary */}
                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <h3 className="font-black text-blue-500 dark:text-blue-400 mb-6 flex items-center gap-2 text-start">
                            <FileText size={18} />
                            {t('tracking.invoice_summary')}
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400 font-bold">{t('tracking.products_price')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">
                                    {formatPrice(subTotal || (total - (deliveryCost || 0) + (discount || 0)), currency || 'YER')}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2 font-bold">
                                    <span className="text-gray-500 dark:text-gray-400">{t('tracking.discount')}:</span>
                                    {couponCode && <span className="text-[10px] text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">#{couponCode}</span>}
                                    {(() => {
                                        const productDiscount = Number(discount || 0);
                                        const couponDiscount = Math.round(Number(subTotal || 0) * (Number(discountPercentage || 0) / 100));
                                        const totalD = productDiscount + couponDiscount;
                                        if (subTotal > 0 && totalD > 0) {
                                            return (
                                                <span className="text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800/50 font-black">
                                                    {(Math.round((totalD / subTotal) * 100))}%
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <span className="text-red-500 dark:text-red-400 font-bold">
                                    {(() => {
                                        const productDiscount = Number(discount || 0);
                                        const couponDiscount = Math.round(Number(subTotal || 0) * (Number(discountPercentage || 0) / 100));
                                        const totalD = productDiscount + couponDiscount;
                                        return totalD > 0 ? `- ${formatPrice(totalD, currency || 'YER')}` : '0';
                                    })()}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400 font-bold">{t('tracking.delivery_fees')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formatPrice(deliveryCost, currency || 'YER')}</span>
                            </div>
                            <div className="border-t border-gray-200 dark:border-white/10 pt-4 mt-4 flex justify-between text-lg text-blue-600 dark:text-brand-blue font-black transition-colors">
                                <span>{t('tracking.grand_total')}</span>
                                <span>{formatPrice(total, currency || 'YER')}</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 mt-6">
                {/* 6. Action Buttons */}
                <div className="space-y-3">
                    {formData.paymentMethod === 'whatsapp' && (
                        <button
                            onClick={handleWhatsAppClick}
                            disabled={downloading}
                            className={`w-full py-4 px-4 bg-[#25D366] rounded-xl text-white font-black flex items-center justify-center gap-3 hover:bg-[#128C7E] transition-all shadow-lg shadow-green-500/20 mb-3 active:scale-95 ${downloading ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className={`w-6 h-6 shrink-0 object-contain ${downloading ? 'animate-pulse' : ''}`} />
                                <span className="text-sm md:text-base leading-tight">{downloading ? 'جاري تجهيز الفاتورة...' : t('tracking.whatsapp_button')}</span>
                            </div>
                        </button>
                    )}
                    <Link to="/" className="w-full py-4 bg-[#6366f1] rounded-xl text-white font-black text-center flex items-center justify-center gap-2 hover:bg-[#4f46e5] transition-colors shadow-lg shadow-indigo-500/20">
                        <ShoppingBag size={20} />
                        {t('tracking.continue_shopping')}
                    </Link>

                    <button
                        onClick={handleDownloadInvoice}
                        className="w-full py-4 bg-white dark:bg-[#1a1d23] border border-gray-200 dark:border-white/10 rounded-xl text-blue-500 dark:text-blue-400 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-md dark:shadow-none"
                    >
                        <Download size={20} />
                        {t('tracking.download_invoice')}
                    </button>

                    <Link to="/rate-order" className="w-full py-4 bg-white dark:bg-[#1a1d23] border border-gray-200 dark:border-white/10 rounded-xl text-yellow-500 dark:text-yellow-400 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-md dark:shadow-none">
                        <Star size={20} fill="currentColor" />
                        {t('tracking.rate_store')}
                    </Link>
                </div>
            </div>

        </div >
    );
};

export default OrderConfirmation;
