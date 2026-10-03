import { useState, useEffect } from 'react';
import { Trash2, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import QuantityStepper from '../components/QuantityStepper';

const Cart = () => {
    const { t, direction, language } = useLanguage();
    const { cartSettings, generalSettings } = useSettings();
    const { formatPrice } = useCurrency();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [stockByItem, setStockByItem] = useState({});
    const [showCouponInput, setShowCouponInput] = useState(false);

    // Coupon State
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [couponSuccess, setCouponSuccess] = useState('');

    useEffect(() => {
        window.scrollTo(0, 0);
        let storedCart = [];
        try {
            const stored = localStorage.getItem('cart');
            storedCart = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(storedCart)) storedCart = [];
        } catch (e) {
            console.error("Cart corrupted", e);
            storedCart = [];
        }
        setItems(storedCart);

        // Read live stock so a stale cart cannot request more than inventory.
        const loadStock = async () => {
            const entries = await Promise.all(storedCart.map(async (item) => {
                try {
                    const snap = await getDoc(doc(db, 'products', item.id));
                    if (!snap.exists()) return [item.id + '::' + (item.size || ''), 0];
                    const data = snap.data();
                    const stock = item.size && data.sizeStocks && Object.prototype.hasOwnProperty.call(data.sizeStocks, item.size)
                        ? Number(data.sizeStocks[item.size] || 0)
                        : Number(data.stock || 0);
                    return [item.id + '::' + (item.size || ''), Math.max(0, stock)];
                } catch { return [item.id + '::' + (item.size || ''), 0]; }
            }));
            setStockByItem(Object.fromEntries(entries));
        };
        loadStock();

        // Restore applied coupon if exists
        const storedCoupon = JSON.parse(localStorage.getItem('cart_coupon') || 'null');
        if (storedCoupon) {
            setAppliedCoupon(storedCoupon);
            setCouponCode(storedCoupon.code);
            setCouponSuccess(couponSuccessText(storedCoupon));
        }
    }, [t]);

    const isFixedCoupon = coupon => coupon?.discountType === 'fixed' || Number(coupon?.discountAmount || 0) > 0;
    const calculateCouponDiscount = (coupon, subtotal) => {
        if (!coupon) return 0;
        if (isFixedCoupon(coupon)) return Math.min(Math.max(0, Number(subtotal || 0)), Math.max(0, Math.round(Number(coupon.discountAmount || 0))));
        return Math.round(Math.max(0, Number(subtotal || 0)) * (Math.max(0, Number(coupon.discountPercent || 0)) / 100));
    };
    const couponSuccessText = (coupon, subtotal = 0) => isFixedCoupon(coupon)
        ? (language === 'ar' ? `تم تطبيق خصم ثابت بقيمة ${formatPrice(calculateCouponDiscount(coupon, subtotal || Number(coupon.discountAmount || 0)))}` : `Fixed discount applied: ${formatPrice(calculateCouponDiscount(coupon, subtotal || Number(coupon.discountAmount || 0)))}`)
        : t('cart.coupon_success').replace('{percent}', coupon.discountPercent);

    const updateCart = (newItems) => {
        setItems(newItems);
        localStorage.setItem('cart', JSON.stringify(newItems));
        window.dispatchEvent(new CustomEvent('cart-updated'));
    };

    const removeFromCart = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        updateCart(newItems);
    };

    const updateQuantity = (index, newQty) => {
        const item = items[index];
        const key = item.id + '::' + (item.size || '');
        const maxStock = stockByItem[key];
        const requested = Math.max(0, parseInt(newQty, 10) || 0);
        const qty = Number.isFinite(maxStock) ? Math.min(requested, maxStock) : requested;

        if (requested > qty) {
            alert(`عذراً، الكمية المتوفرة لهذا المنتج هي ${maxStock} فقط`);
        }
        if (qty === 0) {
            removeFromCart(index);
            return;
        }

        // Check the store-wide cart limit as well as product inventory.
        if (cartSettings?.enableMaxCount && cartSettings?.maxProductCount) {
            const currentTotalItems = items.reduce((acc, current, i) => acc + (i === index ? 0 : current.quantity), 0);
            if ((currentTotalItems + qty) > cartSettings.maxProductCount) {
                alert(t('cart.max_limit_alert').replace('{count}', cartSettings.maxProductCount));
                return;
            }
        }

        const newItems = [...items];
        newItems[index].quantity = qty;
        updateCart(newItems);
    };

    const handleApplyCoupon = async () => {
        setCouponError('');
        setCouponSuccess('');

        if (!couponCode.trim()) return;

        try {
            const q = query(collection(db, "coupons"), where("code", "==", couponCode.trim().toUpperCase()));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setCouponError(t('cart.coupon_invalid'));
                return;
            }

            const couponData = snapshot.docs[0].data();
            const couponId = snapshot.docs[0].id;

            // Check usage limits
            if (!couponData.isUnlimited && couponData.usedCount >= couponData.maxUses) {
                setCouponError(t('cart.coupon_limit'));
                return;
            }

            // Check Expiry Date
            if (couponData.expiryDate) {
                const today = new Date();
                const expiry = new Date(couponData.expiryDate);
                // Set expiry to end of day
                expiry.setHours(23, 59, 59, 999);

                if (today > expiry) {
                    setCouponError(t('cart.coupon_expired'));
                    return;
                }
            }

            // Check Minimum Order Amount
            const currentTotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            if (couponData.minOrderAmount && currentTotal < couponData.minOrderAmount) {
                setCouponError(t('cart.coupon_min_amount').replace('{amount}', couponData.minOrderAmount));
                return;
            }

            const couponObj = { id: couponId, ...couponData };
            setAppliedCoupon(couponObj);
            setCouponSuccess(couponSuccessText(couponObj, currentTotal));
            localStorage.setItem('cart_coupon', JSON.stringify(couponObj));
        } catch (error) {
            console.error("Error applying coupon:", error);
            setCouponError(t('common.error'));
        }
    };

    const removeCoupon = () => {
        setAppliedCoupon(null);
        setCouponCode('');
        setCouponSuccess('');
        localStorage.removeItem('cart_coupon');
    };

    const displaySubtotal = items.reduce((acc, item) => acc + ((item.originalPrice || item.price) * item.quantity), 0);
    const totalPrice = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // The configured fixed coupon amount is applied after product sales and never exceeds the subtotal.
    const couponDiscount = calculateCouponDiscount(appliedCoupon, totalPrice);

    const totalDiscount = (displaySubtotal - totalPrice) + couponDiscount;
    const finalTotal = displaySubtotal - totalDiscount;

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-brand-black text-gray-900 dark:text-white flex flex-col items-center justify-center space-y-4">
                <h2 className="text-2xl font-bold text-gray-500 dark:text-gray-400">{t('cart.empty')}</h2>
                <Link to="/" className="px-6 py-3 bg-brand-blue text-white rounded-xl font-bold">{t('cart.browse_products')}</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-brand-black text-gray-900 dark:text-white pb-20 pt-4 transition-colors duration-300">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">

                {/* Modern Back Button Header */}
                <div className="flex items-center gap-3 mb-2">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h1 className="text-2xl font-black text-brand-blue">{t('cart.title')}</h1>
                </div>

                {/* Cart Items List */}
                <div className="mb-2 space-y-4 lg:ml-auto lg:max-w-[1120px]">
                    {items.map((item, index) => (
                        <div key={`${item.id}-${index}`} className="bg-white dark:bg-[#1c1c1e] rounded-[30px] border border-gray-100 dark:border-white/5 p-4 relative group overflow-hidden shadow-md dark:shadow-none transition-colors duration-300">
                            
                            <div className="flex items-center gap-3">
                                {/* Image */}
                                <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-xl flex-shrink-0 overflow-hidden border border-gray-200 dark:border-white/10">
                                    <ImageWithFallback src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                </div>

                                {/* Details */}
                                <div className="flex-1 flex flex-col min-w-0">
                                    <h3 className="font-bold text-base md:text-lg text-gray-900 dark:text-white leading-tight break-words">
                                        {item.title}
                                    </h3>
                                    
                                    <div className="flex items-center gap-3 mt-4">
                                        {item.size && (
                                            <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-bold">
                                                {t('common.size')}: {item.size}
                                            </p>
                                        )}

                                        {/* Row for Quantity and Remove Button */}
                                        <div className="flex items-center gap-2">
                                            {/* Inventory-aware quantity stepper */}
                                            <QuantityStepper
                                                value={item.quantity}
                                                min={0}
                                                max={Number.isFinite(stockByItem[item.id + '::' + (item.size || '')]) ? stockByItem[item.id + '::' + (item.size || '')] : item.quantity}
                                                onChange={(next) => updateQuantity(index, next)}
                                                compact
                                                label={t('cart.quantity') || 'Quantity'}
                                            />

                                            {/* Trash Button - Next to Quantity */}
                                            <button
                                                onClick={() => removeFromCart(index)}
                                                className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all flex-shrink-0"
                                                title={t('cart.remove')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Price Section */}
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 w-full flex justify-between items-center">
                                <span className="text-[#16a34a] dark:text-[#4ade80] font-black text-xl">
                                    {formatPrice(item.price)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Order Summary Card */}
                <div className="bg-white dark:bg-[#1c1c1e] rounded-[30px] border border-gray-100 dark:border-white/5 p-5 md:p-8 max-w-2xl mx-auto shadow-xl dark:shadow-2xl transition-colors duration-300">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white text-start mb-4">{t('cart.order_summary')}</h2>

                    <div className="text-center mb-4">
                        <span className="text-3xl font-black text-gray-900 dark:text-white">{formatPrice(finalTotal)}</span>
                    </div>

                    <div className="space-y-4 mb-4">
                        <div className="flex justify-between items-center text-sm font-bold">
                            <span className="text-gray-900 dark:text-white">{formatPrice(displaySubtotal)}</span>
                            <span className="text-gray-500 dark:text-gray-400">{t('cart.subtotal')}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm font-bold">
                            <span className="text-[#16a34a] dark:text-[#4ade80]">
                                - {formatPrice(totalDiscount)}
                            </span>
                            <div className="flex items-center gap-2">
                                {displaySubtotal > 0 && totalDiscount > 0 && (
                                    <span className="text-[10px] bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50 font-black">
                                        {Math.round((totalDiscount / displaySubtotal) * 100)}%
                                    </span>
                                )}
                                <span className="text-gray-500 dark:text-gray-400">{t('cart.discount')}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-base font-black border-t border-gray-100 dark:border-white/10 pt-4 mt-4">
                            <span className="text-gray-900 dark:text-white">{formatPrice(finalTotal)}</span>
                            <span className="text-gray-500 dark:text-gray-400">{t('cart.total')}</span>
                        </div>
                    </div>

                    <div className="mb-4 flex flex-col items-center gap-2">
                        {!showCouponInput && !appliedCoupon ? (
                            <button
                                onClick={() => setShowCouponInput(true)}
                                className="text-brand-blue font-bold text-sm hover:underline"
                            >
                                {t('cart.add_coupon')}
                            </button>
                        ) : appliedCoupon ? (
                            <div className="w-full bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-3 flex justify-between items-center px-4">
                                <span className="text-green-600 font-bold text-sm">{couponSuccess}</span>
                                <button onClick={removeCoupon} className="text-red-500 text-sm font-bold hover:underline">{t('cart.remove')}</button>
                            </div>
                        ) : (
                            <div className="w-full space-y-2">
                                <div className="flex w-full items-center gap-2 border border-gray-200 dark:border-white/10 rounded-xl p-1 bg-gray-50 dark:bg-[#2a2e35]">
                                    <input
                                        type="text"
                                        placeholder={t('cart.coupon_placeholder')}
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        className="bg-transparent border-none outline-none text-gray-900 dark:text-white px-3 py-2 flex-1 text-start text-sm"
                                    />
                                    <button
                                        onClick={handleApplyCoupon}
                                        className="bg-gradient-to-r from-[#06b6d4] to-[#3b82f6] text-white font-bold py-2 px-6 rounded-lg text-sm hover:opacity-90 transition-opacity"
                                    >
                                        {t('cart.apply')}
                                    </button>
                                </div>
                                {couponError && <p className="text-red-500 text-xs font-bold text-start px-1">{couponError}</p>}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            // Check Min/Max Order Amount before navigation
                            if (cartSettings?.enableMinAmount && cartSettings?.minOrderAmount) {
                                if (finalTotal < cartSettings.minOrderAmount) {
                                    alert(t('cart.min_order_alert').replace('{amount}', formatPrice(cartSettings.minOrderAmount)));
                                    return;
                                }
                            }

                            if (cartSettings?.enableMaxAmount && cartSettings?.maxOrderAmount) {
                                if (finalTotal > cartSettings.maxOrderAmount) {
                                    alert(t('cart.max_order_alert').replace('{amount}', formatPrice(cartSettings.maxOrderAmount)));
                                    return;
                                }
                            }

                            navigate('/checkout');
                        }}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-[#06b6d4] to-[#3b82f6] text-white font-black text-xl shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        {t('cart.confirm_order')}
                    </button>

                </div>

            </div>
        </div>
    );
};

export default Cart;
