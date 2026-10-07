import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Check, Clock3, Copy, FileText, MapPin, Package, Printer, Search, Truck, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { db } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getCustomerWalletId } from '../lib/wallet';
import { useSettings } from '../hooks/useSettings';
import InvoiceTemplate from '../components/InvoiceTemplate';

const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value?.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const UserProfile = () => {
    const { direction, language } = useLanguage();
    const { formatPrice } = useCurrency();
    const { generalSettings } = useSettings();
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [queryText, setQueryText] = useState('');
    const [copied, setCopied] = useState('');
    const [printOrder, setPrintOrder] = useState(null);
    const [downloadingInvoice, setDownloadingInvoice] = useState(false);

    useEffect(() => {
        const walletId = getCustomerWalletId();
        let savedOrders = [];
        try {
            const stored = JSON.parse(localStorage.getItem('myOrders') || '[]');
            savedOrders = Array.isArray(stored)
                ? stored.filter(order => Boolean(walletId) && order?.customerWalletId === walletId)
                : [];
        } catch {
            savedOrders = [];
        }

        const orderKey = order => String(order?.orderId || order?.sourceOrderId || order?.id || '');
        const sortOrders = list => [...list].sort((a, b) => toMillis(b.createdAt || b.timestamp || b.date) - toMillis(a.createdAt || a.timestamp || a.date));
        const mergeOrders = remoteOrders => {
            const merged = new Map();
            savedOrders.forEach(order => {
                const key = orderKey(order);
                if (key) merged.set(key, order);
            });
            remoteOrders.forEach(order => {
                const key = orderKey(order);
                if (key) merged.set(key, { ...(merged.get(key) || {}), ...order });
            });
            return sortOrders([...merged.values()].filter(order => !order?.deleted));
        };

        setOrders(sortOrders(savedOrders));
        if (!walletId) return undefined;

        // Orders are permanently mirrored under the customer phone/device wallet.
        // The list is never removed locally by the storefront; only an administrator
        // deleting the original invoice removes its durable record.
        const historyQuery = query(
            collection(db, 'customer_wallets', walletId, 'orders'),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(historyQuery, snapshot => {
            const remoteOrders = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            const merged = mergeOrders(remoteOrders);
            setOrders(merged);
            try {
                localStorage.setItem('myOrders', JSON.stringify(merged.map(order => ({
                    ...order,
                    createdAt: typeof order.createdAt?.toDate === 'function' ? order.createdAt.toDate().toISOString() : order.createdAt,
                    updatedAt: typeof order.updatedAt?.toDate === 'function' ? order.updatedAt.toDate().toISOString() : order.updatedAt,
                }))));
            } catch (error) {
                console.warn('Unable to cache customer order history:', error);
            }
        }, error => {
            // Keep already cached invoices visible during a network interruption.
            console.error('Customer order history listener:', error);
        });

        return () => unsubscribe();
    }, []);

    const filteredOrders = useMemo(() => {
        const needle = queryText.trim().toLowerCase();
        if (!needle) return orders;
        return orders.filter(order => [order.orderId, order.formData?.name, order.formData?.phone].some(value => String(value || '').toLowerCase().includes(needle)));
    }, [orders, queryText]);

    const statusKey = (status) => {
        const value = String(status || 'new').toLowerCase();
        if (value.includes('complete') || value.includes('مكتمل') || value.includes('تم التوصيل')) return 'completed';
        if (value.includes('ship') || value.includes('توصيل') || value.includes('delivery')) return 'shipping';
        if (value.includes('process') || value.includes('تجهيز')) return 'processing';
        return 'new';
    };
    const statusMeta = (status) => ({
        new: { label: 'قيد المراجعة', pill: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-400/45 dark:bg-orange-400/15 dark:text-orange-200' },
        processing: { label: 'قيد التجهيز', pill: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-400/45 dark:bg-violet-400/15 dark:text-violet-200' },
        shipping: { label: 'قيد التوصيل', pill: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/45 dark:bg-blue-400/15 dark:text-blue-200' },
        completed: { label: 'مكتمل', pill: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-400/15 dark:text-emerald-200' }
    }[statusKey(status)]);
    const dateLabelEnglish = (order) => {
        const value = order.createdAt || order.timestamp || order.date;
        const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value || Date.now());
        return Number.isNaN(date.getTime()) ? order.date || '---' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
    };
    const copyTracking = async (orderId) => {
        await navigator.clipboard?.writeText(orderId || '');
        setCopied(orderId);
        setTimeout(() => setCopied(''), 1600);
    };

    const downloadInvoicePdf = async () => {
        if (downloadingInvoice) return;
        const element = document.querySelector('[data-customer-invoice-preview] .invoice-preview-page');
        if (!element) return;
        setDownloadingInvoice(true);
        const parent = element.parentElement;
        const original = {
            display: parent.style.display,
            position: parent.style.position,
            visibility: parent.style.visibility,
            top: parent.style.top,
            left: parent.style.left,
            zIndex: parent.style.zIndex,
            pointerEvents: parent.style.pointerEvents,
        };
        try {
            await document.fonts.ready;
            parent.style.display = 'block';
            parent.style.position = 'fixed';
            parent.style.visibility = 'visible';
            parent.style.top = '0';
            parent.style.left = '0';
            parent.style.zIndex = '-9999';
            parent.style.pointerEvents = 'none';
            const canvas = await html2canvas(element, {
                scale: 2.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 1200,
                windowHeight: 1600,
                onclone: clonedDocument => {
                    const clonedPage = clonedDocument.querySelector('.invoice-preview-page');
                    if (clonedPage) {
                        clonedPage.style.width = '794px';
                        clonedPage.style.maxWidth = '794px';
                        clonedPage.style.margin = '0 auto';
                        clonedPage.style.minHeight = '0';
                        clonedPage.style.height = 'auto';
                    }
                    const customerCard = clonedDocument.querySelector('[data-invoice-customer-card]');
                    if (customerCard) {
                        customerCard.style.fontSize = '16px';
                        customerCard.style.lineHeight = '1.4';
                        customerCard.querySelector('h3')?.style.setProperty('font-size', '20px', 'important');
                        customerCard.querySelectorAll('span').forEach(span => {
                            span.style.setProperty('font-size', span.classList.contains('text-gray-500') ? '13px' : '16px', 'important');
                            span.style.setProperty('line-height', '1.4', 'important');
                            span.style.setProperty('white-space', 'normal', 'important');
                            span.style.setProperty('overflow', 'visible', 'important');
                        });
                    }
                    if (window.innerWidth >= 1025) {
                        const table = clonedDocument.querySelector('.invoice-preview-page table');
                        if (table) {
                            table.querySelectorAll('th, td').forEach(cell => {
                                cell.style.setProperty('vertical-align', 'middle', 'important');
                                cell.style.setProperty('line-height', '1.25', 'important');
                                // Keep the cell height and borders fixed while lifting its content 2px.
                                cell.style.setProperty('padding-top', '6px', 'important');
                                cell.style.setProperty('padding-bottom', '10px', 'important');
                            });
                            table.querySelectorAll('th').forEach(cell => {
                                cell.style.setProperty('text-align', 'center', 'important');
                                cell.style.setProperty('height', '42px', 'important');
                            });
                            table.querySelectorAll('tbody td').forEach(cell => {
                                cell.style.setProperty('text-align', 'center', 'important');
                                cell.style.setProperty('height', '58px', 'important');
                            });
                            const productCell = table.querySelector('tbody td:first-child');
                            const productContent = productCell?.firstElementChild;
                            if (productContent) {
                                productContent.style.setProperty('align-items', 'center', 'important');
                                productContent.style.setProperty('justify-content', 'center', 'important');
                                productContent.style.setProperty('height', '100%', 'important');
                            }
                        }
                    }
                },
            });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imageHeight = (canvas.height * pageWidth) / canvas.width;
            const scale = Math.min(1, (pageHeight - 8) / imageHeight);
            const width = pageWidth * scale;
            const height = imageHeight * scale;
            pdf.addImage(canvas.toDataURL('image/png', 1), 'PNG', (pageWidth - width) / 2, 4, width, height, '', 'FAST');
            pdf.save(`Milano-Invoice-${String(printOrder?.orderId || printOrder?.id || 'Order').replace('#', '')}.pdf`);
        } catch (error) {
            console.error('Invoice PDF download failed:', error);
            alert('حدث خطأ أثناء تنزيل الفاتورة، يرجى المحاولة مرة أخرى.');
        } finally {
            Object.entries(original).forEach(([key, value]) => { parent.style[key] = value; });
            setDownloadingInvoice(false);
        }
    };

    const timeline = [
        { key: 'new', label: 'قيد المراجعة', Icon: Clock3, tone: 'border-orange-400 bg-orange-100 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300' },
        { key: 'processing', label: 'قيد التجهيز', Icon: Package, tone: 'border-violet-400 bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300' },
        { key: 'shipping', label: 'قيد التوصيل', Icon: Truck, tone: 'border-blue-400 bg-blue-100 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300' },
        { key: 'completed', label: 'مكتمل', Icon: MapPin, tone: 'border-emerald-400 bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300' }
    ];

    return (
        <div className="min-h-screen bg-[#f6f7f8] px-3 py-5 font-['Cairo'] text-slate-900 dark:bg-[#0d1017] dark:text-white md:px-5" dir={direction}>
            {printOrder && <div className="invoice-print-overlay fixed inset-0 z-[100] overflow-y-auto bg-slate-100 p-4 sm:p-6 md:p-8 dark:bg-[#0d1017]"><div data-customer-invoice-preview className="mx-auto min-h-full w-full max-w-4xl"><InvoiceTemplate orders={[printOrder]} lang={language} generalSettings={generalSettings} onClose={() => setPrintOrder(null)} onDownload={downloadInvoicePdf} /></div></div>}
            <main className={`${printOrder ? 'max-lg:hidden' : ''} invoice-orders-page mx-auto w-full max-w-2xl rounded-[26px] border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#171b26]`}>
                <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-white/10 md:px-6"><button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-400/10"><X size={18}/></button><div className="flex flex-1 items-center justify-end gap-2 text-right"><div className="flex-1 text-right"><h1 className="text-base font-black md:text-lg">طلباتك وفواتيرك السابقة</h1><p className="text-[10px] font-bold text-slate-400"><span className="block">استعرض تفاصيل فواتيرك لتتبع شحناتك.</span><span className="block">واربح مكافآت عند اكتمال طلباتك.</span><span className="block">لن تظهر فواتيرك الجديدة والسابقة إلا عند تسجيل.</span></p></div><div className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">{orders.length} فواتير</div><Package size={20} className="text-emerald-500"/></div></header>
                <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10 md:px-6"><div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="ابحث برقم الفاتورة، كود التتبع أو رقم الهاتف..." className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-right text-[10px] font-bold outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5"/></div></div>
                <section className="max-h-[72vh] space-y-3 overflow-y-auto p-3 md:p-5">{filteredOrders.length === 0 ? <div className="py-14 text-center text-sm font-bold text-slate-400">لا توجد فواتير مطابقة على هذا الجهاز يرجى تسجيل رقم هاتفك وكلمة المرور داخل المحفظة.</div> : filteredOrders.map(order => {
                    const status = statusKey(order.status); const meta = statusMeta(order.status); const step = timeline.findIndex(item => item.key === status); const reward = Number(order.walletRewardAmount || order.rewardAmount || 0); const hasReward = status === 'completed' && (order.walletRewardGranted || reward > 0); const itemCurrencyLabel = order.currency === 'SAR' ? 'ريال سعودي' : 'ريال يمني';
                    return <article key={order.orderId || order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111722]">
                        <div dir="ltr" className="flex items-start justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/10"><div dir="rtl" className="flex items-center gap-2"><button type="button" onClick={() => setPrintOrder(order)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><Printer size={13}/> طباعة</button><span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${meta.pill}`}>الحالة: {meta.label}</span></div><div dir="rtl" className="flex flex-col items-end gap-0.5 text-right"><div className="flex items-center gap-1.5"><FileText size={16} className="text-blue-500"/><span className="font-mono text-[11px] font-black text-slate-800 dark:text-white">فاتورة {order.orderId || order.id}</span></div><span dir="ltr" className="font-mono text-[8px] font-bold text-slate-400">تاريخ الطلب: {dateLabelEnglish(order)}</span></div></div>
                        <div dir="rtl" className="grid grid-cols-3 gap-x-4 gap-y-2 border-b border-slate-100 px-3 py-3 text-right text-[9px] dark:border-white/10"><div><p className="text-slate-400">اسم العميل</p><p className="mt-0.5 font-black">{order.formData?.name || '---'}</p></div><div><p className="text-slate-400">رقم الهاتف</p><p dir="ltr" className="mt-0.5 font-mono font-black">{order.formData?.phone || '---'}</p></div><div><p className="text-slate-400">المدينة والتوصيل:</p><p className="mt-0.5 font-black">{order.formData?.city || '---'}{order.formData?.address ? ` - ${order.formData.address}` : ''}</p></div><div><p className="text-slate-400">طريقة الدفع</p><p className="mt-0.5 font-black">{order.paymentMethod === 'whatsapp' ? 'الدفع عبر واتساب' : 'الدفع عند الاستلام / كاش'}</p></div><div><p className="text-slate-400">التوصيل:</p><p className="mt-0.5 font-black text-slate-600 dark:text-slate-300">{formatPrice(order.deliveryCost || order.deliveryFee || 0, order.currency || 'YER')}</p></div><div><p className="text-slate-400">إجمالي الفاتورة</p><p className="mt-0.5 font-black text-emerald-600 dark:text-emerald-300">{formatPrice(order.total || 0, order.currency || 'YER')}</p></div></div>
                        <div className="divide-y divide-slate-100 border-y border-slate-100 px-3 dark:divide-white/5 dark:border-white/10">{(order.cartItems || []).map((item, index) => <div key={`${item.id || item.title}-${index}`} className="flex w-full items-center justify-between gap-3 py-2" dir="rtl"><div dir="rtl" className="flex flex-1 items-center justify-start gap-2 text-right">{item.image && <img src={item.image} className="h-8 w-8 shrink-0 rounded-md object-cover" onError={event => { event.currentTarget.style.display = 'none'; }}/>}<div className="text-right"><p className="text-[10px] font-black">{item.title}</p><p className="text-[8px] font-bold text-slate-400">{item.size ? `مقاس ${String(item.size).replace(/مقاس|المقاس|Size|size/g, '').trim()} : ` : ''}الكمية: {item.quantity || 1}</p></div></div><span dir="rtl" className="flex shrink-0 items-center gap-1 text-[11px] font-black text-emerald-600 dark:text-emerald-300"><span>{formatPrice(Number(item.price || 0) * Number(item.quantity || 1), order.currency || 'YER').split(' ')[0]}</span><span>{itemCurrencyLabel}</span></span></div>)}</div>
                        <div className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 dark:border-violet-400/30 dark:bg-violet-400/10"><div className="text-right"><p className="text-[8px] font-bold text-violet-500">رقم التتبع الخاص بالفاتورة</p><p dir="ltr" className="font-mono text-[11px] font-black text-violet-700 dark:text-violet-200">{order.orderId || '---'}</p></div><button onClick={() => copyTracking(order.orderId || '')} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[9px] font-black text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200"><Copy size={12}/>{copied === order.orderId ? 'تم النسخ' : 'نسخ رقم التتبع'}</button></div>
                        <div className="relative mx-3 my-4 flex items-start justify-between gap-1"><div className="absolute top-3 right-5 left-5 h-[3px] rounded-full bg-slate-200 dark:bg-white/10"/><div className="absolute top-3 right-5 h-[3px] rounded-full bg-gradient-to-l from-orange-400 via-violet-400 to-emerald-400" style={{ width: `${Math.max(0, step) / 3 * 100}%` }}/>{timeline.map((item, index) => <div key={item.key} className="relative z-10 flex w-1/4 flex-col items-center gap-1 text-center"><div className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= step ? item.tone : 'border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-[#171b26]'}`}>{item.key === 'completed' && status === 'completed' ? <Check size={12}/> : <item.Icon size={12} className={item.key === 'shipping' ? 'scale-x-[-1]' : ''}/>}</div><span className={`text-[8px] font-black ${index <= step ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{item.label}</span></div>)}</div>
                        {hasReward && <div className="mx-3 mb-3 flex items-center justify-end rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200"><span className="text-[10px] font-black">تم إيداع مكافأة في محفظتك</span></div>}
                    </article>;
                })}</section>
                <footer className="border-t border-slate-100 px-4 py-3 dark:border-white/10"><button onClick={() => navigate(-1)} className="rounded-lg bg-slate-100 px-4 py-2 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">إغلاق</button></footer>
            </main>
        </div>
    );
};

export default UserProfile;
