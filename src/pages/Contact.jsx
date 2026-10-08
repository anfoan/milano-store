import { useState, useEffect } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

const Contact = () => {
    const { t, direction } = useLanguage();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [messageId, setMessageId] = useState(null);
    const [socialLinks, setSocialLinks] = useState({});

    useEffect(() => {
        const fetchLinks = async () => {
            try {
                const docRef = doc(db, "settings", "social_links");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSocialLinks(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching social links:", error);
            }
        };
        fetchLinks();
    }, []);

    // Dynamic Redirection: Check for existing active session
    useEffect(() => {
        // window.scrollTo(0, 0); // Handled globally by ScrollToTop

        const checkActiveSession = async () => {
            const activeChatId = localStorage.getItem('milano_active_chat');
            if (activeChatId) {
                try {
                    const docRef = doc(db, "contact_messages", activeChatId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        // Only redirect if the chat is NOT closed
                        if (data.status !== 'closed') {
                            setMessageId(activeChatId);
                            setSubmitted(true);
                        }
                    } else {
                        // If chat doesn't exist in DB, clear local session
                        localStorage.removeItem('milano_active_chat');
                    }
                } catch (error) {
                    console.error("Error checking session:", error);
                }
            }
        };

        checkActiveSession();
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Save to Firestore
            const docRef = await addDoc(collection(db, "contact_messages"), {
                ...formData,
                date: new Date().toLocaleString('en-US'),
                createdAt: serverTimestamp(),
                status: 'new',
                isBlocked: false
            });

            // ADD THE INITIAL MESSAGE TO SUB-COLLECTION
            await addDoc(collection(db, "contact_messages", docRef.id, "messages"), {
                text: formData.message,
                sender: 'user',
                createdAt: serverTimestamp(),
            });

            // Persist session locally
            localStorage.setItem('milano_active_chat', docRef.id);

            setMessageId(docRef.id);
            setSubmitted(true);
            window.scrollTo(0, 0);
        } catch (error) {
            console.error("Error submitting form:", error);
            alert(t('contact.error'));
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#111317] flex flex-col p-4 font-['Cairo'] relative overflow-hidden transition-colors duration-300" dir={direction}>
                {/* Back Button Header */}
                <div className="w-full max-w-7xl mx-auto px-4 py-4 flex justify-start z-20">
                    <button
                        onClick={() => navigate('/')}
                        className="w-10 h-10 rounded-full bg-white dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-2xl"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                </div>

                <div className="flex-1 flex items-center justify-center">
                    <div className="max-w-5xl w-full flex flex-col-reverse md:flex-row items-center justify-between gap-8 px-4">

                        {/* Text Section (Right Side) */}
                        <div className="flex-1 text-center md:text-start z-10">
                            <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-6 leading-tight tracking-wide">
                                {t('contact.success_line')}
                                <br />
                                {t('contact.success_click')}
                            </h1>

                            <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
                                <button
                                    onClick={() => navigate(`/chat/${messageId}`)}
                                    className="bg-gradient-to-r from-[#3b82f6] to-[#06b6d4] text-white px-10 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-cyan-500/20 hover:scale-105 transition-transform"
                                >
                                    {t('contact.click_chat')}
                                </button>
                            </div>

                            <p className="mt-6 text-gray-400 dark:text-gray-500 font-bold text-sm">
                                {t('contact.response_hint')}
                            </p>
                        </div>

                        {/* Image Section (Left Side) */}
                        <div className="flex-1 flex justify-center md:justify-end relative">
                            {/* Glow Effect */}
                            <div className="absolute inset-0 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none"></div>

                            <div className="relative w-64 h-64 md:w-[450px] md:h-[450px]">
                                <img
                                    src="/contact.png"
                                    alt="Support Headset"
                                    className="w-full h-full object-contain drop-shadow-2xl animate-float"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    @keyframes float {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-15px); }
                    }
                    .animate-float {
                        animation: float 5s ease-in-out infinite;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b] text-gray-900 dark:text-white pb-10" dir={direction}>
            <div className="max-w-5xl mx-auto px-4 pt-10">

                {/* Modern Back Button Header */}
                <div className="flex items-center gap-3 mb-10">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h1 className="text-3xl font-black">
                        {t('contact.title')} <span className="text-[#06b6d4]">{t('contact.seller')}</span>
                    </h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Name */}
                    <div className="space-y-3">
                        <label className="block text-start font-bold text-sm text-gray-700 dark:text-gray-200">{t('contact.name')}</label>
                        <input
                            type="text"
                            className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/5 rounded-xl px-4 py-4 outline-none focus:border-[#06b6d4] transition-colors text-start text-gray-900 dark:text-white"
                            placeholder=""
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    {/* Email */}
                    <div className="space-y-3">
                        <label className="block text-start font-bold text-sm text-gray-700 dark:text-gray-200">{t('contact.email')}</label>
                        <input
                            type="email"
                            className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/5 rounded-xl px-4 py-4 outline-none focus:border-[#06b6d4] transition-colors text-start text-gray-900 dark:text-white"
                            placeholder=""
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    {/* Subject */}
                    <div className="space-y-3">
                        <label className="block text-start font-bold text-sm text-gray-700 dark:text-gray-200">{t('contact.subject')}</label>
                        <div className="relative">
                            <select
                                className="w-full bg-white dark:bg-[#1c1c1e] border border-[#06b6d4]/50 rounded-xl px-4 py-4 outline-none appearance-none text-start cursor-pointer text-gray-900 dark:text-white"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                required
                            >
                                <option value="">{t('contact.select_option')}</option>
                                <option value="تفاصيل المنتج">{t('contact.subject_options.product_details')}</option>
                                <option value="المنتج غير متوفر">{t('contact.subject_options.not_available')}</option>
                                <option value="تأخر في موعد التسليم">{t('contact.subject_options.delivery_delay')}</option>
                                <option value="آخر">{t('contact.subject_options.other')}</option>
                            </select>
                            <ChevronDown className={`absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${direction === 'rtl' ? 'left-4' : 'right-4'}`} size={20} />
                        </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-3">
                        <label className="block text-start font-bold text-sm text-gray-700 dark:text-gray-200">{t('contact.message')}</label>
                        <textarea
                            rows="6"
                            className="w-full bg-white dark:bg-[#1c1c1e] border border-[#06b6d4]/50 rounded-2xl px-4 py-4 outline-none focus:border-[#06b6d4] transition-colors text-start resize-none text-gray-900 dark:text-white"
                            value={formData.message}
                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                            required
                        />
                        <p className="text-[11px] text-gray-500 text-start mt-1 font-bold">
                            {t('contact.upload_hint')}
                        </p>
                    </div>

                    {/* Send Button */}
                    <div className={`flex ${direction === 'rtl' ? 'justify-end' : 'justify-start'} pt-4`}>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-gradient-to-r from-[#3b82f6] to-[#06b6d4] text-white px-12 py-3.5 rounded-xl font-black text-lg shadow-lg hover:shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? t('contact.sending') : t('contact.send')}
                        </button>
                    </div>
                </form>

                {/* Seller Info Card */}
                <div className="mt-20 bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/5 rounded-[40px] p-8 relative overflow-hidden shadow-sm dark:shadow-none">
                    <div className="flex flex-col items-center">
                        {/* Avatar */}
                        <div className="w-32 h-32 rounded-full p-[3px] bg-gradient-to-b from-[#3b82f6] via-[#06b6d4] to-[#3b82f6] mb-4">
                            <div className="w-full h-full rounded-full bg-zinc-950 p-1">
                                <img
                                    src="/logo.jpg"
                                    alt="Milano Logo"
                                    className="w-full h-full rounded-full object-cover"
                                    onError={(e) => e.target.src = "/logo.jpg"}
                                />
                            </div>
                        </div>


                        <div className="flex gap-1 text-yellow-400 mb-8">
                            {[1, 2, 3, 4, 5].map(i => <span key={i} className="text-2xl">★</span>)}
                        </div>

                        <div className="w-full space-y-6">
                            <h4 className="text-gray-900 dark:text-white font-black text-center text-lg mb-6">{t('contact.social_media')}</h4>

                            <div className="flex gap-2 md:gap-4 flex-wrap justify-center">
                                {(socialLinks?.linkOrder || ['whatsapp', 'instagram', 'tiktok', 'facebook', 'snapchat', 'youtube', 'twitter', 'googlemap'])
                                    .filter(id => socialLinks[id])
                                    .map((id, idx) => {
                                        const iconMap = {
                                            facebook: "https://b3na.com/Store-assets/img/Facebook.webp",
                                            instagram: "https://b3na.com/Store-assets/img/Instagram.webp",
                                            tiktok: "https://b3na.com/Store-assets/img/Tiktok.webp",
                                            whatsapp: "https://b3na.com/Store-assets/img/Whatsapp.webp",
                                            snapchat: "https://b3na.com/Store-assets/img/Snapchat.webp",
                                            youtube: "https://b3na.com/Store-assets/img/Youtube.webp",
                                            twitter: "/twitter.png",
                                            googlemap: "https://b3na.com/Store-assets/img/GoogleMap.webp"
                                        };
                                        const labelMap = {
                                            facebook: "Facebook",
                                            instagram: "Instagram",
                                            tiktok: "TikTok",
                                            whatsapp: "WhatsApp",
                                            snapchat: "Snapchat",
                                            youtube: "YouTube",
                                            twitter: "Twitter",
                                            googlemap: "Google Map"
                                        };
                                        return (
                                            <a
                                                key={idx}
                                                href={socialLinks[id]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center rounded-xl md:rounded-[20px] bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
                                                title={labelMap[id]}
                                            >
                                                <img 
                                                    src={iconMap[id]} 
                                                    alt={labelMap[id]} 
                                                    style={{ width: (id === 'googlemap' || id === 'twitter') ? '20px' : '24px' }} 
                                                    className="object-contain" 
                                                />
                                            </a>
                                        );
                                    })
                                }
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/5 text-center">
                                <h3 className="text-gray-900 dark:text-white font-black text-xl mb-1 truncate px-4">
                                    {t('rate.store_title')}
                                </h3>
                            </div>
                        </div>
                    </div>
                </div>


            </div>
        </div>
    );
};

export default Contact;
