import { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Star, MapPin, Search, Clock, ShieldCheck, Info, Facebook, Instagram, Music2, Share2, Map as MapIcon, Package, ArrowRight, VolumeX, X, Maximize2, ArrowLeftRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, doc, onSnapshot, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import DraggableScrollContainer from '../components/DraggableScrollContainer';


const normalizeCategoryName = (value = '') => value
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const orderStoreCategories = (items = []) => {
    const ordered = [...items].sort((a, b) => (a.order || 9999) - (b.order || 9999));
    const targetIndex = ordered.findIndex((category) => {
        const name = normalizeCategoryName(category.name);
        return name === 'بواتي حبوب درجه اولى'
            || name === 'بواتي حبوب درجة اولى'
            || name === 'بواتي حبوب درجة أولى'
            || (name.includes('بواتي حبوب') && name.includes('اولى'));
    });
    if (targetIndex > 0) {
        const [target] = ordered.splice(targetIndex, 1);
        ordered.unshift(target);
    }
    return ordered;
};

// Request appropriately sized Cloudinary/Unsplash images without changing stored URLs.
const optimizeImageUrl = (url, width) => {
    if (!url || typeof url !== 'string') return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.hostname.includes('res.cloudinary.com') && parsed.pathname.includes('/upload/')) {
            parsed.pathname = parsed.pathname.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
            return parsed.toString();
        }
        if (parsed.hostname.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format');
            parsed.searchParams.set('fit', 'crop');
            parsed.searchParams.set('w', String(width));
            return parsed.toString();
        }
    } catch (error) {
        // Keep the original URL for non-standard or local image paths.
    }
    return url;
};

const optimizeVideoUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
    return url.replace('/upload/', '/upload/f_auto,q_auto:good,vc_auto,h_720,c_limit/');
};

