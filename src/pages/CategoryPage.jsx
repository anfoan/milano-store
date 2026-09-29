import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowRight, ShoppingBag, Filter } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useSettings } from '../hooks/useSettings';

const optimizeCategoryImage = (url, width = 560) => {
    if (!url || typeof url !== 'string') return url;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.hostname.includes('res.cloudinary.com') && parsed.pathname.includes('/upload/')) {
            parsed.pathname = parsed.pathname.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
        } else if (parsed.hostname.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format');
            parsed.searchParams.set('fit', 'crop');
            parsed.searchParams.set('w', String(width));
        }
        return parsed.toString();
    } catch { return url; }
};

const CategoryPage = () => {
    const { categoryName } = useParams();
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { formatPrice } = useCurrency();
    const { generalSettings, interfaceSettings } = useSettings();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Decode URI component in case of Arabic characters
    const decodedCategoryName = decodeURIComponent(categoryName);

    useEffect(() => {
        const fetchCategoryProducts = async () => {
            // window.scrollTo(0, 0); // Handled globally by ScrollToTop
            setLoading(true);
            try {
                const hideOutOfStock = interfaceSettings?.hideOutOfStock;
                // Use the Home cache for instant navigation, then refresh only this category.
                let allProducts = [];
                try {
                    const cached = JSON.parse(localStorage.getItem('cached_products') || '[]');
                    if (Array.isArray(cached)) allProducts = cached;
                } catch { /* network fetch below remains the source of truth */ }
                if (allProducts.length > 0) {
                    const cachedCategory = allProducts
                        .filter(p => p.category === decodedCategoryName && !p.hidden && (!hideOutOfStock || Number(p.stock || 0) > 0))
                        .sort((a, b) => Number(a.order ?? 999999) - Number(b.order ?? 999999));
                    setProducts(cachedCategory);
                    setLoading(false);
                }

                const productsRef = query(collection(db, 'products'), where('category', '==', decodedCategoryName));
                const snapshot = await getDocs(productsRef);
                allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const filtered = allProducts
                    .filter(p => {
                        const matchesCategory = p.category === decodedCategoryName;
                        const isVisible = !p.hidden;
                        const hasStock = hideOutOfStock ? (Number(p.stock || 0) > 0) : true;
                        return matchesCategory && isVisible && hasStock;
                    })
                    .sort((a, b) => {
                        // 1. Sort by 'order' (ascending)
                        const orderA = a.order !== undefined ? Number(a.order) : 999999;
                        const orderB = b.order !== undefined ? Number(b.order) : 999999;
                        if (orderA !== orderB) return orderA - orderB;

                        // 2. Secondary sort: createdAt (descending)
                        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                        return dateB - dateA;
                    });

                setProducts(filtered);
            } catch (error) {
                console.error("Error fetching category products:", error);
            } finally {
                setLoading(false);
            }
        };

        if (decodedCategoryName) {
            fetchCategoryProducts();
        }
    }, [decodedCategoryName, interfaceSettings]);

    const isClosed = false; // Simplified for this view, or use storeStatus hook if needed

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] pb-8 pt-4">
            <div className="w-full px-2 md:px-6">

                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#1a1d23] rounded-full shadow-sm hover:shadow-md transition-shadow"
                    >
                        <ArrowRight className="w-5 h-5 text-gray-700 dark:text-white" />
                    </button>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">{decodedCategoryName}</h1>
                    </div>
                </div>

                {/* Products Grid */}
                {loading ? (
                    <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="w-[200px] md:w-[240px] aspect-[4/5] bg-gray-200 dark:bg-[#1a1d23] rounded-[32px] animate-pulse"></div>
                        ))}
                    </div>
                ) : products.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
                        {products.map((product) => (
                            <Link
                                to={`/product/${product.id}`}
                                key={product.id}
                                className={`w-full relative flex flex-col justify-between h-full bg-white dark:bg-[#0f1114] rounded-[24px] md:rounded-[32px] border-2 border-gray-100 dark:border-white/10 group transition-transform duration-300 hover:scale-[1.02] shadow-md dark:shadow-none Select-none`}
                            >
                                {/* Upper Block: Image & Title */}
                                <div className="bg-gray-50 dark:bg-[#1a1d23] rounded-[20px] md:rounded-[28px] overflow-hidden border border-gray-100 dark:border-white/5 relative z-10 flex-1 flex flex-col">
                                    {/* Image Container */}
                                    <div className="relative aspect-square w-full bg-gray-200 dark:bg-[#2b2d31]">
                                        <img
                                            src={optimizeCategoryImage(product.mainImage)}
                                            alt={product.name}
                                            className="absolute inset-0 w-full h-full object-cover"
                                            draggable="false"
                                            loading="lazy"
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
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-[#1a1d23] rounded-full flex items-center justify-center mx-auto mb-4">
                            <Filter className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">لا توجد منتجات</h3>
                        <p className="text-gray-500 text-sm mt-2">لم يتم العثور على منتجات في هذا القسم حالياً</p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                        >
                            العودة للرئيسية
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CategoryPage;
