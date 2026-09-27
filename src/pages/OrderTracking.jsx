import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Check, ShoppingBag, Download, Star, Truck, MapPin, Package, FileText, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useSettings } from '../hooks/useSettings';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import InvoiceTemplate from '../components/InvoiceTemplate';

const OrderTracking = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(null);
    const invoiceRef = useRef();
    const { t, direction, language } = useLanguage();
    const { formatPrice } = useCurrency();
    const { generalSettings, storeUrl, socialLinks } = useSettings();

    useEffect(() => {
        let unsubscribe = () => { };

        const setupRealtimeListener = async () => {
            try {
                // Clean orderId from any whitespaces, newlines, or tabs accidentally passed in URL
                let rawId = decodeURIComponent(orderId).replace(/\s+/g, '').trim();
                const possibleIds = [rawId, `#${rawId.replace(/^#/, '')}`, rawId.replace(/^#/, '')];
                const uniqueIds = [...new Set(possibleIds)];

                let targetDocRef = null;
                const ordersRef = collection(db, "orders");

                try {
                    const q = query(ordersRef, where("orderId", "in", uniqueIds));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        targetDocRef = querySnapshot.docs[0].ref;
                    }
                } catch (e) { }

                if (!targetDocRef) {
                    for (const id of uniqueIds) {
                        try {
                            const docRef = doc(db, "orders", id);
                            const docSnap = await getDoc(docRef);
                            if (docSnap.exists()) {
                                targetDocRef = docRef;
                                break;
                            }
                        } catch (e) { }
                    }
                }

                if (targetDocRef) {
                    unsubscribe = onSnapshot(targetDocRef, (doc) => {
                        if (doc.exists()) {
                            setOrder(doc.data());
                            setLoading(false);
                        } else {
                            setError(`تم حذف الطلب أو غير موجود.`);
                            setLoading(false);
                        }
                    }, (err) => {
                        console.error("Realtime error:", err);
                        setError(t('checkout.error_message'));
                        setLoading(false);
                    });
                } else {
                    setError(`${t('tracking.order_not_found')}: ${rawId}`);
                    setLoading(false);
                }

            } catch (err) {
                console.error("Setup error:", err);
                setError(t('checkout.error_message'));
                setLoading(false);
            }
        };

        if (orderId) setupRealtimeListener();

        return () => unsubscribe();
    }, [orderId]);

    const handleDownloadInvoice = async () => {
        if (!invoiceRef.current) return;
        setDownloading(true);

        const originalOverflow = document.body.style.overflow;
        const originalBg = document.body.style.backgroundColor;

        try {
            // Wait for all fonts to be ready to ensure Cairo is rendered
            await document.fonts.ready;

            // Use a specific positioning strategy for the capture to avoid user visible scrolling
            const element = invoiceRef.current;
            const parent = element.parentElement;

            // Save original styles
            const originalDisplay = parent.style.display;
            const originalPos = parent.style.position;
            const originalVisibility = parent.style.visibility;
            const originalTop = parent.style.top;
            const originalLeft = parent.style.left;
            const originalZIndex = parent.style.zIndex;

            // Prepare for capture WITHOUT scrolling the main window
            parent.style.display = 'block';
            parent.style.position = 'fixed'; // Fixed instead of absolute
            parent.style.visibility = 'visible';
            parent.style.top = '0';
            parent.style.left = '0';
            parent.style.zIndex = '-9999';
            parent.style.pointerEvents = 'none';

            const canvas = await html2canvas(element, {
                scale: 2.5, // Balanced quality/compatibility
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                allowTaint: true,
                onclone: (clonedDoc) => {
                    const clonedEl = clonedDoc.querySelector('.print-container');
                    if (clonedEl) {
                        clonedEl.style.width = '794px';
                        clonedEl.style.margin = '0 auto';
                    }
                }
            });

            // Restore styles
            parent.style.display = originalDisplay;
            parent.style.position = originalPos;
            parent.style.visibility = originalVisibility;
            parent.style.top = originalTop;
            parent.style.left = originalLeft;
            parent.style.zIndex = originalZIndex;
            parent.style.pointerEvents = '';

            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, '', 'FAST');
            pdf.save(`Milano-Invoice-${order?.orderId?.replace('#', '') || 'Order'}.pdf`);

        } catch (error) {
            console.error("Error generating invoice:", error);
            alert("حدث خطأ أثناء تنزيل الفاتورة، يرجى المحاولة مرة أخرى.");
        } finally {
            setDownloading(false);
            document.body.style.overflow = originalOverflow;
            document.body.style.backgroundColor = originalBg;
            document.documentElement.style.backgroundColor = '';
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
                `▪ رقم الطلب: ${displayedId}\n` +
                `▪ تاريخ الطلب: ${order.date || new Date().toLocaleDateString('ar')}\n\n` +
                `👤 بيانات العميل:\n` +
                `▪ الاسم: ${formData.name}\n` +
                `▪ الهاتف: ${formData.phone}\n` +
                `▪ الدولة: ${formData.country}\n` +
                `▪ المدينة: ${formData.city}\n` +
                `▪ العنوان: ${formData.address}\n` +
                (formData.notes ? `▪ ملاحظات: ${formData.notes}\n\n` : `\n`) +
                `🛒 المنتجات:\n` +
                cartItems.map(item => `▪ ${item.title}${item.size ? ` (${item.size})` : ''} × ${item.quantity || 1} = ${formatPrice(item.price * (item.quantity || 1), currency || 'YER')}`).join('\n') +
                `\n\n💰 ملخص الفاتورة:\n` +
                `▪ المجموع الفرعي: ${formatPrice(subTotal || total, currency || 'YER')}\n` +
                (() => {
                    const productDiscount = Number(discount || 0);
                    const couponDiscount = Math.round(Number(subTotal || 0) * (Number(discountPercentage || 0) / 100));
                    const totalD = productDiscount + couponDiscount;
                    return totalD > 0 ? `▪ الخصم: -${formatPrice(totalD, currency || 'YER')}\n` : '';
                })() +
                `▪ رسوم التوصيل: ${formatPrice(deliveryCost || 0, currency || 'YER')}\n` +
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

            // A slightly longer delay helps the mobile device finalize the clipboard write before switching apps
            setTimeout(() => {
                window.location.href = url;
                setTimeout(() => {
                    if (document.hasFocus()) window.open(fallbackUrl, '_blank');
                }, 1000);
            }, 1000);

        } catch (error) {
            console.error("WhatsApp flow error:", error);
        } finally {
            setDownloading(false);
            document.body.style.overflow = originalOverflow;
            document.body.style.backgroundColor = originalBg;
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#111317] p-4 font-['Cairo']">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 dark:text-gray-400 font-bold text-sm">{t('tracking.loading') || 'جاري تحميل الطلب...'}</p>
            </div>
        </div>
    );

    if (error || !order) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#111317] p-4 font-['Cairo']">
            <div className="bg-white dark:bg-[#1a1d23] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 text-center max-w-md w-full">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle size={32} className="text-red-500" />
                </div>
                <h1 className="text-xl font-black text-gray-900 dark:text-white mb-2">{t('tracking.order_not_found')}</h1>
                <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
                <Link to="/" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors w-full">
                    <ArrowRight size={18} className={direction === 'rtl' ? 'rotate-180' : ''} />
                    {t('tracking.return_home')}
                </Link>
            </div>
        </div>
    );

    const { formData, cartItems, total, subTotal, discount, discountPercentage, deliveryCost, orderId: displayedId, date, couponCode, currency } = order;

    const stepLabels = [
        { label: t('tracking.status_label.new'), status: 'new', icon: Check },
        { label: t('tracking.status_label.processing'), status: 'processing', icon: Package },
        { label: t('tracking.status_label.shipping'), status: 'shipping', icon: Truck },
        { label: t('tracking.status_label.completed'), status: 'completed', icon: MapPin },
    ];

    const currentStepIndex = stepLabels.findIndex(s => s.status === order.status) !== -1
        ? stepLabels.findIndex(s => s.status === order.status)
        : 0;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white pb-0 font-['Cairo'] transition-colors duration-300">

            {/* Hidden invoice for capture */}
            <div style={{ display: 'none' }}>
                <InvoiceTemplate ref={invoiceRef} orders={order ? [order] : []} lang={language} generalSettings={generalSettings} hideHeader={true} />
            </div>

            <div className="pb-8">
                <div className="bg-[#4f46e5] h-64 md:h-72 px-4 text-center relative overflow-hidden shadow-2xl">
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

                <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-20 space-y-3">

                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                            <h3 className="font-black text-blue-500 dark:text-blue-400 flex items-center gap-2">
                                <Truck size={18} />
                                {t('tracking.track_order')}
                            </h3>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${storeUrl}/order-tracking/${displayedId.replace('#', '').replace(/\s+/g, '')}`);
                                    alert(t('tracking.link_copied'));
                                }}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-500/20"
                            >
                                <span className="hidden md:inline">{t('tracking.copy_link')}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                            </button>
                        </div>

                        <div className="bg-gray-50 dark:bg-[#111317] border border-gray-200 dark:border-white/5 rounded-xl p-4 mb-6 flex items-center justify-between gap-4 font-mono text-sm text-gray-600 dark:text-gray-400 select-all">
                            <span className="truncate">{storeUrl}/order-tracking/{displayedId.replace('#', '').replace(/\s+/g, '')}</span>
                        </div>

                        <div className="relative flex justify-between items-center px-2 md:px-6">
                            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 dark:bg-white/10 -translate-y-1/2 rounded-full"></div>
                            <div className="absolute top-1/2 right-0 h-1 bg-green-500 -translate-y-1/2 rounded-full transition-all duration-1000" style={{ width: `${(currentStepIndex / (stepLabels.length - 1)) * 100}%` }}></div>

                            {stepLabels.map((step, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-2 relative z-10">
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-colors ${idx <= currentStepIndex ? 'bg-green-500 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-gray-100 dark:bg-[#2b2d31] border-gray-200 dark:border-white/10 text-gray-500'}`}>
                                        <step.icon size={16} />
                                    </div>
                                    <span className={`text-[10px] md:text-xs font-bold ${idx <= currentStepIndex ? 'text-green-500' : 'text-gray-500'}`}>{step.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* WhatsApp Payment Prompt - Simplified */}
                    {formData?.paymentMethod === 'whatsapp' && (
                        <div className="max-w-3xl mx-auto px-0">
                            <button
                                onClick={handleWhatsAppClick}
                                disabled={downloading}
                                className={`w-full py-3.5 px-5 bg-[#25D366] rounded-xl text-white font-black flex items-center justify-center gap-3 hover:bg-[#128C7E] transition-all shadow-lg active:scale-95 ${downloading ? 'opacity-70 cursor-wait' : ''}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" className={`w-6 h-6 md:w-7 md:h-7 shrink-0 object-contain ${downloading ? 'animate-pulse' : ''}`} alt="WhatsApp" />
                                    <span className="text-sm md:text-lg whitespace-nowrap leading-tight">{downloading ? 'جاري تجهيز الفاتورة...' : t('tracking.whatsapp_button')}</span>
                                </div>
                            </button>
                        </div>
                    )}

                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-white/5 pb-4">
                            <h3 className="font-black text-blue-500 dark:text-blue-400 flex items-center gap-2 mt-1">
                                <ShoppingBag size={18} />
                                {t('tracking.order_details')}
                            </h3>
                        </div>

                        <div className="space-y-4 mb-6">
                            {cartItems?.map((item, idx) => (
                                <div key={idx} className="flex gap-4 bg-gray-50 dark:bg-[#111317] p-3 rounded-xl border border-gray-200 dark:border-white/5 transition-colors">
                                    <div className="w-16 h-16 bg-white dark:bg-white/5 rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 shrink-0">
                                        <img
                                            src={item.image}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = '/nav-logo.png';
                                            }}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-gray-900 dark:text-white font-bold text-sm mb-1">{item.title}</h4>
                                        <div className="flex items-center gap-3">
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">{t('tracking.qty')}: {item.quantity}</p>
                                            {item.size && <p className="text-blue-500 dark:text-blue-400 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 px-2 rounded">{item.size.toString().replace(/مقاس|المقاس|Size|size/g, '').trim()}</p>}
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

                        <div className="bg-gray-50 dark:bg-[#111317] rounded-xl p-4 border border-gray-200 dark:border-white/5 space-y-3 transition-colors">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.payment_method')}</span>
                                <span className="text-gray-900 dark:text-white font-bold flex items-center gap-1">
                                    {formData?.paymentMethod === 'cod' ? t('checkout.cod') : 'WhatsApp'}
                                    {formData?.paymentMethod === 'cod' && <img src="https://cdn-icons-png.flaticon.com/512/5163/5163829.png" className="w-4 h-4 opacity-80 dark:invert" alt="" />}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.order_number')}</span>
                                <span className="text-gray-900 dark:text-white font-mono font-bold tracking-wider">{displayedId}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">{t('tracking.order_date')}</span>
                                <span className="text-gray-900 dark:text-white font-mono font-bold">{date}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl pt-8 px-6 pb-6 border border-gray-100 dark:border-white/5 shadow-xl space-y-4 transition-colors duration-300">
                        <h3 className="font-black text-blue-500 dark:text-blue-400 text-start mb-4 mt-1 flex items-center gap-2">
                            <FileText size={18} />
                            {t('tracking.customer_info')}
                        </h3>

                        <div className="grid gap-2">
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.buyer_name')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData?.name}</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.phone')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData?.phone}</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.country')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData?.country}</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.city')}</span>
                                <span className="text-gray-900 dark:text-white font-bold">{formData?.city}</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-[#111317] p-4 rounded-xl border border-gray-200 dark:border-white/5 flex justify-between items-center transition-colors">
                                <span className="text-gray-500 dark:text-gray-400 text-sm">{t('tracking.address')}</span>
                                <span className="text-gray-900 dark:text-white font-bold text-sm">{formData?.address}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#1a1d23] rounded-2xl p-6 border border-gray-100 dark:border-white/5 shadow-xl transition-colors duration-300">
                        <h3 className="font-black text-blue-500 dark:text-blue-400 mb-6 flex items-center gap-2 text-start">
                            <FileText size={18} />
                            {t('tracking.invoice_summary')}
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400 font-bold">{t('tracking.products_price')}</span>
                                <span className="text-gray-900 dark:text-white font-bold text-left">
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
                                <span className="text-gray-900 dark:text-white font-bold text-left">
                                    {formatPrice(deliveryCost, currency || 'YER')}
                                </span>
                            </div>
                            <div className="border-t border-gray-200 dark:border-white/10 pt-4 mt-4 flex justify-between text-lg text-blue-600 dark:text-brand-blue font-black transition-colors">
                                <span>{t('tracking.grand_total')}</span>
                                <span>
                                    {formatPrice(total, currency || 'YER')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Link to="/" className="w-full py-4 bg-[#6366f1] rounded-xl text-white font-black text-center flex items-center justify-center gap-2 hover:bg-[#4f46e5] transition-colors shadow-lg shadow-indigo-500/20">
                            <ShoppingBag size={20} /> {t('tracking.continue_shopping')}
                        </Link>

                        <button
                            onClick={handleDownloadInvoice}
                            disabled={downloading}
                            className={`w-full py-4 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg active:scale-[0.98] ${downloading ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            <Download size={20} className={downloading ? 'animate-bounce' : ''} />
                            {downloading ? (language === 'ar' ? 'جاري التحميل...' : 'Downloading...') : (language === 'ar' ? 'تحميل الفاتورة (PDF)' : 'Download Invoice (PDF)')}
                        </button>

                        <Link to="/rate-order" className="w-full py-4 bg-white dark:bg-[#1a1d23] border border-gray-200 dark:border-white/10 rounded-xl text-yellow-500 dark:text-yellow-400 font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors shadow-md dark:shadow-none">
                            <Star size={20} fill="currentColor" /> {t('tracking.rate_store')}
                        </Link>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default OrderTracking;
