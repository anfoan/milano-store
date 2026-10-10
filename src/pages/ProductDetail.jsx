import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ChevronRight, ShoppingBag, Share2, Star,
    Minus, Plus, ShieldCheck, Truck, Info,
    CheckCircle2, ChevronDown, Copy, Menu,
    AlertTriangle, X as CloseIcon, ShoppingCart, ShieldAlert,
    FileText, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, limit, getDocs, where } from 'firebase/firestore';
import ShareModal from '../components/ShareModal';
import ImageViewerModal from '../components/ImageViewerModal';
import ImageWithFallback from '../components/ImageWithFallback';
import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import DraggableScrollContainer from '../components/DraggableScrollContainer';
import QuantityStepper from '../components/QuantityStepper';
import { getAvailableSizeValues, getSizeStock, hasAvailableStock } from '../lib/stockUtils';

const ProductDetail = () => {
    const { t, direction, language } = useLanguage();
    const { id } = useParams();
    const navigate = useNavigate();

    const [product, setProduct] = useState(null);
    const [relatedProducts, setRelatedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedColor, setSelectedColor] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [activeImage, setActiveImage] = useState(null);
    const [showShare, setShowShare] = useState(false);
    const [showQtyDropdown, setShowQtyDropdown] = useState(false);
    const [showQtyDropdownSidebar, setShowQtyDropdownSidebar] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [imageViewerStartIndex, setImageViewerStartIndex] = useState(0);
    const [showLimitToast, setShowLimitToast] = useState(false);
    const [showSuccessToast, setShowSuccessToast] = useState(false);
    const [isLimitReached, setIsLimitReached] = useState(false);
    const { interfaceSettings, generalSettings, imageSettings, cartSettings } = useSettings();
    const { formatPrice } = useCurrency();

    // Fetch Product Data
    useEffect(() => {
        const fetchProductAndRelated = async () => {
            try {
                setLoading(true);
                // Render the product from the Home cache immediately on direct navigation.
                try {
                    const cachedProducts = JSON.parse(localStorage.getItem('cached_products') || '[]');
                    const cachedProduct = Array.isArray(cachedProducts) ? cachedProducts.find(item => item.id === id) : null;
                    if (cachedProduct) {
                        setProduct(cachedProduct);
                        setActiveImage(cachedProduct.mainImage);
                        setLoading(false);
                    }
                } catch { /* network record below remains the source of truth */ }
                const docRef = doc(db, "products", id);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data() };
                    setProduct(data);
                    setActiveImage(data.mainImage);

                    // SELECTION LOGIC: Set initial size and color from variants
                    const sizeVariant = data.variants?.find(v => v.type === 'size');
                    const colorVariant = data.variants?.find(v => v.type === 'color');

                    if (sizeVariant?.values?.length > 0) {
                        const availableSizes = sizeVariant.values.filter(size => !data.sizeStocks || getSizeStock(data, size) > 0);
                        if (availableSizes.length > 0) {
                            setSelectedSize(availableSizes[0]);
                        } else {
                            setSelectedSize(sizeVariant.values[0]);
                        }
                    } else if (!data.variants || data.variants.length === 0) {
                        // Fallback only if no variants defined at all
                        setSelectedSize('S');
                    }

                    if (colorVariant?.values?.length > 0) {
                        setSelectedColor(colorVariant.values[0]);
                    }

                    // Dynamic SEO Metadata
                    const prodTitle = `${data.name} - متجر ميلانو لجميع المستلزمات الرياضية`;
                    const prodDesc = `تسوق ${data.name} بخامة فيتنامية وجودة عالية في متجر ميلانو لجميع المستلزمات الرياضية. ${data.subtitle || ''}`;

                    document.title = prodTitle;

                    const updateMeta = (name, content, isProperty = false) => {
                        if (!content) return;
                        let meta = document.querySelector(isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`);
                        if (!meta) {
                            meta = document.createElement('meta');
                            if (isProperty) meta.setAttribute('property', name);
                            else meta.name = name;
                            document.head.appendChild(meta);
                        }
                        meta.content = content;
                    };

                    updateMeta('description', prodDesc);
                    updateMeta('og:title', prodTitle, true);
                    updateMeta('og:description', prodDesc, true);
                    updateMeta('og:image', data.mainImage, true);
                    updateMeta('twitter:title', prodTitle);
                    updateMeta('twitter:description', prodDesc);
                    updateMeta('twitter:image', data.mainImage);

                    // KEY CHANGE: Stop loading here so the user sees the product IMMEDIATELY
                    setLoading(false);

                    // Fetch Related Products in the background
                    try {
                        let related = [];
                        const hideOutOfStock = interfaceSettings?.hideOutOfStock;
                        if (data.category) {
                            const q = query(
                                collection(db, "products"),
                                where("category", "==", data.category),
                                limit(10)
                            );
                            const relatedSnap = await getDocs(q);
                            related = relatedSnap.docs
                                .map(d => ({ id: d.id, ...d.data() }))
                                .filter(p => {
                                    const isVisible = !p.hidden && p.id !== id;
                                    const hasStock = hasAvailableStock(p);
                                    return isVisible && hasStock;
                                });
                        }

                        if (related.length < 4) {
                            const qGeneral = query(collection(db, "products"), limit(10));
                            const generalSnap = await getDocs(qGeneral);
                            const general = generalSnap.docs
                                .map(d => ({ id: d.id, ...d.data() }))
                                .filter(p => {
                                    const isVisible = !p.hidden && p.id !== id && !related.some(r => r.id === p.id);
                                    const hasStock = hasAvailableStock(p);
                                    return isVisible && hasStock;
                                });
                            related = [...related, ...general].slice(0, 10);
                        }

                        setRelatedProducts(related);
                    } catch (relatedErr) {
                        console.error("Error fetching related products (non-critical):", relatedErr);
                        // No need to set loading error here, as main product is already visible
                    }
                } else {
                    // Product not found, stop loading
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error fetching product:", err);
                setLoading(false);
            }
        };
        fetchProductAndRelated();
        window.scrollTo(0, 0);
    }, [id, interfaceSettings]);

    const renderDescription = (text) => {
        if (!text) return null;

        const escape = (str) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        let safeText = escape(text);

        return safeText
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-500 underline" target="_blank">$1</a>')
            .replace(/\n## (.*?)/g, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
            .replace(/\n- (.*?)/g, '<li class="mr-4">$1</li>')
            .replace(/\n1. (.*?)/g, '<li class="mr-4" list-style-type="decimal">$1</li>')
            .replace(/\n/g, '<br/>');
    };

    // Check if limit is EXCEEDED (to show 'Go to Cart' button)
    useEffect(() => {
        const checkLimit = () => {
            if (cartSettings?.enableMaxCount && cartSettings?.maxProductCount) {
                const stored = localStorage.getItem('cart');
                const cart = stored ? JSON.parse(stored) : [];
                const currentTotalItems = Array.isArray(cart) ? cart.reduce((acc, item) => acc + item.quantity, 0) : 0;
                // Only mark as reached if it ALREADY exceeds the limit (shouldn't happen with our guard)
                // or keep it false so the user can click and get the toast.
                setIsLimitReached(currentTotalItems > cartSettings.maxProductCount);
            } else {
                setIsLimitReached(false);
            }
        };
        checkLimit();
        window.addEventListener('cart-updated', checkLimit);
        return () => window.removeEventListener('cart-updated', checkLimit);
    }, [cartSettings]);

    if (loading) return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] flex items-center justify-center transition-colors duration-300">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    if (!product) return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white flex items-center justify-center font-bold text-xl transition-colors duration-300">
            {t('product.not_found')}
        </div>
    );

    const sizes = product.sizeStocks
        ? getAvailableSizeValues(product)
        : (product.variants?.find(v => v.type === 'size')?.values || ['S', 'M', 'L', 'XL', 'XXL']);
    const colors = product.variants?.find(v => v.type === 'color')?.values || [];
    const gallery = [product.mainImage, ...(product.gallery || [])].filter(Boolean);

    // The customer can only add the quantity still available for the selected variant.
    const getSelectedStock = () => {
        return Math.max(0, getSizeStock(product, selectedSize));
    };
    const selectedStock = getSelectedStock();
    const productAvailable = hasAvailableStock(product);
    const existingCartQuantity = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem('cart') || '[]');
            const match = Array.isArray(stored) && stored.find(item =>
                item.id === product.id && item.size === selectedSize && item.color === selectedColor
            );
            return Number(match?.quantity || 0);
        } catch { return 0; }
    })();
    const maxAddableQuantity = Math.max(0, selectedStock - existingCartQuantity);

    const addToCart = () => {
        let cart = [];
        try {
            const stored = localStorage.getItem('cart');
            cart = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(cart)) cart = [];
        } catch (e) {
            cart = [];
        }
        const newItem = {
            id: product.id,
            title: product.name,
            price: (product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.priceAfterDiscount : product.price,
            originalPrice: (product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.price : null,
            image: product.mainImage || product.gallery?.[0] || '',
            quantity: quantity,
            size: selectedSize,
            color: selectedColor,
        };

        // Check Max Product Count Limit
        if (cartSettings?.enableMaxCount && cartSettings?.maxProductCount) {
            const currentTotalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

            // If it WOULD exceed the limit
            if ((currentTotalItems + newItem.quantity) > cartSettings.maxProductCount) {
                setShowLimitToast(true);
                setTimeout(() => setShowLimitToast(false), 5000);
                setIsLimitReached(true); // Switch button to "Go to Cart"
                return;
            }
        }

        const existingItemIndex = cart.findIndex(item =>
            item.id === newItem.id &&
            item.size === newItem.size &&
            item.color === newItem.color
        );

        if (existingItemIndex > -1) {
            const availableForExisting = maxAddableQuantity;
            if (newItem.quantity > availableForExisting) {
                setShowLimitToast(true);
                setTimeout(() => setShowLimitToast(false), 5000);
                return;
            }
            cart[existingItemIndex].quantity += newItem.quantity;
        } else {
            cart.push(newItem);
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('cart-updated'));

        // Visual Feedback
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
    };

    const handleShare = () => {
        setShowShare(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0f1218] text-gray-900 dark:text-white font-['Cairo'] transition-colors duration-300">
            <main className="w-full px-0 pt-0 pb-4">
                {/* Modern Back Button Header */}
                <div className="flex items-center gap-3 mb-0 pt-2 px-3 md:px-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h2 className="text-lg md:text-xl font-black text-gray-900 dark:text-white line-clamp-1">
                        {product.name}
                    </h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 md:gap-8 items-start px-2 md:px-6">
                    {/* LEFT COLUMN (Desktop): Purchase Control Panel - Sticky */}
                    <div className="lg:col-span-4 lg:sticky lg:top-24 order-2 lg:order-2 space-y-6">
                        {/* Price Card */}
                        <div className="bg-transparent rounded-[24px] p-5 md:p-8 border border-gray-400/70 dark:border-[#2d323e] space-y-6 md:space-y-8 transition-colors duration-300 mt-16 relative md:px-10 shadow-md">
                            {/* Store Info - Popout Logo */}
                            <div className="flex flex-col items-center gap-3 -mt-20">
                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full p-[2px] bg-gradient-to-b from-blue-500 to-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.6)] z-20 bg-[#0f1218]">
                                    <div className="w-full h-full rounded-full bg-white dark:bg-[#111317] flex items-center justify-center overflow-hidden relative border-4 border-white dark:border-[#111317]">
                                        <img
                                            src={imageSettings?.profileImage || "/logo.jpg"}
                                            className="w-full h-full object-cover"
                                            alt="Milano Logo"
                                            onError={(e) => e.target.src = "/logo.jpg"}
                                            draggable="false"
                                        />
                                    </div>
                                </div>
                                <div className="text-center space-y-0.5">
                                    <h3 className="text-gray-900 dark:text-white font-bold text-base md:text-lg">{generalSettings?.storeName || t('product.store_name')}</h3>
                                    <div className="flex gap-1 justify-center">
                                        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />)}
                                    </div>
                                </div>
                            </div>

                            <div className="h-[1.5px] bg-gray-400 dark:bg-white/40 w-full" />

                            {/* Price Row */}
                            <div className="flex flex-row justify-between items-center px-0.5 md:px-1">
                                <span className="text-gray-900 dark:text-white font-bold text-sm md:text-base text-right">{t('product.price')}</span>
                                <div className="flex flex-col items-end">
                                    {product.priceAfterDiscount && product.priceAfterDiscount < product.price ? (
                                        <>
                                            <span className="text-gray-500 dark:text-white/60 text-[10px] md:text-[12px] line-through font-bold">
                                                {formatPrice(product.price)}
                                            </span>
                                            <span className="font-bold text-[14px] md:text-[17px] text-[#16a34a] dark:text-[#4ade80]">
                                                {formatPrice(product.priceAfterDiscount)}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            {product.oldPrice && product.oldPrice > product.price && (
                                                <span className="text-gray-500 dark:text-gray-400 text-[10px] md:text-[12px] line-through font-bold">
                                                    {formatPrice(product.oldPrice)}
                                                </span>
                                            )}
                                            <span className="font-bold text-[14px] md:text-[17px] text-gray-900 dark:text-white">
                                                {formatPrice(product.price)}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Quantity Row */}
                            <div className="flex flex-row justify-between items-center px-0.5 md:px-1 gap-3">
                                <span className="text-gray-900 dark:text-white font-black text-sm md:text-base text-right">{t('product.quantity')}</span>
                                <QuantityStepper
                                    value={quantity}
                                    min={1}
                                    max={Math.max(1, maxAddableQuantity)}
                                    onChange={setQuantity}
                                    disabled={maxAddableQuantity <= 0}
                                    compact
                                    label={t('product.quantity')}
                                />
                            </div>

                            <div className="h-[1.5px] bg-gray-400 dark:bg-white/40 w-full" />

                            {/* Total */}
                            <div className="text-center py-1">
                                <span className={`text-lg md:text-xl font-bold ${(product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? 'text-[#16a34a] dark:text-[#4ade80]' : 'text-gray-900 dark:text-white'}`}>
                                    {formatPrice(Number((product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.priceAfterDiscount : product.price) * quantity)}
                                </span>
                            </div>

                            {/* Sizes */}
                            {sizes.length > 0 && productAvailable && (
                                <div className="grid grid-cols-4 gap-x-2 gap-y-3 px-0">
                                    {sizes.map((size) => (
                                        <button
                                            key={size}
                                            onClick={() => setSelectedSize(size)}
                                            className={`h-8 md:h-9 rounded-full font-bold text-xs md:text-sm border-2 transition-all flex items-center justify-center ${selectedSize === size
                                                ? 'bg-transparent border-blue-500 text-gray-900 dark:text-white shadow-[0_0_10px_rgba(59,130,246,0.2)] scale-105'
                                                : 'bg-transparent border-gray-400 dark:border-white/60 text-gray-900 dark:text-white hover:border-gray-500 dark:hover:border-white'
                                                }`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Colors */}
                            {colors.length > 0 && productAvailable && (
                                <div className="flex justify-center flex-wrap gap-2 mt-4">
                                    {colors.map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => setSelectedColor(color)}
                                            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${selectedColor === color
                                                ? 'border-white ring-2 ring-blue-500 scale-110 shadow-md'
                                                : 'border-transparent hover:scale-105 ring-1 ring-gray-200 dark:ring-white/10'
                                                }`}
                                            style={{ backgroundColor: color }}
                                        >
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Add to Cart Button */}
                            {!productAvailable ? (
                                <button
                                    disabled
                                    className="w-full py-4 rounded-xl border border-gray-400 bg-gray-300 text-gray-950 dark:border-zinc-500 dark:bg-zinc-700 dark:text-white font-black text-xl shadow-lg cursor-not-allowed flex items-center justify-center gap-3 mt-2 opacity-100"
                                >
                                    <span>{t('product.out_of_stock')}</span>
                                    <AlertTriangle className="w-6 h-6" />
                                </button>
                            ) : !isLimitReached ? (
                                <button
                                    onClick={addToCart}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-black text-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-2"
                                >
                                    <span>{t('product.add_to_cart')}</span>
                                    <ShoppingBag className="w-6 h-6" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => navigate('/cart')}
                                    className="w-full py-4 rounded-xl bg-blue-600 text-white font-black text-xl shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-2"
                                >
                                    <ShoppingCart className="w-6 h-6" />
                                    <span>{t('product.go_to_cart')}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* RIGHT COLUMN (Desktop): Product Content */}
                    <div className="lg:col-span-8 order-1 lg:order-1 space-y-2 md:space-y-4">
                        {/* Section Headers - Desktop Only */}
                        <div className="hidden md:grid grid-cols-12 px-8 mb-2">
                            <div className="col-span-7 flex justify-start">
                                <h3 className="text-gray-400 font-bold text-sm">{t('product.product_title')}</h3>
                            </div>
                            <div className="col-span-3 flex justify-center">
                                <h3 className="text-gray-400 font-bold text-sm">{t('product.quantity')}</h3>
                            </div>
                            <div className="col-span-2"></div>
                        </div>

                        {/* Product Summary Card */}
                        <div className="bg-transparent md:bg-transparent rounded-[24px] p-4 md:p-6 md:px-10 border border-gray-400/70 dark:border-[#2d323e] relative overflow-visible transition-colors duration-300 shadow-md">
                            {/* Desktop Layout */}
                            <div className="hidden md:grid grid-cols-12 items-center w-full">
                                <div className="col-span-7 flex items-center justify-start gap-6 px-2 order-1">
                                    <div
                                        className="w-16 md:w-24 h-16 md:h-24 bg-gray-100 dark:bg-[#2b2d31] rounded-2xl overflow-hidden border border-gray-200 dark:border-white/5 shrink-0 cursor-pointer relative"
                                        onClick={() => { setImageViewerStartIndex(0); setShowImageViewer(true); }}
                                    >
                                        <img
                                            src={product.mainImage}
                                            alt={product.name}
                                            loading="eager"
                                            decoding="async"
                                            className="w-full h-full object-cover"
                                            draggable="false"
                                        />
                                    </div>
                                    <div className="flex flex-col items-start text-right min-w-[80px]">
                                        <h1 className="text-sm md:text-lg font-bold text-gray-900 dark:text-white leading-tight mb-1 md:mb-2 whitespace-nowrap">
                                            {product.name}
                                        </h1>
                                        {interfaceSettings.productSharing && (
                                            <button
                                                onClick={handleShare}
                                                className="bg-[#3b82f6] hover:bg-[#2563eb] text-white p-1.5 rounded-lg transition-colors inline-flex"
                                            >
                                                <Share2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="col-span-5 grid grid-cols-5 items-center order-2">
                                    <div className="col-span-3 flex justify-center relative z-30">
                                        <QuantityStepper
                                            value={quantity}
                                            min={1}
                                            max={Math.max(1, maxAddableQuantity)}
                                            onChange={setQuantity}
                                            disabled={maxAddableQuantity <= 0}
                                            compact
                                            label={t('product.quantity')}
                                        />
                                    </div>

                                    <div className="col-span-2 flex justify-center">
                                        <div className="flex flex-col items-start shrink-0">
                                            {product.priceAfterDiscount && product.priceAfterDiscount < product.price && (
                                                <span className="text-gray-500 dark:text-white/60 text-[10px] md:text-[12px] line-through font-bold mb-0.5">
                                                    {formatPrice(Number(product.price) * quantity)}
                                                </span>
                                            )}
                                            <span className={`font-black text-[14px] md:text-[17px] whitespace-nowrap ${(product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? 'text-[#16a34a] dark:text-[#4ade80]' : 'text-gray-900 dark:text-white'}`}>
                                                {formatPrice(Number((product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.priceAfterDiscount : product.price) * quantity)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Layout */}
                            <div className="flex md:hidden flex-col gap-4">
                                <div className="flex justify-start items-center w-full gap-4">
                                    <div
                                        className="w-24 h-24 rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#1a1d23] shrink-0"
                                        onClick={() => { setImageViewerStartIndex(0); setShowImageViewer(true); }}
                                    >
                                        <img src={product.mainImage} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex flex-col items-start gap-2 text-right">
                                        <h1 className="text-base font-black text-gray-900 dark:text-white leading-tight">
                                            {product.name}
                                        </h1>
                                        {interfaceSettings.productSharing && (
                                            <button
                                                onClick={handleShare}
                                                className="bg-[#3b82f6] text-white p-1.5 rounded-lg transition-colors inline-flex"
                                            >
                                                <Share2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="relative w-full z-40 flex justify-center py-2">
                                    <QuantityStepper
                                        value={quantity}
                                        min={1}
                                        max={Math.max(1, maxAddableQuantity)}
                                        onChange={setQuantity}
                                        disabled={maxAddableQuantity <= 0}
                                        label={t('product.quantity')}
                                    />
                                </div>

                                <div className="flex justify-start px-2 mt-2">
                                    <div className="flex flex-col items-start">
                                        {product.priceAfterDiscount && product.priceAfterDiscount < product.price && (
                                            <span className="text-gray-500 dark:text-white/60 text-[10px] line-through font-bold mb-0.5">
                                                {formatPrice(Number(product.price) * quantity)}
                                            </span>
                                        )}
                                        <span className={`font-black text-lg ${(product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? 'text-[#16a34a] dark:text-[#4ade80]' : 'text-gray-900 dark:text-white'}`}>
                                            {formatPrice(Number((product.priceAfterDiscount && product.priceAfterDiscount < product.price) ? product.priceAfterDiscount : product.price) * quantity)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description Card */}
                        <div className="bg-transparent rounded-[24px] p-4 md:p-8 border border-gray-400/70 dark:border-[#2d323e] transition-colors duration-300 space-y-3 shadow-md">
                            <div className="flex justify-start items-center">
                                <h3 className="font-black text-gray-900 dark:text-white text-lg">{t('product.description')}</h3>
                            </div>

                            <div className="flex flex-nowrap md:flex-wrap gap-1 md:gap-6 overflow-x-auto pb-4 -mx-4 px-1 md:mx-0 md:px-0 md:pb-0 scrollbar-hide snap-x">
                                {(() => {
                                    const allGallery = product.gallery || [];
                                    const displayLimit = 3;
                                    const visibleImages = allGallery.slice(0, displayLimit);
                                    const remainingCount = allGallery.length - displayLimit;

                                    return visibleImages.map((img, i) => {
                                        const isLast = i === displayLimit - 1;
                                        const showOverlay = isLast && remainingCount > 0;

                                        return (
                                            <div
                                                key={i}
                                                className="w-[33%] md:w-[200px] shrink-0 snap-start aspect-square rounded-3xl overflow-hidden border border-gray-100 dark:border-white/5 cursor-pointer shadow-lg hover:scale-[1.01] transition-transform duration-300 relative"
                                                onClick={() => {
                                                    setImageViewerStartIndex(i + 1);
                                                    setShowImageViewer(true);
                                                }}
                                            >
                                                <ImageWithFallback
                                                    src={img}
                                                    alt={`${product.name} ${i + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                {showOverlay && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                        <span className="text-white font-black text-3xl md:text-4xl drop-shadow-md" dir="ltr">
                                                            +{remainingCount}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            <div className="pt-1 border-t border-gray-500 dark:border-white/20 space-y-3">
                                <div className="text-right">
                                    {product.subtitle && (
                                        <p className="text-gray-900 dark:text-white font-black text-xl mb-2">
                                            {product.subtitle}
                                        </p>
                                    )}

                                    <div
                                        className="text-gray-600 dark:text-gray-300 font-bold text-sm md:text-base leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: renderDescription(product.description) }}
                                    />

                                    {!interfaceSettings.hideSKU && (
                                        <div className="flex items-center justify-start mt-4">
                                            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
                                                <span>{t('product.code') || 'رمز المنتج'} :</span>
                                                <span className="font-mono tracking-wider">
                                                    {product.code || product.id?.slice(-8).toUpperCase() || '302501'}
                                                </span>
                                                <div
                                                    className="text-blue-500 hover:text-blue-400 cursor-pointer transition-colors p-1"
                                                    title="نسخ الرمز"
                                                    onClick={() => {
                                                        const code = product.code || product.id?.slice(-8).toUpperCase() || '302501';
                                                        navigator.clipboard.writeText(code);
                                                        alert('تم نسخ الرمز: ' + code);
                                                    }}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Custom Limit Toast */}
                <AnimatePresence>
                    {showLimitToast && (
                        <motion.div
                            initial={{ opacity: 0, x: 20, y: -20 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            exit={{ opacity: 0, x: 20, y: -20 }}
                            className="fixed top-4 right-4 z-[10000] w-[90%] max-w-[320px]"
                        >
                            <div className="bg-[#b44444] rounded-xl overflow-hidden shadow-2xl relative px-4 py-6">
                                <motion.div
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className="absolute top-0 left-0 h-1.5 bg-[#a5d63f]"
                                />
                                <button
                                    onClick={() => setShowLimitToast(false)}
                                    className="absolute top-3 right-3 text-white/70 hover:text-white z-10 p-1"
                                >
                                    <CloseIcon size={14} />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 text-start">
                                        <h4 className="text-white font-black text-base mb-0.5">{t('product.error_limit_title')}</h4>
                                        <p className="text-white/95 font-bold text-[13px] leading-tight">
                                            {t('product.error_limit_message')}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-lg p-2 flex items-center justify-center shrink-0 shadow-lg">
                                        <ShieldAlert className="text-[#b44444] w-6 h-6" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Success Toast */}
                <AnimatePresence>
                    {showSuccessToast && (
                        <motion.div
                            initial={{ opacity: 0, x: 20, y: -20 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            exit={{ opacity: 0, x: 20, y: -20 }}
                            className="fixed top-4 right-4 z-[10000] w-[90%] max-w-[320px]"
                        >
                            <div className="bg-[#3e7b27] rounded-xl overflow-hidden shadow-2xl relative px-4 py-6">
                                <motion.div
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className="absolute top-0 left-0 h-1.5 bg-[#8fd14f]"
                                />
                                <button
                                    onClick={() => setShowSuccessToast(false)}
                                    className="absolute top-3 right-3 text-white/70 hover:text-white z-10 p-1"
                                >
                                    <CloseIcon size={14} />
                                </button>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 text-start">
                                        <h4 className="text-white font-black text-base mb-0.5">{t('product.success_title')}</h4>
                                        <p className="text-white/95 font-bold text-[13px] leading-tight">
                                            {t('product.success_message')}
                                        </p>
                                    </div>
                                    <div className="bg-transparent p-2 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="text-white w-8 h-8" strokeWidth={3} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Related Products Section */}
            {relatedProducts.length > 0 && (
                <section className="w-full px-0 mt-2 mb-0">
                    <div className="px-4 mb-2">
                        <h2 className="text-gray-900 dark:text-white font-black text-lg text-start">{t('product.related_products')}</h2>
                    </div>
                    <DraggableScrollContainer className="flex gap-1 overflow-x-auto pb-2 px-1 scrollbar-hide">
                        {relatedProducts.map((p) => (
                            <Link
                                to={`/product/${p.id}`}
                                key={p.id}
                                className={`w-[200px] md:w-[240px] shrink-0 relative flex flex-col justify-between h-full bg-white dark:bg-[#0f1114] rounded-[32px] border-2 border-gray-100 dark:border-white/10 group transition-transform duration-300 hover:scale-[1.02] shadow-md dark:shadow-none Select-none`}
                                draggable="false"
                            >
                                <div className="bg-gray-50 dark:bg-[#1a1d23] rounded-[28px] overflow-hidden border border-gray-100 dark:border-white/5 relative z-10 flex-1 flex flex-col">
                                    <div className="relative aspect-square w-full bg-gray-200 dark:bg-[#2b2d31]">
                                        <img src={p.mainImage} alt={p.name} className="absolute inset-0 w-full h-full object-cover" draggable="false" />
                                        {p.priceAfterDiscount && p.priceAfterDiscount < p.price && (
                                            <div className="absolute top-4 left-2 bg-[#f43f5e] text-white text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-0.5 shadow-md z-10">
                                                <span className="transform rotate-45 text-[10px]">🏷️</span>
                                                <span>{t('product.discount')} {p.discount ? `${p.discount}%` : ''}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="px-4 pt-4 pb-3 flex-1">
                                        <h3 className="text-gray-900 dark:text-white font-black text-sm md:text-base leading-tight text-right line-clamp-2 min-h-[40px]">
                                            {p.name}
                                        </h3>
                                    </div>
                                </div>
                                <div className="px-5 py-3 flex flex-col items-start justify-center min-h-[70px]">
                                    {p.priceAfterDiscount && p.priceAfterDiscount < p.price ? (
                                        <>
                                            <span className="text-[#16a34a] dark:text-[#4ade80] font-black text-[15px] md:text-[16px] tracking-tight leading-tight">
                                                {formatPrice(p.priceAfterDiscount)}
                                            </span>
                                            <span className="text-gray-500 dark:text-white/70 text-[13px] font-bold line-through">
                                                {formatPrice(p.price)}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-gray-900 dark:text-white font-black text-[15px] md:text-[16px] tracking-tight">
                                            {formatPrice(p.price)}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </DraggableScrollContainer>
                </section>
            )}

            <ShareModal isOpen={showShare} onClose={() => setShowShare(false)} product={product} />
            <ImageViewerModal
                isOpen={showImageViewer}
                onClose={() => setShowImageViewer(false)}
                images={[product.mainImage, ...(product.gallery || [])].filter(Boolean)}
                initialIndex={imageViewerStartIndex}
            />
        </div>
    );
};

export default ProductDetail;
