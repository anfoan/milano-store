import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { Check, Clock3, Copy, FileText, Package, Printer, Search, Truck, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { walletNumber } from '../lib/wallet';

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
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [queryText, setQueryText] = useState('');
    const [copied, setCopied] = useState('');

    useEffect(() => {
        let stored = [];
        try { stored = JSON.parse(localStorage.getItem('myOrders') || '[]'); } catch { stored = []; }
        if (!Array.isArray(stored)) stored = [];
        const savedOrders = stored;
        setOrders([...savedOrders].sort((a, b) => toMillis(b.timestamp || b.createdAt || b.date) - toMillis(a.timestamp || a.createdAt || a.date)));

        const unsubscribe = onSnapshot(collection(db, 'orders'), snapshot => {
            const remote = new Map(snapshot.docs.map(item => {
                const data = item.data();
                return [data.orderId || item.id, { id: item.id, ...data }];
            }));
            const merged = savedOrders.map(local => ({ ...local, ...(remote.get(local.orderId) || {}) }));
            const sorted = merged.sort((a, b) => toMillis(b.createdAt || b.timestamp || b.date) - toMillis(a.createdAt || a.timestamp || a.date));
            setOrders(sorted);
            localStorage.setItem('myOrders', JSON.stringify(sorted.map(order => ({ ...order, createdAt: typeof order.createdAt?.toDate === 'function' ? order.createdAt.toDate().toISOString() : order.createdAt }))));
        }, error => console.error('Customer orders listener:', error));
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
    const dateLabel = (order) => {
        const value = order.createdAt || order.timestamp || order.date;
        const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value || Date.now());
        return Number.isNaN(date.getTime()) ? order.date || '---' : new Intl.DateTimeFormat(language === 'ar' ? 'ar-YE' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
    };
    const copyTracking = async (orderId) => {
        await navigator.clipboard?.writeText(orderId || '');
        setCopied(orderId);
        setTimeout(() => setCopied(''), 1600);
    };

    const timeline = [
        { key: 'new', label: 'قيد المراجعة', Icon: Clock3, tone: 'border-orange-400 bg-orange-100 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300' },
        { key: 'processing', label: 'قيد التجهيز', Icon: Package, tone: 'border-violet-400 bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300' },
        { key: 'shipping', label: 'قيد التوصيل', Icon: Truck, tone: 'border-blue-400 bg-blue-100 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300' },
        { key: 'completed', label: 'مكتمل', Icon: Check, tone: 'border-emerald-400 bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300' }
    ];

    return (
        <div className="min-h-screen bg-[#f6f7f8] px-3 py-5 font-['Cairo'] text-slate-900 dark:bg-[#0d1017] dark:text-white md:px-5" dir={direction}>
            <main className="mx-auto w-full max-w-3xl rounded-[26px] border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#171b26]">
                <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-white/10 md:px-6"><button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18}/></button><div className="flex items-center gap-2 text-right"><div><h1 className="text-base font-black md:text-lg">طلباتك وفواتيرك السابقة</h1><p className="text-[9px] font-bold text-slate-400">استعرض تفاصيل فواتيرك، تتبع شحناتك واربح مكافآت عند اكتمال طلباتك</p></div><div className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">{orders.length} فواتير</div><Package size={20} className="text-emerald-500"/></div></header>
                <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10 md:px-6"><div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="ابحث برقم الفاتورة، كود التتبع أو رقم الهاتف..." className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-right text-[10px] font-bold outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5"/></div></div>
                <section className="max-h-[72vh] space-y-3 overflow-y-auto p-3 md:p-5">{filteredOrders.length === 0 ? <div className="py-14 text-center text-sm font-bold text-slate-400">لا توجد فواتير مطابقة على هذا الجهاز.</div> : filteredOrders.map(order => {
                    const status = statusKey(order.status); const meta = statusMeta(order.status); const step = timeline.findIndex(item => item.key === status); const reward = Number(order.walletRewardAmount || order.rewardAmount || 0); const hasReward = status === 'completed' && (order.walletRewardGranted || reward > 0);
                    return <article key={order.orderId || order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111722]">
                        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/10"><div className="flex items-center gap-2"><Link to={`/order-tracking/${String(order.orderId || '').replace('#', '')}`} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><Printer size={13}/> طباعة</Link><span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${meta.pill}`}>الحالة: {meta.label}</span></div><div className="flex items-center gap-1.5"><FileText size={16} className="text-blue-500"/><span dir="ltr" className="font-mono text-[11px] font-black text-slate-800 dark:text-white">فاتورة {order.orderId || order.id}</span></div></div>
                        <div className="grid grid-cols-3 gap-2 px-3 py-3 text-right text-[10px]"><div><p className="text-slate-400">اسم العميل</p><p className="mt-1 font-black">{order.formData?.name || '---'}</p></div><div><p className="text-slate-400">الهاتف</p><p dir="ltr" className="mt-1 font-mono font-black">{order.formData?.phone || '---'}</p></div><div><p className="text-slate-400">إجمالي الفاتورة</p><p className="mt-1 font-black text-emerald-600 dark:text-emerald-300">{formatPrice(order.total || 0, order.currency || 'YER')}</p></div></div>
                        <div className="divide-y divide-slate-100 border-y border-slate-100 px-3 dark:divide-white/5 dark:border-white/10">{(order.cartItems || []).map((item, index) => <div key={`${item.id || item.title}-${index}`} className="flex items-center justify-between gap-3 py-2"><span className="font-black text-emerald-600 dark:text-emerald-300">{formatPrice(Number(item.price || 0) * Number(item.quantity || 1), order.currency || 'YER')}</span><div className="flex flex-1 items-center justify-end gap-2"><div className="text-right"><p className="text-[10px] font-black">{item.title}</p><p className="text-[8px] font-bold text-slate-400">{item.size ? `المقاس: ${item.size}` : 'بدون مقاس'} · الكمية: {item.quantity || 1}</p></div>{item.image && <img src={item.image} className="h-8 w-8 rounded-md object-cover" onError={event => { event.currentTarget.style.display = 'none'; }}/>}</div></div>)}</div>
                        <div className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2 dark:border-violet-400/30 dark:bg-violet-400/10"><button onClick={() => copyTracking(order.orderId || '')} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[9px] font-black text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200"><Copy size={12}/>{copied === order.orderId ? 'تم النسخ' : 'نسخ رقم التتبع'}</button><div className="text-right"><p className="text-[8px] font-bold text-violet-500">رقم التتبع الخاص بالفاتورة</p><p dir="ltr" className="font-mono text-[11px] font-black text-violet-700 dark:text-violet-200">{order.orderId || '---'}</p></div></div>
                        <div className="relative mx-3 my-4 flex items-start justify-between gap-1"><div className="absolute top-3 right-5 left-5 h-[3px] rounded-full bg-slate-200 dark:bg-white/10"/><div className="absolute top-3 right-5 h-[3px] rounded-full bg-gradient-to-l from-orange-400 via-violet-400 to-emerald-400" style={{ width: `${Math.max(0, step) / 3 * 100}%` }}/>{timeline.map((item, index) => <div key={item.key} className="relative z-10 flex w-1/4 flex-col items-center gap-1 text-center"><div className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= step ? item.tone : 'border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-[#171b26]'}`}><item.Icon size={12}/></div><span className={`text-[8px] font-black ${index <= step ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{item.label}</span></div>)}</div>
                        {hasReward && <div className="mx-3 mb-3 flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200"><span dir="ltr" className="font-mono text-[10px] font-black">+ $ {walletNumber(reward)}</span><span className="text-[10px] font-black">تم إيداع مكافأة في محفظتك</span></div>}
                        <p className="px-3 pb-3 text-left text-[8px] font-bold text-slate-400" dir="ltr">{dateLabel(order)}</p>
                    </article>;
                })}</section>
                <footer className="border-t border-slate-100 px-4 py-3 dark:border-white/10"><button onClick={() => navigate(-1)} className="rounded-lg bg-slate-100 px-4 py-2 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">إغلاق</button></footer>
            </main>
        </div>
    );
};

export default UserProfile;
