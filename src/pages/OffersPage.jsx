import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, ArrowRight, Percent } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, onSnapshot } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import ImageWithFallback from '../components/ImageWithFallback';

const OffersPage = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { generalSettings, interfaceSettings } = useSettings();
    const { t, language, direction } = useLanguage();
    const { formatPrice } = useCurrency();

    useEffect(() => {
        window.scrollTo(0, 0);
        const q = collection(db, "products");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            try {
                const discountedProducts = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .filter(p => {
                        const isVisible = !p.hidden;
                        const hasDiscount = (Number(p.discount || 0) > 0 || (p.priceAfterDiscount && Number(p.priceAfterDiscount) < Number(p.price))) && !p.isOfferPaused;
                        const hideOutOfStock = interfaceSettings?.hideOutOfStock;
                        const hasStock = hideOutOfStock ? (Number(p.stock || 0) > 0) : true;
                        return isVisible && hasDiscount && hasStock;
                    })
                    .sort((a, b) => {
                        // 1. Sort by 'offerOrder' or 'order' (ascending)
                        const orderA = (a.offerOrder !== undefined && a.offerOrder !== null && !isNaN(a.offerOrder))
                            ? Number(a.offerOrder)
                            : ((a.order !== undefined && a.order !== null && !isNaN(a.order)) ? Number(a.order) : 999999);
                            
                        const orderB = (b.offerOrder !== undefined && b.offerOrder !== null && !isNaN(b.offerOrder))
                            ? Number(b.offerOrder)
                            : ((b.order !== undefined && b.order !== null && !isNaN(b.order)) ? Number(b.order) : 999999);

                        if (orderA !== orderB) return orderA - orderB;

                        // 2. Secondary sort: createdAt (descending)
                        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                        return dateB - dateA;
                    });
                setProducts(discountedProducts);
            } catch (error) {
                console.error("Error processing offers:", error);
            } finally {
                setLoading(false);
            }
        }, (error) => {
            console.error("Error fetching offers via snapshot:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [interfaceSettings]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 pb-20" dir={direction}>
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-600 to-rose-500 pt-10 pb-20 px-4 relative">
                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className={`absolute top-6 z-10 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-all shadow-sm border border-white/10 ${direction === 'rtl' ? 'right-6' : 'left-6'}`}
                >
                    <ArrowRight size={20} className="flip-rtl" />
                </button>
                <div className="w-full text-center">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-bold mb-4"
                    >
                        <Percent size={16} />
                        <span>عروض حصرية وخصومات كبرى</span>
                    </motion.div>
                    <h1 className="text-3xl md:text-5xl font-black text-white mb-4">صفحة العروض والخصومات</h1>
                    <p className="text-pink-100 font-bold max-w-2xl mx-auto">استمتع بأفضل الأسعار على منتجاتك المفضلة من متجر ميلانو. تخفيضات لفترة محدودة!</p>
                </div>
            </div>

            {/* Products Grid */}
            <div className="w-full px-2 md:px-6 -mt-10">
                {products.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-12 text-center shadow-xl border border-gray-100 dark:border-white/5">
                        <ShoppingBag size={64} className="mx-auto text-gray-300 mb-4 opacity-20" />
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">لا توجد عروض حالياً</h2>
                        <p className="text-gray-500">عد لاحقاً لمشاهدة أحدث الخصومات</p>
                        <Link to="/" className="inline-flex items-center gap-2 mt-6 bg-pink-500 text-white px-8 py-3 rounded-2xl font-black hover:scale-105 transition-transform shadow-lg shadow-pink-500/20">
                            العودة للتسوق
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1">
                        {products.map((product) => (
                            <Link
                                to={`/product/${product.id}`}
                                key={product.id}
                                className={`w-full relative flex flex-col justify-between h-full bg-white dark:bg-[#0f1114] rounded-[20px] md:rounded-[32px] border-2 border-gray-100 dark:border-white/10 group transition-transform duration-300 hover:scale-[1.02] shadow-sm dark:shadow-none`}
                            >
                                {/* Upper Block: Image & Title */}
                                <div className="bg-gray-50 dark:bg-[#1a1d23] rounded-[24px] md:rounded-[28px] overflow-hidden border border-gray-100 dark:border-white/5 relative z-10 flex-1 flex flex-col">
                                    <div className="relative aspect-square w-full bg-gray-200 dark:bg-[#2b2d31]">
                                        <ImageWithFallback
                                            src={product.mainImage}
                                            alt={product.name}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />

                                        {/* Discount Badge - Left Side */}
                                        <div className="absolute top-4 left-2 bg-[#f43f5e] text-white text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-0.5 shadow-md z-10">
                                            <span className="transform rotate-45 text-[10px]">🏷️</span>
                                            <span>{t('product.discount')} {Math.round((1 - product.priceAfterDiscount / product.price) * 100)}%</span>
                                        </div>

                                        {/* Menu Icon - Right Side */}
                                        <div className="absolute top-4 right-4 w-10 h-10 bg-white/80 dark:bg-[#111317]/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-900 dark:text-white border border-gray-200 dark:border-white/5 z-10 hover:bg-gray-100 dark:hover:bg-black transition-colors">
                                            <div className="space-y-1">
                                                <div className="w-5 h-0.5 bg-gray-900 dark:bg-white rounded-full"></div>
                                                <div className="w-5 h-0.5 bg-gray-900 dark:bg-white rounded-full"></div>
                                                <div className="w-5 h-0.5 bg-gray-900 dark:bg-white rounded-full"></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-3 pt-3 pb-1 flex-1">
                                        <h3 className="text-gray-900 dark:text-white font-bold text-[12px] md:text-[15px] leading-tight text-right line-clamp-2 min-h-[32px]">
                                            {product.name}
                                        </h3>
                                    </div>
                                </div>

                                {/* Price Section */}
                                <div className="px-4 py-3 flex flex-col items-start justify-center min-h-[60px] md:min-h-[82px] w-full text-right" dir="rtl">
                                    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                                        <span className="text-[#16a34a] dark:text-[#4ade80] font-bold text-[14px] md:text-[17px] tracking-wide">
                                            {formatPrice(product.priceAfterDiscount)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-gray-500 dark:text-white/60 text-[10px] md:text-[12px] font-bold line-through decoration-1 opacity-90 whitespace-nowrap">
                                        <span>{formatPrice(product.price)}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OffersPage;
