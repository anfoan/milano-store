import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Star, MapPin, Search, Clock, ShieldCheck, Info, Facebook, Instagram, Music2, Share2, Map as MapIcon, Package, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, doc, getDoc, onSnapshot, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import DraggableScrollContainer from '../components/DraggableScrollContainer';

const Home = () => {
    // SECURITY & DATA FIX: Clear old cache if project has changed
    const currentProjectId = "milano-store-53d33"; // New Project ID
    const storedProjectId = localStorage.getItem('active_project_id');

    if (storedProjectId !== currentProjectId) {
        localStorage.removeItem('cached_products');
        localStorage.removeItem('cached_categories');
        localStorage.setItem('active_project_id', currentProjectId);
    }

    const [storeStatus, setStoreStatus] = useState('open');
    const [products, setProducts] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_products');
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            console.error("Cache error:", e);
            return [];
        }
    });
    const [loading, setLoading] = useState(!products.length);
    const [categories, setCategories] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_categories');
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });
    const [allCategories, setAllCategories] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_all_categories');
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });
    const { t, language } = useLanguage();
    const { formatPrice } = useCurrency();
    // Global Settings
    const { interfaceSettings, generalSettings, imageSettings, socialLinks: settingsSocialLinks, orderedSocialLinks, loading: settingsLoading } = useSettings();

    // Use socialLinks from hook
    const socialLinks = settingsSocialLinks || {};

    // Safety checks
    const showOffers = interfaceSettings?.showOffersSection; // Controlled by admin settings
    const coverImage = imageSettings?.coverImage || "/banner.jpeg";
    const profileImage = imageSettings?.profileImage || "/logo.jpg";
    const storeName = generalSettings?.storeName || 'متجر ميلانو';
    const brandImages = imageSettings?.brands || {};
    const contactEnabled = interfaceSettings?.contactForm ?? true;
    const showCategoriesGrid = interfaceSettings?.showCategories; // Controls the top Categories Grid ("أقسام المتجر")
    const showProductSections = true; // Always show product rows to ensure content visibility

    // Calculate max discount for the banner
    const maxDiscount = products.length > 0
        ? Math.max(...products.filter(p => !p.hidden).map(p => p.discount || 0), 0) || 50 // Skip hidden products
        : 50;
    const hideOutOfStock = interfaceSettings?.hideOutOfStock;
    const categoryScrollRef = useRef(null);
    const [activeCatPage, setActiveCatPage] = useState(0);
    const [isDesktopView, setIsDesktopView] = useState(window.innerWidth >= 768);

    const [minHeightShim, setMinHeightShim] = useState('100vh');
    const isRestoring = useRef(true); // Guard against overwriting storage with 0 on load
    const containerRef = useRef(null);

    useEffect(() => {
        const handleResize = () => setIsDesktopView(window.innerWidth >= 768);
        window.addEventListener('resize', handleResize);

        // CRITICAL: Force browser to STOP messing with scroll
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        // Initial check: if no saved pos, we are not restoring
        if (!sessionStorage.getItem('home_scroll_pos')) {
            isRestoring.current = false;
        }

        // Manual Scroll Restoration Logic inside Home
        const saveScroll = () => {
            // CRITICAL 1: Don't save if we are still trying to restore the old position
            if (isRestoring.current) return;

            // CRITICAL 2: Don't save if we have already navigated away
            if (window.location.pathname !== '/') return;

            sessionStorage.setItem('home_scroll_pos', window.scrollY.toString());

            // SAVE EXACT COMPONENT HEIGHT
            if (containerRef.current) {
                sessionStorage.setItem('home_container_height', containerRef.current.offsetHeight.toString());
            }
        };
        window.addEventListener('scroll', saveScroll, { passive: true });

        // Try to restore
        const restoreScroll = () => {
            const saved = sessionStorage.getItem('home_scroll_pos');
            const savedHeight = sessionStorage.getItem('home_container_height');

            if (saved) {
                const hasData = products.length > 0;
                if (!hasData) return;

                const y = parseInt(saved, 10);

                // Perfect Shim: Use exact component height
                let shimHeight = y + 1000;
                if (savedHeight) {
                    shimHeight = parseInt(savedHeight, 10);
                }

                setMinHeightShim(`${shimHeight}px`);

                requestAnimationFrame(() => {
                    window.scrollTo(0, y);
                });

                setTimeout(() => {
                    setMinHeightShim('100vh');
                    isRestoring.current = false;
                }, 500);
            } else {
                isRestoring.current = false;
            }
        };

        restoreScroll();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', saveScroll);
        };
    }, [products.length]); // Re-run when products load

    const handleCategoryScroll = (e) => {
        const container = e.target;
        const scrollPosition = Math.abs(container.scrollLeft);
        const pageWidth = container.offsetWidth;
        const newPage = Math.round(scrollPosition / pageWidth);
        if (newPage !== activeCatPage) {
            setActiveCatPage(newPage);
        }
    };


    useEffect(() => {
        // 1. Real-time Store Status Sync
        const statusRef = doc(db, 'settings', 'store');
        const unsubscribeStatus = onSnapshot(statusRef, (docSnap) => {
            if (docSnap.exists()) {
                setStoreStatus(docSnap.data().isOpen ? 'open' : 'closed');
            } else {
                // Initialize if missing
                setDoc(statusRef, { isOpen: true });
                setStoreStatus('open');
            }
        }, (error) => {
            console.error("Error fetching store status:", error);
            setStoreStatus('open'); // Default to open on error
        });

        // 2. Visitor Tracking (Once per session)
        const trackVisitor = async () => {
            const hasVisited = sessionStorage.getItem('visited_today');
            if (!hasVisited) {
                try {
                    const todayDate = new Date().toISOString().split('T')[0];
                    const statsRef = doc(db, 'daily_stats', todayDate);

                    // Atomically increment visitor count
                    await setDoc(statsRef, {
                        visitors: increment(1),
                        date: serverTimestamp()
                    }, { merge: true });

                    sessionStorage.setItem('visited_today', 'true');
                    console.log("Visitor tracked for:", todayDate);
                } catch (error) {
                    console.error("Error tracking visitor:", error);
                }
            }
        };
        trackVisitor();

        // 3. Real-time Products & Categories Sync
        const unsubCategories = onSnapshot(collection(db, "categories"), (catSnapshot) => {
            const rawCats = catSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            const sortedCats = rawCats.sort((a, b) => (a.order || 9999) - (b.order || 9999));
            setAllCategories(sortedCats);
            localStorage.setItem('cached_all_categories', JSON.stringify(sortedCats));
        }, (err) => console.error("Error fetching categories:", err));

        const unsubProducts = onSnapshot(query(collection(db, "products")), (productSnapshot) => {
            const items = productSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => (a.order || 999999) - (b.order || 999999));

            setProducts(items);
            localStorage.setItem('cached_products', JSON.stringify(items));
            setLoading(false);

            // Update Categories list based on active products (Filtering out hidden ones)
            const productCategories = [...new Set(items.filter(p => !p.hidden).map(p => p.category).filter(Boolean))];
            setAllCategories(prevCats => {
                const orderedCategoryNames = prevCats.map(c => c.name);
                let finalCategories = orderedCategoryNames.filter(name => productCategories.includes(name));
                productCategories.forEach(name => {
                    if (!finalCategories.includes(name)) {
                        finalCategories.push(name);
                    }
                });
                setCategories(finalCategories);
                localStorage.setItem('cached_categories', JSON.stringify(finalCategories));
                return prevCats;
            });
        }, (err) => {
            console.error("Error fetching products:", err);
            setLoading(false);
        });

        return () => {
            unsubscribeStatus();
            unsubCategories();
            unsubProducts();
        };
    }, []);

    const isClosed = storeStatus === 'closed';

    // Improved Loading Logic: Only show full-page spinner if we have NO data at all
    // If we have cached products, we show them immediately to preserve scroll height
    if (loading && products.length === 0) return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div
            ref={containerRef}
            className="w-full bg-gray-50 dark:bg-[#111317] min-h-screen text-gray-900 dark:text-white pb-0 font-['Cairo'] transition-colors duration-300"
            style={{ minHeight: minHeightShim }}
        >
            {/* Store Profile Header Section (Condensed) */}
            <section className="relative px-1 pt-0 mb-0">
                <div className="max-w-5xl mx-auto border-transparent pb-0">

                    {/* Info Container - Reduced margin to raise the title slightly */}
                    <div className="relative flex flex-col items-center mt-2">

                        {/* Brands Logo Row & Badge */}
                        <div className="text-center w-full px-2">
                            <div className="flex items-center justify-center gap-4 md:gap-6 mb-3 mt-1">
                                {/* Nike */}
                                <img 
                                    src={brandImages.nike || "/nike.png"}
                                    alt="Nike" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Adidas */}
                                <img 
                                    src={brandImages.adidas || "/adidas.png"}
                                    alt="Adidas" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Puma */}
                                <img 
                                    src={brandImages.puma || "/puma.png"}
                                    alt="Puma" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Lacoste */}
                                <img 
                                    src={brandImages.lacoste || "/lacoste.png"}
                                    alt="Lacoste" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                            </div>
                            <div className="inline-flex items-center gap-1.5 mb-3">
                                <span className="text-[11px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest bg-cyan-100 dark:bg-cyan-400/10 px-3 py-1 rounded-full border border-cyan-200 dark:border-cyan-400/20">{t('home.seller_rating')}</span>
                            </div>
                            <div className="flex justify-center gap-1.5 text-yellow-500">
                                {[1, 2, 3, 4, 5].map(i => <Star key={i} size={20} fill="currentColor" />)}
                            </div>
                        </div>

                        {/* Main Action Buttons - Pointing to internal routes */}
                        <div className="flex gap-4 mt-2 justify-center px-1">
                            {contactEnabled && (
                                <Link
                                    to="/contact"
                                    className="w-32 md:w-36 py-2.5 text-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black text-sm shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-95 transition-all outline-none"
                                    draggable="false"
                                >
                                    {t('home.contact')}
                                </Link>
                            )}
                            <Link
                                to="/reviews"
                                className="w-32 md:w-36 py-2.5 text-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black text-sm shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-95 transition-all outline-none"
                                draggable="false"
                            >
                                {t('home.reviews')}
                            </Link>
                        </div>

                        {/* Social Media Row */}
                        <div className="flex gap-4 mt-3 flex-wrap justify-center px-1">
                            {orderedSocialLinks.map((item, idx) => (
                                <a
                                    key={idx}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-12 h-12 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                                >
                                    <img src={item.img} alt={item.name} style={{ width: item.size }} className="drop-shadow-sm" draggable="false" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Horizontal Divider */}
                    <div className="max-w-4xl mx-auto my-2 px-1">
                        <div className="h-px w-full bg-white/5"></div>
                    </div>

                    {/* Stats Grid - 4 Columns for Mobile & Desktop */}
                    <div className="max-w-4xl mx-auto px-2 md:px-4">
                        <div className="grid grid-cols-4 gap-2 md:gap-8 text-center items-end">

                            {/* 1. Location (Rightmost) */}
                            <Link to="/info" className="space-y-3 group" draggable="false">
                                <div className="w-10 h-10 md:w-12 md:h-12 mx-auto rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 transition-colors group-hover:bg-orange-500/20 border border-orange-500/10">
                                    <img src="https://b3na.com/Store-assets/img/gps.webp" alt="GPS" className="w-6 h-6 md:w-7 md:h-7 object-contain" draggable="false" />
                                </div>
                                <span className="block text-xs md:text-sm font-black text-gray-900 dark:text-white leading-none">{t('home.location')}</span>
                            </Link>

                            {/* 2. Flag & Country */}
                            {interfaceSettings.showCountryFlag && (
                                <div className="space-y-3">
                                    <div className="w-10 h-6 md:w-14 md:h-9 mx-auto rounded overflow-hidden shadow-sm border border-gray-200 dark:border-white/10 mt-2">
                                        <img
                                            src={`https://flagcdn.com/w80/${generalSettings.countryFlag || 'ye'}.png`}
                                            alt="Country"
                                            className="w-full h-full object-cover"
                                            draggable="false"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </div >
                                    <span className="block text-xs md:text-sm font-black text-gray-900 dark:text-white leading-none">
                                        {(() => {
                                            const loc = (generalSettings.storeLocation || '').toLowerCase();
                                            const flag = (generalSettings.countryFlag || '').toLowerCase();

                                            if (loc === 'yemen' || loc === 'اليمن' || flag === 'ye') return t('common.yemen');
                                            if (loc === 'saudi arabia' || loc === 'السعودية' || flag === 'sa') return t('common.saudi');
                                            if (loc === 'egypt' || loc === 'مصر' || flag === 'eg') return t('common.egypt');
                                            if (loc === 'united arab emirates' || loc === 'uae' || loc === 'الإمارات' || flag === 'ae') return t('common.uae');

                                            return generalSettings.storeLocation || t('common.yemen');
                                        })()}
                                    </span>
                                </div >
                            )}

                            <div className="space-y-3 mt-1">
                                <span className="block text-[10px] md:text-[11px] font-black text-gray-500 dark:text-gray-500 uppercase tracking-widest whitespace-nowrap">{t('home.product_count')}</span>
                                <span className="block text-sm md:text-base font-black text-gray-900 dark:text-white border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-white/5 rounded-lg py-1 px-2 mx-auto w-fit min-w-[40px]">
                                    {products.filter(p => {
                                        const isVisible = !p.hidden;
                                        const hasStock = hideOutOfStock ? (Number(p.stock || 0) > 0) : true;
                                        return isVisible && hasStock;
                                    }).length}
                                </span>
                            </div>

                            {/* 4. Orders (Leftmost) */}
                            <Link to="/profile" className="flex flex-col items-center justify-end space-y-2 group translate-y-1" draggable="false">
                                <div className="transition-transform group-hover:scale-110 active:scale-95 duration-300">
                                    <span className="text-[34px] md:text-[40px] block drop-shadow-md select-none leading-none">🛍️</span>
                                </div>
                                <span className="block text-xs md:text-sm font-black text-gray-900 dark:text-white leading-none tracking-tight">طلباتك</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Offers Section - Dynamic */}
            {/* Offers Section - Controlled by 'showOffersSection' */}
            {showOffers && products.filter(p => (p.discount > 0 || p.oldPrice) && !p.hidden).length > 0 && (
                <section className="w-full px-1 mb-5 mt-2">
                    <div className="flex items-center justify-between mb-2 px-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg md:text-xl font-black text-[#f43f5e]">عروض و خصومات</h2>
                            <span className="text-2xl leading-none">🎉</span>
                            <img src="/nav-offers.png" alt="Offers" className="w-8 h-8 md:w-9 md:h-9 object-contain" />
                        </div>
                    </div>

                    <Link to="/offers" className="block">
                        <div className="shimmer-card relative overflow-hidden bg-gradient-to-r from-pink-600 to-rose-500 rounded-[28px] pt-3 pb-3 px-4 md:p-6 text-white shadow-xl shadow-pink-500/20 group hover:scale-[1.01] transition-transform duration-500">
                            {/* Decorative Elements */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-110 transition-transform duration-700"></div>
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-400/20 rounded-full -ml-16 -mb-16 blur-2xl group-hover:scale-125 transition-transform duration-700"></div>

                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-1.5 md:gap-8">
                                {/* Discount Box - Horizontal phrase */}
                                <div className="flex items-center justify-center bg-white/10 backdrop-blur-md px-6 py-2 rounded-[24px] border border-white/20 min-w-fit shadow-inner">
                                    <span className="text-xl md:text-3xl font-black text-white drop-shadow-md">
                                        خصومات تصل إلى {maxDiscount}%
                                    </span>
                                </div>

                                {/* Text & Button Content */}
                                <div className="text-center md:text-right flex-1 flex flex-col items-center md:items-start">
                                    <h2 className="text-xl md:text-3xl font-black mb-0.5 leading-tight flex items-center justify-center md:justify-start">
                                        عروض خاصة لا تفوت!
                                    </h2>
                                    <p className="text-pink-100 font-bold text-[13px] md:text-base mb-1.5 text-center md:text-right leading-relaxed">
                                        استفد من تخفيضاتنا المميزة واغتنم فرصة التوفير.
                                    </p>
                                    <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-6 py-2 rounded-xl font-black text-xs md:text-sm hover:bg-yellow-300 transition-all hover:scale-105 shadow-lg shadow-yellow-400/20">
                                        <span>استعرض الخصومات</span>
                                        <ArrowRight size={16} className="flip-rtl" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Link>
                </section>
            )}

            {/* Store Categories Grid - Controlled by 'showCategories' */}
            {showCategoriesGrid && allCategories.length > 0 && (
                <section className="w-full px-0 mb-6 mt-4">
                    <div className="flex items-center justify-between mb-2 px-3">
                        <div className="flex items-center gap-2">
                            <div className="h-5 w-1 bg-blue-600 rounded-full"></div>
                            <h2 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">الأقسام</h2>
                        </div>
                    </div>

                    <div
                        ref={categoryScrollRef}
                        onScroll={handleCategoryScroll}
                        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-0"
                    >
                        {/* Final Precise Chunking: 6 for Mobile (3x2), 12 for Desktop (6x2) */}
                        {(() => {
                            const chunkSize = isDesktopView ? 12 : 6;
                            const pages = Math.ceil(allCategories.length / chunkSize);

                            return Array.from({ length: pages }).map((_, pageIdx) => (
                                <div key={pageIdx} className="w-full flex-shrink-0 snap-start px-1">
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                        {allCategories.slice(pageIdx * chunkSize, pageIdx * chunkSize + chunkSize).map((cat) => (
                                            <Link
                                                to={`/category/${encodeURIComponent(cat.name)}`}
                                                key={cat.id}
                                                className="flex flex-col items-center px-1.5 pt-2 pb-1 min-h-[115px] md:min-h-[110px] bg-white dark:bg-[#1a1d23] rounded-[16px] border border-gray-100 dark:border-white/5 hover:border-cyan-500/30 transition-all shadow-sm"
                                            >
                                                <div className="w-full aspect-square mb-0.5 relative shrink-0 overflow-hidden rounded-[12px]">
                                                    <img
                                                        src={cat.image || "/catalog.png"}
                                                        alt={cat.name}
                                                        className="w-full h-full object-cover scale-100 group-hover:scale-110 transition-transform duration-500"
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                </div>
                                                <span className="text-gray-900 dark:text-white font-black text-[11px] md:text-[12px] text-center leading-tight line-clamp-2 w-full mt-auto mb-1">{cat.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>

                    {/* Dynamic Pagination Dots */}
                    {(() => {
                        const chunkSize = isDesktopView ? 12 : 6;
                        const pages = Math.ceil(allCategories.length / chunkSize);

                        return pages > 1 && (
                            <div className="flex justify-center gap-1.5 mt-4">
                                {Array.from({ length: pages }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${activeCatPage === i ? 'w-6 bg-cyan-500' : 'w-1.5 bg-gray-300 dark:bg-gray-700'}`}
                                    />
                                ))}
                            </div>
                        );
                    })()}
                </section>
            )}

            {/* Main Content: Categories & Products */}
            {
                showProductSections && (
                    <div className="w-full px-0 space-y-4 md:space-y-6 mt-4 md:mt-6 pt-1">
                        {categories.map((cat, catIdx) => {
                            const categoryProducts = products.filter(p => {
                                const matchesCategory = p.category === cat;
                                const isVisible = !p.hidden;
                                const hasStock = hideOutOfStock ? (Number(p.stock || 0) > 0) : true;
                                return matchesCategory && isVisible && hasStock;
                            });

                            if (categoryProducts.length === 0 && !loading) return null;

                            return (
                                <section key={catIdx} id={`cat-${cat}`} className="mt-2 md:mt-4">
                                    <div className="flex items-center justify-between mb-2 px-3">
                                        <div className="flex items-center gap-2"> {/* Distinct gap */}
                                            <div className="h-4 w-1 bg-[#ce2b37] rounded-full"></div>
                                            <h2 className="text-sm md:text-xl font-black">{cat}</h2>
                                        </div>
                                    </div>


                                    <DraggableScrollContainer className="flex gap-1 overflow-x-auto pb-6 pt-2 scrollbar-hide">
                                        {loading ? (
                                            [1, 2, 3, 4].map(i => (
                                                <div key={i} className="min-w-[200px] md:min-w-[260px] snap-start aspect-[4/5] bg-zinc-900/50 rounded-3xl animate-pulse" />
                                            ))
                                        ) : (
                                            categoryProducts.map((product) => (
                                                <Link
                                                    to={`/product/${product.id}`}
                                                    key={product.id}
                                                    className={`w-[170px] md:w-[240px] shrink-0 relative flex flex-col justify-between h-full bg-white dark:bg-[#0f1114] rounded-[24px] md:rounded-[32px] border-2 border-gray-100 dark:border-white/10 group transition-transform duration-300 hover:scale-[1.02] shadow-md dark:shadow-none Select-none`}
                                                    draggable="false"
                                                    onDragStart={(e) => e.preventDefault()}
                                                >
                                                    {/* Upper Block: Image & Title */}
                                                    <div className="bg-gray-50 dark:bg-[#1a1d23] rounded-[20px] md:rounded-[28px] overflow-hidden border border-gray-100 dark:border-white/5 relative z-10 flex-1 flex flex-col">
                                                        {/* Image Container */}
                                                        <div className="relative aspect-square w-full bg-gray-200 dark:bg-[#2b2d31]">
                                                            <img
                                                                src={product.mainImage || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=500"}
                                                                alt={product.name}
                                                                className="absolute inset-0 w-full h-full object-cover"
                                                                draggable="false"
                                                                loading="eager"
                                                                decoding="sync"
                                                            />

                                                            {/* Discount Badge */}
                                                            {product.priceAfterDiscount && product.priceAfterDiscount < product.price && (
                                                                <div className="absolute top-4 left-2 bg-[#f43f5e] text-white text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-0.5 shadow-md z-10">
                                                                    <span className="transform rotate-45 text-[10px]">🏷️</span>
                                                                    <span>{t('product.discount')} {product.discount ? `${product.discount}%` : ''}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Title Section */}
                                                        <div className="px-3 pt-3 pb-1 flex-grow">
                                                            <h3 className="text-gray-900 dark:text-white font-bold text-[12px] md:text-[15px] leading-tight text-right line-clamp-2 min-h-[32px] md:min-h-[40px]">
                                                                {product.name}
                                                            </h3>
                                                        </div>
                                                    </div>

                                                    {/* Price Section */}
                                                    <div className="px-3 py-3 flex flex-col items-start justify-center min-h-[60px] md:min-h-[82px] w-full text-right" dir="rtl">
                                                        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                                                            <span className={`${(product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? 'text-[#16a34a] dark:text-[#4ade80]' : 'text-gray-900 dark:text-white'} font-bold text-[14px] md:text-[17px] tracking-wide`}>
                                                                {formatPrice((product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.priceAfterDiscount : product.price)}
                                                            </span>
                                                        </div>
                                                        {product.priceAfterDiscount && product.priceAfterDiscount < product.price && (
                                                            <div className="flex items-center gap-1 text-gray-500 dark:text-white/60 text-[10px] md:text-[12px] font-bold line-through decoration-1 opacity-90 whitespace-nowrap">
                                                                <span>{formatPrice(product.price)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </Link>
                                            ))
                                        )}
                                    </DraggableScrollContainer>
                                </section>
                        );
                    })}
                </div>
            )
        }



        </div >


    );
};

export default Home;
