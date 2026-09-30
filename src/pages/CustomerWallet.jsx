import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CircleDollarSign, Gift, KeyRound, Landmark, LockKeyhole, ReceiptText, ShieldCheck, WalletCards, X } from 'lucide-react';
import { collection, doc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCustomerWalletId, hashWalletPin, isValidWalletPin, normalizePhone, walletNumber } from '../lib/wallet';
import { useLanguage } from '../context/LanguageContext';

const toDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const CustomerWallet = () => {
    const { direction, language } = useLanguage();
    const navigate = useNavigate();
    const walletId = useMemo(() => getCustomerWalletId(), []);
    const [wallet, setWallet] = useState(null);
    const [walletSettings, setWalletSettings] = useState({ defaultReward: 500, enabled: true });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSetup, setShowSetup] = useState(false);
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const walletRef = doc(db, 'customer_wallets', walletId);
        const configRef = doc(db, 'settings', 'wallet');
        const transactionsQuery = query(collection(db, 'wallet_transactions'), where('walletId', '==', walletId));
        const stopWallet = onSnapshot(walletRef, snapshot => {
            setWallet(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
            setLoading(false);
        }, () => setLoading(false));
        const stopConfig = onSnapshot(configRef, snapshot => {
            if (snapshot.exists()) setWalletSettings(previous => ({ ...previous, ...snapshot.data() }));
        });
        const stopTransactions = onSnapshot(transactionsQuery, snapshot => {
            const next = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            next.sort((a, b) => Number(toDate(b.createdAt)?.getTime() || 0) - Number(toDate(a.createdAt)?.getTime() || 0));
            setTransactions(next);
        });
        return () => { stopWallet(); stopConfig(); stopTransactions(); };
    }, [walletId]);

    const configureWallet = async (event) => {
        event.preventDefault();
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone || normalizedPhone.length < 7) {
            setNotice('أدخل رقم هاتف صحيح لربط المحفظة.');
            return;
        }
        if (!isValidWalletPin(pin)) {
            setNotice('الرمز السري يجب أن يكون من 4 إلى 6 أرقام إنجليزية.');
            return;
        }
        if (pin !== confirmPin) {
            setNotice('تأكيد الرمز السري غير متطابق.');
            return;
        }
        setSaving(true);
        setNotice('');
        try {
            const pinHash = await hashWalletPin(pin);
            const walletRef = doc(db, 'customer_wallets', walletId);
            await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(walletRef);
                const existing = snapshot.exists() ? snapshot.data() : {};
                transaction.set(walletRef, {
                    walletId,
                    phone: normalizedPhone,
                    balance: Number(existing.balance || 0),
                    pinHash,
                    pinConfigured: true,
                    deviceBound: true,
                    updatedAt: serverTimestamp(),
                    createdAt: existing.createdAt || serverTimestamp()
                }, { merge: true });
            });
            setPin('');
            setConfirmPin('');
            setShowSetup(false);
            setNotice('تم تأمين وربط محفظتك بنجاح.');
        } catch (error) {
            console.error('Wallet setup error:', error);
            setNotice('تعذّر حفظ إعدادات المحفظة. حاول مرة أخرى.');
        } finally {
            setSaving(false);
        }
    };

    const balance = Number(wallet?.balance || 0);
    const canSpend = Boolean(wallet?.pinConfigured && wallet?.pinHash);
    const dateLabel = (value) => {
        const date = toDate(value);
        return date ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-YE' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : '---';
    };
    const transactionLabel = (item) => ({ reward: 'مكافأة طلب مكتمل', credit: 'إضافة رصيد', bonus: 'رصيد تشجيعي', debit: 'خصم رصيد', spend: 'استخدام الرصيد في طلب' }[item.type] || 'حركة محفظة');

    return (
        <div dir={direction} className="min-h-screen bg-[#f6f7f8] px-3 py-5 font-['Cairo'] text-slate-900 dark:bg-[#0d1017] dark:text-white md:px-5">
            <main className="mx-auto w-full max-w-md space-y-4 pb-8">
                <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#171b26]">
                    <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"><X size={19}/></button>
                    <div className="flex items-center gap-2 text-right"><div><h1 className="text-base font-black">محفظة المتجر الخاصة بجهازك</h1><p className="mt-0.5 text-[9px] font-bold text-slate-400">رصيد نقدي متاح لك في المتجر</p></div><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600"><WalletCards size={19}/></div></div>
                </header>

                <section className="overflow-hidden rounded-2xl border border-emerald-300 bg-emerald-100/60 p-4 text-center shadow-sm dark:border-emerald-400/40 dark:bg-emerald-400/10">
                    <p className="text-[10px] font-black text-emerald-800 dark:text-emerald-200">رصيد المحفظة الحالي</p>
                    <div dir="ltr" className="mt-2 flex items-center justify-center gap-2 text-4xl font-black text-emerald-600 dark:text-emerald-300"><span>$</span><span>{loading ? '...' : walletNumber(balance)}</span></div>
                    <p className="mt-1 text-[10px] font-bold text-emerald-700/80 dark:text-emerald-200/80">رصيد نقدي متاح لك في المتجر</p>
                </section>

                {!canSpend ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]">
                    <div className="flex items-start gap-2"><div className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><KeyRound size={17}/></div><div className="flex-1"><h2 className="text-sm font-black">ربط وتأمين المحفظة برقم هاتفك</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عيّن رمزًا سريًا من 4 إلى 6 أرقام. لن يُسمح باستخدام رصيدك عند الشراء إلا بعد إدخال الرمز السري.</p></div></div>
                    {!showSetup ? <button onClick={() => setShowSetup(true)} className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600">إعداد المحفظة الآن</button> : <form onSubmit={configureWallet} className="mt-4 space-y-3"><input value={phone} onChange={event => setPhone(event.target.value)} type="tel" placeholder="رقم الهاتف" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-right text-sm font-bold outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><div className="grid grid-cols-2 gap-2"><input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="الرمز السري" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-sm font-black outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><input value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="تأكيد الرمز" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-sm font-black outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/></div><div className="flex gap-2"><button type="submit" disabled={saving} className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'جاري الحفظ...' : 'تأكيد'}</button><button type="button" onClick={() => setShowSetup(false)} className="rounded-xl px-4 text-sm font-black text-slate-500">إلغاء</button></div></form>}</section> : <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-500"/><div><h2 className="text-sm font-black">محفظتك مؤمنة</h2><p className="text-[10px] font-bold text-slate-400">رقم هاتف مرتبط وآمن برمز PIN</p></div></div><button onClick={() => { setShowSetup(true); setNotice('يمكنك تغيير الرمز السري بعد إدخال رقم الهاتف الجديد أو الحالي.'); }} className="mt-3 text-xs font-black text-emerald-600 dark:text-emerald-300">تغيير رمز PIN</button></section>}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-start gap-2"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Gift size={17}/></div><div><h2 className="text-sm font-black">كيف تكسب من محفظتك؟</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عند اكتمال وتسليم طلب مؤهل، تُضاف مكافأة المتجر تلقائيًا إلى محفظتك. قيمة المكافأة الحالية: <span dir="ltr" className="font-mono text-emerald-600 dark:text-emerald-300">$ {walletNumber(walletSettings.defaultReward)}</span>.</p></div></div></section>

                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10"><ReceiptText size={16} className="text-slate-400"/><h2 className="text-sm font-black">آخر الحركات</h2></div>{transactions.length === 0 ? <div className="px-4 py-8 text-center text-[11px] font-bold text-slate-400">لا توجد حركات في المحفظة حتى الآن.</div> : <div className="divide-y divide-slate-100 dark:divide-white/5">{transactions.slice(0, 12).map(item => { const positive = ['reward', 'credit', 'bonus'].includes(item.type); return <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[11px] font-black">{transactionLabel(item)}</p><p className="mt-0.5 text-[9px] font-bold text-slate-400">{item.orderId || dateLabel(item.createdAt)}</p></div><span dir="ltr" className={`font-mono text-sm font-black ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500 dark:text-rose-300'}`}>{positive ? '+' : '-'} $ {walletNumber(item.amount)}</span></div>; })}</div>}</section>

                {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[10px] font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">{notice}</div>}
                <Link to="/profile" className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900"><Landmark size={16}/> طلباتك وفواتيرك السابقة</Link>
            </main>
        </div>
    );
};

export default CustomerWallet;
