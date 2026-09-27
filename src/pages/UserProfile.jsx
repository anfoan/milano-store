import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useSettings } from '../hooks/useSettings';

const UserProfile = () => {
    const { t, direction } = useLanguage();
    const { formatPrice } = useCurrency();
    const { orderedSocialLinks: socialLinks } = useSettings();
    const navigate = useNavigate();
    // Fetch orders history from local storage
    const [orders, setOrders] = React.useState([]);

    React.useEffect(() => {
        const savedOrders = localStorage.getItem('myOrders');
        if (savedOrders) {
            const parsedOrders = JSON.parse(savedOrders);
            const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            // Filter: keep only orders newer than 5 days
            const validOrders = parsedOrders.filter((order) => {
                const ts = order.timestamp
                    ? order.timestamp
                    : order.createdAt
                    ? new Date(order.createdAt).getTime()
                    : order.date
                    ? new Date(order.date).getTime()
                    : null;
                if (!ts) return true; // keep if no timestamp info (legacy)
                return (now - ts) < FIVE_DAYS_MS;
            });

            // Clean up expired orders from localStorage
            if (validOrders.length !== parsedOrders.length) {
                localStorage.setItem('myOrders', JSON.stringify(validOrders));
            }

            // Sort by newest first
            const sortedOrders = validOrders.sort((a, b) => {
                const tsA = a.timestamp || new Date(a.createdAt || a.date || 0).getTime();
                const tsB = b.timestamp || new Date(b.createdAt || b.date || 0).getTime();
                return tsB - tsA;
            });

            setOrders(sortedOrders);
        }
    }, [t]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white pb-4 pt-0 md:pt-2 font-['Cairo'] transition-colors duration-300" dir={direction}>
            <div className="max-w-4xl mx-auto px-4 space-y-2">

                {/* 1. Orders Section */}
                <div className="relative pt-2">
                    {/* Modern Back Button Header - Compact */}
                    <div className="flex items-center gap-3 mb-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                        >
                            <ArrowRight size={20} className="flip-rtl" />
                        </button>
                        <h2 className="text-3xl font-black text-cyan-600 dark:text-cyan-400 leading-tight">{t('profile.title')}</h2>
                    </div>

                    <div className="bg-white dark:bg-[#1a1d23] rounded-[32px] p-1.5 border border-gray-100 dark:border-white/5 shadow-xl dark:shadow-2xl transition-colors duration-300">
                        {/* Section Header: All Orders Bar */}
                        <div className="bg-gray-50 dark:bg-white/5 rounded-t-[28px] px-6 py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-gray-900 dark:text-white font-black text-lg">{t('profile.all_orders')}</span>
                            <span className="bg-cyan-500/10 text-cyan-500 px-3 py-1 rounded-full text-[10px] font-black">{orders.length} {t('home.product_count')}</span>
                        </div>

                        {orders.length > 0 ? (
                            <div className="p-4 md:p-6 space-y-4">
                                {orders.map((order, index) => (
                                    <div key={index} className="bg-gray-50 dark:bg-white/5 rounded-2xl p-6 border border-gray-100 dark:border-white/10 space-y-4 transition-all hover:border-cyan-500/30">
                                        {/* Row 1: Invoice & Date */}
                                        <div className="flex justify-between items-center border-b border-gray-200 dark:border-white/10 pb-3">
                                            <div className="flex flex-col">
                                                <span className="text-gray-400 text-[10px] font-bold uppercase">{t('profile.invoice')}</span>
                                                <span className="text-gray-900 dark:text-white font-mono font-bold text-sm tracking-tight">{order.orderId}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-gray-400 text-[10px] font-bold block">{t('profile.date')}</span>
                                                <span className="text-gray-900 dark:text-white font-mono font-bold text-[11px]" dir="ltr">{order.date}</span>
                                            </div>
                                        </div>

                                        {/* Row 2: Status & Total */}
                                        <div className="flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className="text-gray-400 text-[10px] font-bold">{t('profile.order_status')}</span>
                                                <span className="text-orange-500 dark:text-orange-400 text-xs font-black">
                                                    {t('profile.status_review')}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-gray-900 dark:text-white font-black text-lg leading-none">
                                                    {formatPrice(order.total || 0, order.currency || 'YER')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Footer: Details Link */}
                                        <div className="pt-3 border-t border-gray-200 dark:border-white/10 flex justify-end">
                                            <Link to={`/order-tracking/${order.orderId?.replace('#', '')}`} className="bg-white dark:bg-white/10 px-4 py-2 rounded-xl text-blue-500 dark:text-white font-bold text-xs hover:bg-blue-50 dark:hover:bg-white/20 transition-all border border-gray-100 dark:border-white/5">
                                                {t('profile.click_here')}
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-10 text-center transition-colors duration-300">
                                <h3 className="text-gray-500 font-bold text-xl mb-6">{t('profile.no_orders')}</h3>
                                <Link to="/" className="inline-block px-10 py-3 bg-cyan-500 text-white font-black rounded-xl hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/20 active:scale-95">
                                    {t('profile.shop_now')}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Grid for Rating & Social (Side by side on large screens) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* 2. Rating Section */}
                    <div className="bg-white dark:bg-[#1a1d23] rounded-[32px] p-6 border border-gray-100 dark:border-white/5 shadow-xl dark:shadow-2xl text-center flex flex-col justify-center h-full transition-colors duration-300">
                        <h3 className="text-gray-900 dark:text-white font-black text-xl mb-6">{t('profile.rate_store')}</h3>
                        <Link to="/rate-order" className="block w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl text-white font-black text-lg hover:opacity-90 transition-opacity shadow-lg shadow-blue-500/20">
                            {t('profile.rate_button')}
                        </Link>
                    </div>

                    {/* 3. Social Media Section */}
                    <div className="bg-white dark:bg-[#1a1d23] rounded-[32px] p-8 border border-gray-100 dark:border-white/5 shadow-xl dark:shadow-2xl text-center relative overflow-hidden transition-colors duration-300">
                        {/* Glow Effect */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none"></div>

                        {/* Logo with Fancy Border (Matching Home Page) */}
                        <div className="relative group mb-8 mx-auto w-fit z-10">
                            <div className="absolute inset-0 bg-cyan-400/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
                                <div className="w-full h-full rounded-full border-4 border-white dark:border-[#1a1d23] bg-black flex items-center justify-center overflow-hidden relative">
                                    <img
                                        src="/logo.jpg"
                                        alt="Logo"
                                        className="w-full h-full object-cover"
                                        onError={(e) => e.target.src = "/logo.jpg"}
                                    />
                                </div>
                            </div>
                        </div>

                        <h3 className="text-gray-900 dark:text-white font-black text-xl mb-8 relative z-10">{t('profile.social_media')}</h3>

                        <div className="space-y-4 relative z-10">
                            {socialLinks.map((social) => (
                                <a
                                    key={social.id}
                                    href={social.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    dir="ltr"
                                    className="flex items-center gap-4 bg-gray-50 dark:bg-white/5 rounded-2xl p-4 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border border-gray-100 dark:border-white/5 group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center p-1.5 shrink-0 shadow-sm dark:shadow-none">
                                        <img src={social.img} alt={social.name} className="w-full h-full object-contain" />
                                    </div>
                                    <span className="text-gray-700 dark:text-white font-bold text-lg group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                        {social.name}
                                    </span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default UserProfile;
