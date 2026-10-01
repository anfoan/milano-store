import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Gift, KeyRound, Landmark, ReceiptText, ShieldCheck, WalletCards, X } from 'lucide-react';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
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
    const [showSetup, setShowSetup] = useState(true);
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const walletRef = doc(db, 'customer_wallets', walletId);
        const configRef = doc(db, 'settings', 'wallet');
        const transactionQuery = collection(walletRef, 'transactions');
        const stopWallet = onSnapshot(walletRef, snapshot => {
            const nextWallet = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
            setWallet(nextWallet);
            setPhone(nextWallet?.phone || '');
            setShowSetup(!nextWallet?.pinConfigured);
            setLoading(false);
        }, () => setLoading(false));
        const stopConfig = onSnapshot(configRef, snapshot => { if (snapshot.exists()) setWalletSettings(previous => ({ ...previous, ...snapshot.data() })); });
        const stopTransactions = onSnapshot(transactionQuery, snapshot => {
            const next = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            next.sort((a, b) => Number(toDate(b.createdAt)?.getTime() || 0) - Number(toDate(a.createdAt)?.getTime() || 0));
            setTransactions(next);
        }, () => setTransactions([]));
        return () => { stopWallet(); stopConfig(); stopTransactions(); };
    }, [walletId]);

    const configureWallet = async (event) => {
        event.preventDefault();
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone || normalizedPhone.length < 7) { setNotice('أدخل رقم هاتف صحيح لربط المحفظة.'); return; }
        if (!isValidWalletPin(pin)) { setNotice('الرمز السري يجب أن يكون من 4 إلى 6 أرقام إنجليزية.'); return; }
        if (pin !== confirmPin) { setNotice('تأكيد الرمز السري غير متطابق.'); return; }
        setSaving(true); setNotice('');
        try {
            const pinHash = await hashWalletPin(pin);
            const walletRef = doc(db, 'customer_wallets', walletId);
            await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(walletRef);
                const previous = snapshot.exists() ? snapshot.data() : {};
                transaction.set(walletRef, {
                    walletId,
                    phone: normalizedPhone,
                    balance: Number(previous.balance || 0),
                    pinHash,
                    pinConfigured: true,
                    deviceBound: true,
                    updatedAt: serverTimestamp(),
                    createdAt: previous.createdAt || serverTimestamp()
                }, { merge: true });
            });
            setPin(''); setConfirmPin(''); setShowSetup(false);
            setNotice('تم تأمين وربط محفظتك بنجاح.');
        } catch (error) {
            console.error('Wallet setup error:', error);
            setNotice('تعذّر حفظ إعدادات المحفظة. حاول مرة أخرى.');
        } finally { setSaving(false); }
    };

    const balance = Number(wallet?.balance || 0);
    const canSpend = Boolean(wallet?.pinConfigured && wallet?.pinHash);
    const transactionLabel = (item) => ({ reward: 'مكافأة طلب مكتمل', reward_reversal: 'استرجاع مكافأة بعد تصحيح الحالة', credit: 'إضافة رصيد', bonus: 'رصيد تشجيعي', debit: 'خصم رصيد', spend: 'استخدام الرصيد في طلب' }[item.type] || 'حركة محفظة');

    return <div dir={direction} className="min-h-screen bg-[#f6f7f8] px-3 py-5 font-['Cairo'] text-slate-900 dark:bg-[#0d1017] dark:text-white md:px-5">
        <main className="mx-auto w-full max-w-md space-y-4 pb-8">
            <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18}/></button><div className="flex items-center gap-2"><div className="text-right"><h1 className="text-sm font-black">محفظة المتجر الخاصة بك</h1><p className="text-[9px] font-bold text-slate-400">رصيدك وتأمين استخدامه في الطلبات</p></div><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><WalletCards size={18}/></div></div></header>

            <section className="rounded-[20px] border border-emerald-300 bg-gradient-to-br from-emerald-100 to-emerald-50 p-4 text-center shadow-sm dark:border-emerald-400/40 dark:from-emerald-400/15 dark:to-emerald-400/5"><p className="text-[10px] font-black text-emerald-800 dark:text-emerald-200">رصيد المحفظة الحالي</p><p dir="ltr" className="mt-1 font-mono text-4xl font-black text-emerald-600 dark:text-emerald-300">$ {loading ? '...' : walletNumber(balance)}</p><p className="mt-1 text-[9px] font-bold text-emerald-700/75 dark:text-emerald-200/75">رصيد نقدي متاح لك في المتجر</p></section>

            {showSetup ? <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-start gap-2 text-right"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><KeyRound size={17}/></div><div className="flex-1"><h2 className="text-sm font-black">ربط وتأمين المحفظة برقم هاتفك</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عيّن رمزًا سريًا من 4 إلى 6 أرقام. لن يُسمح باستخدام رصيدك عند الشراء إلا بعد إدخال الرمز السري.</p></div></div><form onSubmit={configureWallet} className="mt-4"><input value={phone} onChange={event => setPhone(event.target.value)} type="tel" placeholder="رقم الهاتف" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right text-sm font-bold outline-none placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><div className="mt-3 grid grid-cols-2 gap-2"><input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="الرمز السري" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-center font-mono text-sm font-black outline-none placeholder:font-['Cairo'] placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><input value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="تأكيد الرمز" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-center font-mono text-sm font-black outline-none placeholder:font-['Cairo'] placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/></div><div className="mt-3 flex items-center gap-3"><button disabled={saving} type="submit" className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:opacity-60">{saving ? 'جاري الحفظ...' : 'تأكيد'}</button><button type="button" onClick={() => { if (canSpend) setShowSetup(false); else navigate(-1); }} className="px-2 text-sm font-black text-slate-500">إلغاء</button></div></form></section> : <section className="rounded-[20px] border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-400/25 dark:bg-[#171b26]"><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-500"/><div><h2 className="text-sm font-black">محفظتك مؤمنة</h2><p className="mt-0.5 text-[10px] font-bold text-slate-400">رقم الهاتف مرتبط وآمن برمز PIN.</p></div></div><button onClick={() => setShowSetup(true)} className="mt-3 text-xs font-black text-emerald-600 dark:text-emerald-300">تغيير رمز PIN</button></section>}

            <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-start gap-2"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Gift size={17}/></div><div><h2 className="text-sm font-black">كيف تكسب من محفظتك؟</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عند اكتمال وتسليم طلب مؤهل، تُضاف مكافأة المتجر تلقائيًا إلى محفظتك. قيمة المكافأة الحالية: <span dir="ltr" className="font-mono text-emerald-600 dark:text-emerald-300">$ {walletNumber(walletSettings.defaultReward)}</span>.</p></div></div></section>
            <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10"><ReceiptText size={16} className="text-slate-400"/><h2 className="text-sm font-black">آخر الحركات</h2></div>{transactions.length === 0 ? <p className="px-4 py-8 text-center text-[11px] font-bold text-slate-400">لا توجد حركات في المحفظة حتى الآن.</p> : <div className="divide-y divide-slate-100 dark:divide-white/5">{transactions.slice(0, 12).map(item => { const positive = ['reward', 'credit', 'bonus'].includes(item.type); const date = toDate(item.createdAt); return <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="text-right"><p className="text-[11px] font-black">{transactionLabel(item)}</p><p className="mt-0.5 text-[9px] font-bold text-slate-400">{item.orderId || item.note || 'محفظة المتجر'}{date ? ` · ${new Intl.DateTimeFormat('ar-YE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)}` : ''}</p></div><span dir="ltr" className={`font-mono text-sm font-black ${positive ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500 dark:text-rose-300'}`}>{positive ? '+' : '-'} $ {walletNumber(item.amount)}</span></div>; })}</div>}</section>
            {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[10px] font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">{notice}</div>}
            <Link to="/profile" className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900"><Landmark size={16}/> طلباتك وفواتيرك السابقة</Link>
        </main>
    </div>;
};

export default CustomerWallet;