const Home = () => {
    // SECURITY & DATA FIX: Clear old cache if project has changed
    const currentProjectId = "milano-anfoan-store-2026";
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
    const [promotionalVideos, setPromotionalVideos] = useState([]);
    const [selectedPromotionalVideo, setSelectedPromotionalVideo] = useState(null);
    const [selectedVideoMuted, setSelectedVideoMuted] = useState(true);
    const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
    const selectedVideoElementRef = useRef(null);
    const selectedVideoContainerRef = useRef(null);
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
            return cached ? orderStoreCategories(JSON.parse(cached)) : [];
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
    const showCategoriesGrid = interfaceSettings?.showCategories ?? true; // Keep categories visible unless explicitly disabled
    const showProductSections = true; // Always show product rows to ensure content visibility

    // Calculate max discount for the banner
    const maxDiscount = products.length > 0
        ? Math.max(...products.filter(p => !p.hidden).map(p => p.discount || 0), 0) || 50 // Skip hidden products
        : 50;
    const hideOutOfStock = interfaceSettings?.hideOutOfStock;
    const categoryScrollRef = useRef(null);
    const categoryTrackRef = useRef(null);
    const categoryPositionRef = useRef(0);
    const categoryDirectionRef = useRef(1);
    const categoryDragRef = useRef({ active: false, startX: 0, startPosition: 0 });
    const videoScrollRef = useRef(null);
    const videoTrackRef = useRef(null);
    const videoPositionRef = useRef(0);
    const videoDirectionRef = useRef(1);
    const videoTouchStartRef = useRef(null);
    const categoryDragTargetRef = useRef(0);
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



    // Move the right-aligned track directly so the motion cannot stall
    // because of browser-specific RTL scroll or animation behavior.
    useEffect(() => {
        const container = categoryScrollRef.current;
        const track = categoryTrackRef.current;
        if (!container || !track || allCategories.length < 2) return undefined;

        let frameId;
        let lastTime = performance.now();
        const speed = 26;
        const tick = (now) => {
            const delta = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            const distance = Math.max(0, track.scrollWidth - container.clientWidth);
            if (distance > 0) {
                let position = categoryPositionRef.current;
                if (categoryDragRef.current.active) {
                    // Follow the finger with a short, responsive easing instead of
                    // jumping on individual pointer events.
                    position += (categoryDragTargetRef.current - position) * 0.28;
                } else {
                    position += categoryDirectionRef.current * speed * delta;
                    if (position >= distance) {
                        position = distance;
                        categoryDirectionRef.current = -1;
                    } else if (position <= 0) {
                        position = 0;
                        categoryDirectionRef.current = 1;
                    }
                }
                categoryPositionRef.current = position;
                track.style.transform = `translate3d(${position}px, 0, 0)`;
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frameId);
            track.style.transform = '';
        };
    }, [allCategories.length]);

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
            const sortedCats = orderStoreCategories(rawCats);
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

        const unsubPromotionalVideos = onSnapshot(collection(db, 'promotional_videos'), (snapshot) => {
            const active = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
                .filter(video => video.active !== false)
                .sort((a, b) => {
                    const aTime = a.createdAt?.seconds || a.createdAt?._seconds || 0;
                    const bTime = b.createdAt?.seconds || b.createdAt?._seconds || 0;
                    if (aTime && bTime && aTime !== bTime) return aTime - bTime;
                    return Number(a.order ?? 0) - Number(b.order ?? 0);
                });
            setPromotionalVideos(active.filter(video => video.active !== false));
        }, err => console.error('Error fetching promotional videos:', err));

        return () => {
            unsubscribeStatus();
            unsubCategories();
            unsubProducts();
            unsubPromotionalVideos();
        };
    }, []);

    useEffect(() => {
        const viewport = videoScrollRef.current;
        const track = videoTrackRef.current;
        if (!viewport || !track || promotionalVideos.length <= 1) return undefined;
        let frameId;
        let lastTime = performance.now();
        const speed = 22;
        const motionStartAt = performance.now() + 900;
        const entryOffset = 0;
        const getDistance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
        // Begin slightly outside the right edge, then let cards enter naturally.
        const initialDistance = 0;
        videoPositionRef.current = initialDistance;
        videoDirectionRef.current = 1;
        track.style.transform = `translate3d(${entryOffset - initialDistance}px, 0, 0)`;
        const tick = (now) => {
            if (now < motionStartAt) {
                frameId = requestAnimationFrame(tick);
                return;
            }
            const delta = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;
            const distance = getDistance() + entryOffset;
            if (distance > 0) {
                let position = videoPositionRef.current + videoDirectionRef.current * speed * delta;
                if (position >= distance) {
                    position = distance;
                    videoDirectionRef.current = -1;
                } else if (position <= 0) {
                    position = 0;
                    videoDirectionRef.current = 1;
                }
                videoPositionRef.current = position;
                track.style.transform = `translate3d(${entryOffset - position}px, 0, 0)`;
            }
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        const resizeObserver = new ResizeObserver(() => {
            const distance = getDistance() + entryOffset;
            videoPositionRef.current = Math.min(videoPositionRef.current, distance);
            track.style.transform = `translate3d(${entryOffset - videoPositionRef.current}px, 0, 0)`;
        });
        resizeObserver.observe(viewport);
        resizeObserver.observe(track);
        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            track.style.transform = '';
            videoPositionRef.current = 0;
        };
    }, [promotionalVideos.length]);

    useEffect(() => {
        if (!promotionalVideos.length || selectedPromotionalVideo) return undefined;
        const keepVideosPlaying = () => {
            document.querySelectorAll('.promotional-video-external').forEach((video) => {
                video.muted = true;
                video.defaultMuted = true;
                if (video.paused && !video.ended) video.play().catch(() => {});
            });
        };
        keepVideosPlaying();
        const timer = window.setInterval(keepVideosPlaying, 1200);
        return () => window.clearInterval(timer);
    }, [promotionalVideos.length, selectedPromotionalVideo]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('milano-video-preview', { detail: { open: Boolean(selectedPromotionalVideo) } }));
        return () => window.dispatchEvent(new CustomEvent('milano-video-preview', { detail: { open: false } }));
    }, [selectedPromotionalVideo]);

    useEffect(() => {
        if (!selectedPromotionalVideo) return undefined;
        document.querySelectorAll('.promotional-video-external').forEach(video => video.pause());
        const timer = window.setTimeout(() => selectedVideoElementRef.current?.play().catch(() => {}), 80);
        return () => window.clearTimeout(timer);
    }, [selectedPromotionalVideo, selectedVideoMuted]);

    useEffect(() => {
        const handleFullscreenChange = () => setIsVideoFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        document.body.style.overflow = isVideoFullscreen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isVideoFullscreen]);

    const toggleVideoFullscreen = async () => {
        const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
        const isMobile = isTouchDevice || window.innerWidth <= 767;
        if (isMobile) {
            const videoElement = selectedVideoElementRef.current;
            // Safari on iPhone/iPad exposes the native fullscreen player through this API.
            if (typeof videoElement?.webkitEnterFullscreen === 'function') {
                try {
                    videoElement.muted = selectedVideoMuted;
                    videoElement.playsInline = false;
                    videoElement.setAttribute('webkit-playsinline', 'false');
                    await videoElement.play().catch(() => {});
                    videoElement.webkitEnterFullscreen();
                    return;
                } catch (error) {
                    console.warn('Native iOS fullscreen unavailable, using in-page fullscreen:', error);
                }
            }
            if (typeof videoElement?.requestFullscreen === 'function') {
                try {
                    await videoElement.requestFullscreen();
                    return;
                } catch (error) {
                    console.warn('Touch fullscreen unavailable, using in-page fullscreen:', error);
                }
            }
            setIsVideoFullscreen(true);
            return;
        }

        if (document.fullscreenElement) {
            try { await document.exitFullscreen(); } catch (error) { console.warn('Unable to exit fullscreen:', error); }
            setIsVideoFullscreen(false);
            return;
        }

        const videoContainer = selectedVideoContainerRef.current;
        try {
            if (videoContainer?.requestFullscreen) {
                await videoContainer.requestFullscreen();
            } else {
                setIsVideoFullscreen(true);
            }
        } catch (error) {
            // iOS Safari may reject the native API; use the reliable in-page fallback.
            console.warn('Native fullscreen unavailable, using in-page fullscreen:', error);
            setIsVideoFullscreen(true);
        }
    };

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
                                    src={optimizeImageUrl(brandImages.nike || "/nike.png", 180)}
                                    alt="Nike" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Adidas */}
                                <img 
                                    src={optimizeImageUrl(brandImages.adidas || "/adidas.png", 180)}
                                    alt="Adidas" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Puma */}
                                <img 
                                    src={optimizeImageUrl(brandImages.puma || "/puma.png", 180)}
                                    alt="Puma" 
                                    className="w-[62px] h-[62px] md:w-[80px] md:h-[80px] rounded-[18px] md:rounded-[24px] object-cover drop-shadow-md hover:-translate-y-1 transition-transform duration-300 hover:scale-105" 
                                    draggable="false" 
                                />
                                {/* Lacoste */}
                                <img 
                                    src={optimizeImageUrl(brandImages.lacoste || "/lacoste.png", 180)}
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
            {allCategories.length > 0 && (
                <section className="w-full px-0 mb-6 mt-4">
                    <div className="flex items-center justify-between mb-2 px-3">
                        <div className="flex items-center gap-2">
                            <div className="h-5 w-1 bg-blue-600 rounded-full"></div>
                            <h2 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">الأقسام</h2>
                        </div>
                    </div>

                    <div className="relative w-full overflow-hidden">
                        <div
                            ref={categoryScrollRef}
                            dir="ltr"
                            className="relative w-full overflow-hidden flex justify-end touch-pan-y select-none cursor-grab active:cursor-grabbing"
                            onPointerDown={(event) => {
                                const track = categoryTrackRef.current;
                                if (!track) return;
                                event.currentTarget.setPointerCapture?.(event.pointerId);
                                categoryDragRef.current = {
                                    active: true,
                                    startX: event.clientX,
                                    startPosition: categoryPositionRef.current
                                };
                            }}
                            onPointerMove={(event) => {
                                const drag = categoryDragRef.current;
                                const container = categoryScrollRef.current;
                                const track = categoryTrackRef.current;
                                if (!drag.active || !container || !track) return;
                                event.preventDefault();
                                const distance = Math.max(0, track.scrollWidth - container.clientWidth);
                                const position = Math.max(0, Math.min(distance, drag.startPosition + (event.clientX - drag.startX)));
                                categoryDragTargetRef.current = position;
                                categoryDirectionRef.current = event.clientX - drag.startX >= 0 ? 1 : -1;
                            }}
                            onPointerUp={(event) => {
                                event.currentTarget.releasePointerCapture?.(event.pointerId);
                                categoryDragRef.current.active = false;
                            }}
                            onPointerCancel={() => { categoryDragRef.current.active = false; }}
                        >
                            <div
                                ref={categoryTrackRef}
                                className="flex flex-row-reverse flex-nowrap items-stretch gap-2 px-1 pb-1 w-max shrink-0 will-change-transform"
                            >
                            {allCategories.map((cat, catIndex) => (
                                <Link
                                    to={`/category/${encodeURIComponent(cat.name)}`}
                                    key={cat.id}
                                    className="flex flex-col items-center p-0 w-[42vw] max-w-[220px] min-w-[180px] md:w-[220px] md:min-w-[220px] md:max-w-[220px] h-[232px] md:h-[268px] shrink-0 bg-white dark:bg-[#1a1d23] rounded-[16px] border border-gray-100 dark:border-white/5 hover:border-cyan-500/30 transition-all shadow-sm overflow-hidden"
                                >
                                    <div className="w-full aspect-[1/1.04] md:aspect-square mb-1 relative shrink-0 overflow-hidden rounded-t-[16px]">
                                        <img
                                            src={optimizeImageUrl(cat.image || "/catalog.png", 440)}
                                            alt={cat.name}
                                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                                            loading={catIndex < 4 ? "eager" : "lazy"}
                                            fetchPriority={catIndex === 0 ? "high" : "auto"}
                                            decoding="async"
                                        />
                                    </div>
                                    <span className="text-gray-900 dark:text-white font-black text-[11px] md:text-[12px] text-center leading-tight line-clamp-2 w-full min-h-[28px] mt-2 md:mt-0 mb-1 px-2 flex items-center justify-center">{cat.name}</span>
                                </Link>
                            ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Main Content: Categories & Products */}
            {
                showProductSections && (
                    <div className="w-full px-0 space-y-0 md:space-y-2 mt-2 md:mt-4 pt-1">
                        {categories.map((cat, catIdx) => {
                            const categoryProducts = products.filter(p => {
                                const matchesCategory = p.category === cat;
                                const isVisible = !p.hidden;
                                const hasStock = hideOutOfStock ? (Number(p.stock || 0) > 0) : true;
                                return matchesCategory && isVisible && hasStock;
                            });

                            if (categoryProducts.length === 0 && !loading) return null;

                            return (
                                <section key={catIdx} id={`cat-${cat}`} className="-mt-2 md:-mt-2">
                                    <div className="flex items-center justify-between mb-2 px-3">
                                        <div className="flex items-center gap-2"> {/* Distinct gap */}
                                            <div className="h-4 w-1 bg-[#ce2b37] rounded-full"></div>
                                            <h2 className="text-sm md:text-xl font-black">{cat}</h2>
                                        </div>
                                    </div>


                                    <DraggableScrollContainer className="relative top-1 flex gap-1 overflow-x-auto pb-6 pt-5 scrollbar-hide">
                                        {loading ? (
                                            [1, 2, 3, 4].map(i => (
                                                <div key={i} className="min-w-[200px] md:min-w-[260px] snap-start aspect-[4/5] bg-zinc-900/50 rounded-3xl animate-pulse" />
                                            ))
                                        ) : (
                                            categoryProducts.map((product, productIndex) => (
                                                <Link
                                                    to={`/product/${product.id}`}
                                                    key={product.id}
                                                    className={`w-[180px] md:w-[250px] shrink-0 relative flex flex-col justify-between h-full bg-white dark:bg-[#0f1114] rounded-[24px] md:rounded-[32px] border-2 border-gray-100 dark:border-white/10 group transition-transform duration-300 hover:scale-[1.02] shadow-md dark:shadow-none Select-none`}
                                                    draggable="false"
                                                    onDragStart={(e) => e.preventDefault()}
                                                >
                                                    {/* Upper Block: Image & Title */}
                                                    <div className="bg-gray-50 dark:bg-[#1a1d23] rounded-[20px] md:rounded-[28px] overflow-hidden border border-gray-100 dark:border-white/5 relative z-10 flex-1 flex flex-col">
                                                        {/* Image Container */}
                                                        <div className="relative aspect-square w-full bg-gray-200 dark:bg-[#2b2d31]">
                                                            <img
                                                                src={optimizeImageUrl(product.mainImage || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=500", 560)}
                                                                alt={product.name}
                                                                className="absolute inset-0 w-full h-full object-cover"
                                                                draggable="false"
                                                                loading="lazy"
                                                                fetchPriority={productIndex === 0 ? "high" : "auto"}
                                                                decoding="async"
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

        {promotionalVideos.length > 0 && (
            <section className="w-full px-2 md:px-3 mt-4 mb-0 pb-0" dir="rtl">
                    <div className="relative -top-4 left-2 flex items-center justify-between mb-1 px-2">
                    <div className="flex items-center gap-2"><div className="h-6 w-1 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" /><h2 className="text-lg md:text-xl font-black text-gray-900 dark:text-white">فيديوهات المتجر</h2></div>
                    <span className="text-xs md:text-sm font-black text-gray-500 dark:text-gray-300">إعلانات ميلانو</span>
                </div>
                <div className="relative -mx-2 w-[calc(100%+1rem)] overflow-hidden rounded-none border-0 bg-transparent px-0 shadow-none md:-mx-3 md:w-[calc(100%+1.5rem)]" style={{ marginLeft: 'auto' }}>
                    <div ref={videoScrollRef} dir="ltr" onTouchStart={(event) => { document.querySelectorAll('.promotional-video-external').forEach((video) => { video.muted = true; video.play().catch(() => {}); }); videoTouchStartRef.current = event.touches[0]?.clientX ?? null; }} onPointerDown={() => { document.querySelectorAll('.promotional-video-external').forEach((video) => { video.muted = true; video.play().catch(() => {}); }); }} onTouchEnd={(event) => { const start = videoTouchStartRef.current; const end = event.changedTouches[0]?.clientX; videoTouchStartRef.current = null; if (start == null || end == null || Math.abs(end - start) < 24) return; videoDirectionRef.current = end > start ? -1 : 1; }} className="relative w-full overflow-hidden py-0">
                        <div ref={videoTrackRef} className="promotional-video-track ml-auto flex w-max gap-2 md:gap-3 will-change-transform">
                        {[...promotionalVideos].reverse().map((video, index) => (
                            <div data-promotional-card key={video.id} onClick={() => { setSelectedPromotionalVideo(video); setSelectedVideoMuted(false); setIsVideoFullscreen(false); }} className="relative shrink-0 w-[190px] min-w-[190px] md:w-[250px] md:min-w-[250px] lg:w-[270px] lg:min-w-[270px] aspect-[9/14] snap-center overflow-hidden rounded-[20px] bg-transparent shadow-md ring-1 ring-black/10 dark:ring-white/10 cursor-pointer">
                                <video ref={(node) => { if (node) { node.muted = true; node.defaultMuted = true; node.controls = false; node.setAttribute('playsinline', ''); node.setAttribute('webkit-playsinline', ''); node.play().catch(() => {}); } }} src={optimizeVideoUrl(video.url)} muted autoPlay loop playsInline controls={false} controlsList="nodownload noplaybackrate" disablePictureInPicture disableRemotePlayback preload="auto" onCanPlay={(event) => event.currentTarget.play().catch(() => {})} onLoadedData={(event) => event.currentTarget.play().catch(() => {})} onPause={(event) => { if (!event.currentTarget.ended) event.currentTarget.play().catch(() => {}); }} onEnded={(event) => { event.currentTarget.currentTime = 0; event.currentTarget.play().catch(() => {}); }} className="promotional-video-external w-full h-full object-cover rounded-[20px]" aria-label={video.title || `فيديو المتجر ${index + 1}`} />
                                <button type="button" aria-label="الفيديو صامت" onClick={(event) => { event.stopPropagation(); setSelectedPromotionalVideo(video); setSelectedVideoMuted(false); setIsVideoFullscreen(false); }} className="absolute left-1.5 bottom-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"><VolumeX size={14} strokeWidth={2.5} /></button>
                            </div>
                        ))}
                        </div>
                    </div>
                </div>
            </section>
        )}

        {selectedPromotionalVideo && (
            <div className={`fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm ${isVideoFullscreen ? 'p-0' : 'p-3 md:p-6'}`} onClick={() => { setSelectedPromotionalVideo(null); setIsVideoFullscreen(false); }} dir="rtl">
                <div ref={selectedVideoContainerRef} style={isVideoFullscreen ? { height: '100dvh', minHeight: '100vh', width: '100vw', maxWidth: 'none', borderRadius: 0 } : undefined} className={`relative overflow-hidden bg-transparent shadow-2xl ring-1 ring-white/20 ${isVideoFullscreen ? 'h-[100dvh] min-h-screen w-screen rounded-none' : 'h-[min(86vh,720px)] w-[min(92vw,460px)] rounded-[24px]'}`} onClick={(event) => event.stopPropagation()}>
                        <video ref={selectedVideoElementRef} src={optimizeVideoUrl(selectedPromotionalVideo.url)} autoPlay loop playsInline preload="auto" muted={selectedVideoMuted} onLoadedData={(event) => event.currentTarget.play().catch(() => {})} onCanPlay={(event) => event.currentTarget.play().catch(() => {})} onWebkitEndFullscreen={(event) => { event.currentTarget.playsInline = true; event.currentTarget.setAttribute('webkit-playsinline', ''); setIsVideoFullscreen(false); }} className="h-full w-full object-contain will-change-transform" />
                    <div dir="ltr" className="absolute right-3 top-3 flex items-center gap-1.5">
                        <button type="button" onClick={() => { const index = promotionalVideos.findIndex(video => video.id === selectedPromotionalVideo.id); const next = promotionalVideos[(index - 1 + promotionalVideos.length) % promotionalVideos.length]; setSelectedPromotionalVideo(next); setSelectedVideoMuted(false); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"><ArrowLeftRight size={17} /></button>
                        <button type="button" aria-label="تكبير الفيديو" onClick={toggleVideoFullscreen} className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"><Maximize2 size={17} /></button>
                        <button type="button" onClick={() => { setSelectedPromotionalVideo(null); setIsVideoFullscreen(false); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"><X size={20} /></button>
                    </div>
                </div>
            </div>
        )}



        </div >


    );
};

export default Home;
