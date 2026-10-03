import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gift, KeyRound, Landmark, Power, ShieldCheck, Wallet, X } from 'lucide-react';
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clearCustomerPhoneWalletId, getCustomerWalletId, getPhoneWalletId, hashWalletPin, isValidWalletPin, normalizePhone, setCustomerPhoneWalletId, walletNumber } from '../lib/wallet';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../hooks/useSettings';

const CustomerWallet = () => {
    const { direction } = useLanguage();
    const { generalSettings } = useSettings();
    const navigate = useNavigate();
    const [walletId, setWalletId] = useState(() => getCustomerWalletId());
    const [wallet, setWallet] = useState(null);
    const [walletSettings, setWalletSettings] = useState({ defaultReward: 500, enabled: true });
    const [walletSettingsLoaded, setWalletSettingsLoaded] = useState(false);
    const [walletSettingsAvailable, setWalletSettingsAvailable] = useState(false);
    const [loading, setLoading] = useState(true);
    const [screen, setScreen] = useState(() => getCustomerWalletId().startsWith('phone-') ? 'wallet' : 'login');
    const [loginPhone, setLoginPhone] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginSaving, setLoginSaving] = useState(false);
    const [registrationPhone, setRegistrationPhone] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const [noticeTone, setNoticeTone] = useState('success');
    const storeName = generalSettings?.storeName?.trim() || 'ميلانو';

    useEffect(() => {
        setLoading(true);
        const walletRef = doc(db, 'customer_wallets', walletId);
        const configRef = doc(db, 'settings', 'wallet');
        const stopWallet = onSnapshot(walletRef, snapshot => {
            setWallet(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
            setLoading(false);
        }, () => setLoading(false));
        const stopConfig = onSnapshot(configRef, snapshot => {
            if (snapshot.exists()) setWalletSettings(previous => ({ ...previous, ...snapshot.data() }));
            setWalletSettingsAvailable(snapshot.exists());
            setWalletSettingsLoaded(true);
        }, () => {
            setWalletSettingsAvailable(false);
            setWalletSettingsLoaded(true);
        });
        return () => { stopWallet(); stopConfig(); };
    }, [walletId]);

    useEffect(() => {
        if (walletSettingsLoaded && walletSettings.enabled === false) navigate('/', { replace: true });
    }, [walletSettingsLoaded, walletSettings.enabled, navigate]);

    const loginToWallet = async event => {
        event.preventDefault();
        if (walletSettings.enabled === false) return;
        const phoneWalletId = getPhoneWalletId(normalizePhone(loginPhone));
        const localPhone = phoneWalletId.replace(/^phone-/, '');
        if (!phoneWalletId || localPhone.length < 7) { setNoticeTone('error'); setNotice('أدخل رقم هاتف صحيح.'); return; }
        if (!isValidWalletPin(loginPassword)) { setNoticeTone('error'); setNotice('أدخل كلمة مرور صحيحة من 4 إلى 6 أرقام.'); return; }
        setLoginSaving(true); setNotice('');
        try {
            const snapshot = await getDoc(doc(db, 'customer_wallets', phoneWalletId));
            const passwordHash = await hashWalletPin(loginPassword);
            if (!snapshot.exists() || !snapshot.data().pinConfigured || snapshot.data().pinHash !== passwordHash) throw new Error('INVALID_LOGIN');
            setCustomerPhoneWalletId(localPhone);
            setWalletId(phoneWalletId);
            setLoginPassword('');
            setNoticeTone('success');
            setNotice('تم تسجيل الدخول إلى المحفظة بنجاح.');
            setScreen('wallet');
        } catch (error) {
            console.error('Wallet login error:', error);
            setNoticeTone('error');
            setNotice('رقم الهاتف أو كلمة المرور غير صحيحة.');
        } finally { setLoginSaving(false); }
    };

    const configureWallet = async event => {
        event.preventDefault();
        if (walletSettings.enabled === false) return;
        const normalizedInput = normalizePhone(registrationPhone);
        const phoneWalletId = getPhoneWalletId(normalizedInput);
        const localPhone = phoneWalletId.replace(/^phone-/, '');
        if (!phoneWalletId || localPhone.length < 7) { setNoticeTone('error'); setNotice('أدخل رقم هاتف صحيح لربط المحفظة.'); return; }
        if (!isValidWalletPin(pin)) { setNoticeTone('error'); setNotice('كلمة المرور يجب أن تكون من 4 إلى 6 أرقام إنجليزية.'); return; }
        if (pin !== confirmPin) { setNoticeTone('error'); setNotice('تأكيد كلمة المرور غير متطابق.'); return; }
        if (!walletSettingsLoaded) { setNoticeTone('error'); setNotice('جاري تحميل إعدادات المحفظة، حاول بعد لحظات.'); return; }
        setSaving(true); setNotice(''); setNoticeTone('success');
        try {
            const pinHash = await hashWalletPin(pin);
            const walletRef = doc(db, 'customer_wallets', phoneWalletId);
            const credentialRef = doc(db, 'wallet_customer_credentials', phoneWalletId);
            await runTransaction(db, async transaction => {
                const snapshot = await transaction.get(walletRef);
                const previous = snapshot.exists() ? snapshot.data() : {};
                if (snapshot.exists() && previous.pinConfigured && phoneWalletId !== walletId) throw new Error('PHONE_ALREADY_REGISTERED');
                const isNewPhoneWallet = !snapshot.exists();
                const initialReward = walletSettingsAvailable && walletSettings.enabled !== false
                    ? Math.max(0, Number(walletSettings.defaultReward || 0))
                    : 0;
                const walletData = {
                    walletId: phoneWalletId,
                    phone: localPhone,
                    balance: isNewPhoneWallet ? initialReward : Number(previous.balance || 0),
                    pinHash,
                    pinConfigured: true,
                    deviceBound: true,
                    updatedAt: serverTimestamp()
                };
                if (isNewPhoneWallet) walletData.createdAt = serverTimestamp();
                transaction.set(walletRef, walletData, { merge: true });
                transaction.set(credentialRef, { walletId: phoneWalletId, phone: localPhone, password: pin, updatedAt: serverTimestamp() }, { merge: true });
            });
            setCustomerPhoneWalletId(localPhone);
            setWalletId(phoneWalletId);
            setLoginPhone(localPhone);
            setLoginPassword('');
            setPin(''); setConfirmPin('');
            setNoticeTone('success');
            setNotice('تم تأمين وربط محفظتك بنجاح.');
            setScreen('wallet');
        } catch (error) {
            console.error('Wallet setup error:', error);
            setNoticeTone('error');
            setNotice(error?.message === 'PHONE_ALREADY_REGISTERED'
                ? 'تعذر حفظ إعدادات المحفظة : لأن الرقم مسجل مسبقاً.'
                : 'تعذّر حفظ إعدادات المحفظة. حاول مرة أخرى.');
        } finally { setSaving(false); }
    };

    const openCreateAccount = () => {
        setRegistrationPhone('');
        setPin('');
        setConfirmPin('');
        setNotice('');
        setScreen('create');
    };

    const openPasswordChange = () => {
        setRegistrationPhone(wallet?.phone || '');
        setPin('');
        setConfirmPin('');
        setNotice('');
        setScreen('create');
    };

    const closeWallet = () => {
        const deviceWalletId = clearCustomerPhoneWalletId();
        setWalletId(deviceWalletId);
        setWallet(null);
        setLoginPhone('');
        setLoginPassword('');
        setNotice('');
        setScreen('login');
        navigate(-1);
    };

    const walletSessionOpen = walletId.startsWith('phone-');
    const balance = Number(wallet?.balance || 0);
    const noticeView = notice && <div className={`rounded-xl border px-3 py-2 text-center text-[10px] font-bold ${noticeTone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>{notice}</div>;

    if (walletSettingsLoaded && walletSettings.enabled === false) return null;

    return <div dir={direction} className="min-h-screen bg-[#f6f7f8] px-3 py-5 font-['Cairo'] text-slate-900 dark:bg-[#0d1017] dark:text-white md:px-5">
        <main className="mx-auto w-full max-w-md space-y-4 pb-8">
            <header dir="ltr" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#171b26]">
                <div className="flex items-start gap-2"><button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={18}/></button>{walletSessionOpen && <button type="button" onClick={closeWallet} className="flex flex-col items-center gap-0.5 text-rose-500 transition hover:text-rose-600"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50/80 dark:border-rose-400/30 dark:bg-rose-400/10"><Power size={15}/></span><span className="whitespace-nowrap text-[7px] font-black">إغلاق محفظتك</span></button>}</div>
                <div dir="rtl" className="flex items-center gap-2"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Wallet size={18}/></div><div className="text-right"><h1 className="text-sm font-black">محفظة {storeName}</h1><p className="text-[9px] font-bold text-slate-400">رصيدك وتأمين استخدامه في الطلبات</p></div></div>
            </header>

            {screen === 'login' && <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#171b26]">
                <div className="flex items-start gap-2 text-right"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Wallet size={18}/></div><div className="flex-1"><h2 className="text-sm font-black">تسجيل الدخول إلى محفظة {storeName}</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">أدخل رقم هاتفك وكلمة المرور للوصول إلى رصيد محفظتك.</p></div></div><form onSubmit={loginToWallet} className="mt-4 space-y-3"><input value={loginPhone} onChange={event => setLoginPhone(event.target.value)} type="tel" inputMode="tel" placeholder="رقم الهاتف" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right text-sm font-bold outline-none placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><input value={loginPassword} onChange={event => setLoginPassword(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="كلمة المرور" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-center font-mono text-sm font-black outline-none placeholder:font-['Cairo'] placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><button disabled={loginSaving} type="submit" className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:opacity-60">{loginSaving ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}</button></form><button type="button" onClick={openCreateAccount} className="mt-4 w-full text-center text-xs font-black text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-300">إنشاء حساب جديد</button></section>}

            {screen === 'create' && <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#171b26]">
                <div className="flex items-start gap-2 text-right"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><KeyRound size={17}/></div><div className="flex-1"><h2 className="text-sm font-black">ربط وتأمين المحفظة برقم هاتفك</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عيّن رمزًا سريًا من 4 إلى 6 أرقام. لن يُسمح باستخدام رصيدك عند الشراء إلا بعد إدخال الرمز السري.</p></div></div><form onSubmit={configureWallet} className="mt-4"><input value={registrationPhone} onChange={event => setRegistrationPhone(event.target.value)} type="tel" inputMode="tel" placeholder="رقم الهاتف" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-right text-sm font-bold outline-none placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><div className="mt-3 grid grid-cols-2 gap-2"><input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="الرمز السري" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-center font-mono text-sm font-black outline-none placeholder:font-['Cairo'] placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/><input value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" placeholder="تأكيد الرمز" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-center font-mono text-sm font-black outline-none placeholder:font-['Cairo'] placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-white/5" required/></div><div className="mt-3 flex items-center gap-3"><button disabled={saving || !walletSettingsLoaded} type="submit" className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-600 disabled:opacity-60">{saving ? 'جاري الحفظ...' : !walletSettingsLoaded ? 'جاري تحميل المحفظة...' : 'تأكيد'}</button><button type="button" onClick={() => setScreen('login')} className="px-2 text-sm font-black text-slate-500">إلغاء</button></div></form></section>}

            {screen === 'wallet' && <>
                <section className="rounded-[20px] border border-emerald-300 bg-gradient-to-br from-emerald-100 to-emerald-50 p-4 text-center shadow-sm dark:border-emerald-400/40 dark:from-emerald-400/15 dark:to-emerald-400/5"><p className="text-[10px] font-black text-emerald-800 dark:text-emerald-200">رصيد المحفظة الحالي</p><p dir="ltr" className="mt-1 font-mono text-4xl font-black text-emerald-600 dark:text-emerald-300">$ {loading ? '...' : walletNumber(balance)}</p><p className="mt-1 text-[9px] font-bold text-emerald-700/75 dark:text-emerald-200/75">رصيد نقدي متاح لك في المتجر</p></section>
                <section className="rounded-[20px] border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-400/25 dark:bg-[#171b26]"><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-500"/><div><h2 className="text-sm font-black">محفظتك مؤمنة</h2><p className="mt-0.5 text-[10px] font-bold text-slate-400">رقم الهاتف مرتبط وآمن بكلمة المرور.</p></div></div><button onClick={openPasswordChange} className="mt-3 text-xs font-black text-emerald-600 dark:text-emerald-300">تغيير كلمة المرور</button></section>
                <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-start gap-2"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Gift size={17}/></div><div><h2 className="text-sm font-black">كيف تكسب مبلغاً مالياً إضافياً الى محفظتك؟</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عند شراء أي منتج بقيمة 4,000 ريال يمني أو أكثر، واكتمال طلبك وتسليمه بنجاح، تُضاف مكافأة المتجر تلقائياً إلى محفظتك. قيمة المكافأة الحالية: 300 ريال يمني</p></div></div></section>
                <Link to="/profile" className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900"><Landmark size={16}/> طلباتك وفواتيرك السابقة</Link>
            </>}

            {screen !== 'wallet' && <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#171b26]"><div className="flex items-start gap-2"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><Gift size={17}/></div><div><h2 className="text-sm font-black">كيف تكسب مبلغاً مالياً إضافياً الى محفظتك؟</h2><p className="mt-1 text-[10px] font-bold leading-5 text-slate-500 dark:text-slate-300">عند شراء أي منتج بقيمة 4,000 ريال يمني أو أكثر، واكتمال طلبك وتسليمه بنجاح، تُضاف مكافأة المتجر تلقائياً إلى محفظتك. قيمة المكافأة الحالية: 300 ريال يمني</p></div></div></section>}

            {noticeView}
        </main>
    </div>;
};

export default CustomerWallet;
