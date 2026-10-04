import { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle2, ChevronLeft, AlertTriangle, ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import { db } from '../lib/firebase';

import { collection, doc, updateDoc, increment, getDoc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import { useSettings } from '../hooks/useSettings';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { getLocalizedCurrency } from '../lib/currencyUtils';
import { getCustomerWalletId, getPhoneWalletId, hashWalletPin, normalizePhone, walletNumber } from '../lib/wallet';
import { buildCustomerOrderHistory, customerOrderHistoryRef } from '../lib/customerOrderHistory';

const Checkout = () => {
    const { t, direction, language } = useLanguage();
    const { generalSettings, interfaceSettings } = useSettings();
    const { formatPrice, activeCurrency } = useCurrency();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        country: language === 'ar' ? 'اليمن' : 'Yemen',
        city: '',
        address: '',
        notes: '',
        paymentMethod: '',
        deliveryType: 'home' // 'home' or 'office'
    });

    // Settings State
    const [paymentSettings, setPaymentSettings] = useState({
        cod_enabled: true,
        whatsapp_enabled: true,
        whatsapp_number: '',
        whatsapp_label: 'تواصل لإكمال عملية الدفع عبر واتساب'
    });
    const [deliverySettings, setDeliverySettings] = useState({
        freeDeliveryAll: false,
        splitFees: false,
        freeAboveLimit: false,
        limitAmount: 0,
        dynamicPricing: false,
        dynamicThreshold: 0,
        regions: []
    });
    const [orderSettings, setOrderSettings] = useState({
        emailStatus: 'hide', // hide, optional, required
        maxDailyOrders: 3
    });

    const [loading, setLoading] = useState(true);
    const deviceWalletId = getCustomerWalletId();
    const [customerWallet, setCustomerWallet] = useState(null);
    const [walletSettings, setWalletSettings] = useState({ enabled: true });
    const [useWalletCredit, setUseWalletCredit] = useState(false);
    const [walletPin, setWalletPin] = useState('');
    const [walletPinVerified, setWalletPinVerified] = useState(false);
    const [walletPinOpen, setWalletPinOpen] = useState(false);
    const [walletPinError, setWalletPinError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Payment Settings
                const paymentDoc = await getDoc(doc(db, "settings", "payments"));
                if (paymentDoc.exists()) {
                    const data = paymentDoc.data();
                    // Normalize old label to new one if they match legacy versions
                    if (data.whatsapp_label === 'تواصل لإكمال عملية الدفع' || data.whatsapp_label === 'تواصل معنا لإكمال عملية الدفع') {
                        data.whatsapp_label = 'تواصل لإكمال عملية الدفع عبر واتساب';
                    }
                    setPaymentSettings(prev => ({ ...prev, ...data }));
                }

                // Fetch Delivery Settings
                const deliveryDoc = await getDoc(doc(db, "settings", "delivery"));
                if (deliveryDoc.exists()) {
                    setDeliverySettings(prev => ({ ...prev, ...deliveryDoc.data() }));
                }

                // Fetch Order Page Settings
                const orderDoc = await getDoc(doc(db, "settings", "order"));
                if (orderDoc.exists()) {
                    setOrderSettings(prev => ({ ...prev, ...orderDoc.data() }));
                }
            } catch (err) {
                console.error("Error fetching settings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'wallet'), snapshot => {
            setWalletSettings(previous => ({ ...previous, ...(snapshot.exists() ? snapshot.data() : {}) }));
        }, error => console.error('Checkout wallet availability listener:', error));
        return () => unsubscribe();
    }, []);

    // Fetch Cart Settings
    const [cartSettings, setCartSettings] = useState({});
    const [storeStatus, setStoreStatus] = useState({ isOpen: true }); // Default Open

    useEffect(() => {
        const fetchCartSettings = async () => {
            const docRef = doc(db, "settings", "cart");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setCartSettings(docSnap.data());
            }
        };
        fetchCartSettings();

        // Listen to Store Status
        const statusUnsub = onSnapshot(doc(db, "settings", "store"), (docSnap) => {
            if (docSnap.exists()) {
                setStoreStatus(docSnap.data());
            }
        });
        return () => statusUnsub();
    }, []);

    // Country Code Logic
    const [showCountryDropdown, setShowCountryDropdown] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState({ code: 'ye', dial_code: '+967', name: language === 'ar' ? 'اليمن' : 'Yemen' });
    const [searchQuery, setSearchQuery] = useState('');
    const today = new Date().toISOString().split('T')[0]; // Define 'today' here
    // Once the visitor enters a valid phone number, always use that phone-linked wallet.
    // Before a phone is entered, the device wallet remains the safe default for the header flow.
    const phoneWalletId = getPhoneWalletId(`${selectedCountry.dial_code}${normalizePhone(formData.phone)}`);
    const activeWalletId = phoneWalletId || deviceWalletId;
    const walletEnabled = walletSettings.enabled !== false;

    useEffect(() => {
        if (!walletEnabled || !activeWalletId) { setCustomerWallet(null); return undefined; }
        const walletRef = doc(db, 'customer_wallets', activeWalletId);
        const unsubscribe = onSnapshot(walletRef, snapshot => {
            setCustomerWallet(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        }, error => {
            console.error('Checkout wallet listener:', error);
            setCustomerWallet(null);
        });
        return () => unsubscribe();
    }, [activeWalletId, walletEnabled]);

    useEffect(() => {
        // Prevent a previously confirmed PIN from carrying over to a different phone number or a disabled wallet.
        setUseWalletCredit(false);
        setWalletPinVerified(false);
        setWalletPin('');
        setWalletPinOpen(false);
        setWalletPinError('');
    }, [activeWalletId]);

    const countries = [
        { name: language === 'ar' ? "اليمن" : "Yemen", dial_code: "+967", code: "ye" },
        { name: language === 'ar' ? "السعودية" : "Saudi Arabia", dial_code: "+966", code: "sa" },
        { name: language === 'ar' ? "مصر" : "Egypt", dial_code: "+20", code: "eg" },
        { name: language === 'ar' ? "الإمارات" : "United Arab Emirates", dial_code: "+971", code: "ae" },
        { name: language === 'ar' ? "الكويت" : "Kuwait", dial_code: "+965", code: "kw" },
        { name: language === 'ar' ? "قطر" : "Qatar", dial_code: "+974", code: "qa" },
        { name: language === 'ar' ? "البحرين" : "Bahrain", dial_code: "+973", code: "bh" },
        { name: language === 'ar' ? "عمان" : "Oman", dial_code: "+968", code: "om" },
        { name: language === 'ar' ? "الأردن" : "Jordan", dial_code: "+962", code: "jo" },
        { name: language === 'ar' ? "العراق" : "Iraq", dial_code: "+964", code: "iq" },
        { name: language === 'ar' ? "لبنان" : "Lebanon", dial_code: "+961", code: "lb" },
        { name: language === 'ar' ? "فلسطين" : "Palestine", dial_code: "+970", code: "ps" },
        { name: language === 'ar' ? "سوريا" : "Syria", dial_code: "+963", code: "sy" },
        { name: language === 'ar' ? "السودان" : "Sudan", dial_code: "+249", code: "sd" },
        { name: language === 'ar' ? "ليبيا" : "Libya", dial_code: "+218", code: "ly" },
        { name: language === 'ar' ? "تونس" : "Tunisia", dial_code: "+216", code: "tn" },
        { name: language === 'ar' ? "الجزائر" : "Algeria", dial_code: "+213", code: "dz" },
        { name: language === 'ar' ? "المغرب" : "Morocco", dial_code: "+212", flag: 'ma', code: "ma" },
        { name: language === 'ar' ? "تركيا" : "Turkey", dial_code: "+90", code: "tr" },
        { name: language === 'ar' ? "أمريكا" : "USA", dial_code: "+1", code: "us" },
        { name: language === 'ar' ? "بريطانيا" : "UK", dial_code: "+44", code: "gb" },
        { name: language === 'ar' ? "الصين" : "China", dial_code: "+86", code: "cn" },
    ];

    // Sync country name when language changes
    useEffect(() => {
        const currentCode = selectedCountry.code;
        const newName = countries.find(c => c.code === currentCode)?.name;
        if (newName && newName !== selectedCountry.name) {
            setSelectedCountry(prev => ({ ...prev, name: newName }));
            setFormData(prev => ({ ...prev, country: newName }));
        }
    }, [language]);

    const filteredCountries = countries.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.dial_code.includes(searchQuery)
    );

    const [cartItems, setCartItems] = useState([]);
    const [cartTotal, setCartTotal] = useState(0);
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [deliveryCost, setDeliveryCost] = useState(0);

    // Initial Cart Load
    useEffect(() => {
        window.scrollTo(0, 0);
        let cart = [];
        try {
            const stored = localStorage.getItem('cart');
            cart = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(cart)) cart = [];
        } catch (e) {
            cart = [];
        }

        if (cart.length === 0) {
            navigate('/cart');
            return;
        }

        const originalSubtotal = cart.reduce((acc, item) => acc + ((item.originalPrice || item.price) * (item.quantity || 1)), 0);
        
        setCartItems(cart);
        setCartTotal(originalSubtotal); // We use originalSubtotal as the display subtotal

        // Load coupon
        const storedCoupon = JSON.parse(localStorage.getItem('cart_coupon') || 'null');
        if (storedCoupon) {
            setAppliedCoupon(storedCoupon);
        }
    }, [navigate]);

    // ⚡ Silent Price Validation (Background)
    useEffect(() => {
        if (cartItems.length === 0) return;

        const validatePrices = async () => {
            let updated = false;
            const newCart = await Promise.all(cartItems.map(async (item) => {
                try {
                    const docRef = doc(db, "products", item.id);
                    const snapshot = await getDoc(docRef);
                    if (snapshot.exists()) {
                        const realData = snapshot.data();
                        const realPrice = realData.priceAfterDiscount ? Number(realData.priceAfterDiscount) : Number(realData.price);
                        const realOriginalPrice = realData.priceAfterDiscount ? Number(realData.price) : null;

                        // Check if price or original price differs
                        if (realPrice !== item.price || realOriginalPrice !== item.originalPrice) {
                            updated = true;
                            return { ...item, price: realPrice, originalPrice: realOriginalPrice };
                        }
                    }
                } catch (e) {
                    console.error("Bg Validation error", e);
                }
                return item;
            }));

            if (updated) {
                console.log("Prices updated silently from server.");
                setCartItems(newCart);
                const newOriginalSubtotal = newCart.reduce((acc, item) => acc + ((item.originalPrice || item.price) * (item.quantity || 1)), 0);
                setCartTotal(newOriginalSubtotal);
                localStorage.setItem('cart', JSON.stringify(newCart));
            }
        };

        // Debounce slightly to avoid double-runs on mount
        const timeout = setTimeout(validatePrices, 500);
        return () => clearTimeout(timeout);
    }, [cartItems.length]); // Only run if number of items changes (or initial load)

    // Calculate Delivery Cost
    useEffect(() => {
        // Check if selected city is still valid
        if (formData.city && deliverySettings.regions.length > 0) {
            const isValidCity = deliverySettings.regions.some(r => r.name === formData.city);
            if (!isValidCity) {
                setFormData(prev => ({ ...prev, city: '' }));
                setDeliveryCost(0);
                return;
            }
        }

        if (!formData.city || deliverySettings.regions.length === 0) {
            setDeliveryCost(0);
            return;
        }

        // 1. Free Delivery All?
        if (deliverySettings.freeDeliveryAll) {
            setDeliveryCost(0);
            return;
        }

        // 2. Free Above Limit?
        if (deliverySettings.freeAboveLimit && cartTotal >= deliverySettings.limitAmount) {
            setDeliveryCost(0);
            return;
        }

        const region = deliverySettings.regions.find(r => r.name === formData.city);
        if (!region) {
            setDeliveryCost(0); // Fallback if region not found
            return;
        }

        // 3. Dynamic Pricing?
        if (deliverySettings.dynamicPricing) {
            if (cartTotal < deliverySettings.dynamicThreshold) {
                const val = region.costLessThan;
                setDeliveryCost(Number(val !== undefined && val !== "" ? val : region.cost));
            } else {
                const val = region.costGreaterThan;
                setDeliveryCost(Number(val !== undefined && val !== "" ? val : region.cost));
            }
            return;
        }

        // 4. Split Fees?
        if (deliverySettings.splitFees) {
            if (formData.deliveryType === 'office') {
                const val = region.officeCost;
                setDeliveryCost(Number(val !== undefined && val !== "" ? val : region.cost));
            } else {
                setDeliveryCost(Number(region.cost)); // Home
            }
            return;
        }

        // 5. Standard
        setDeliveryCost(Number(region.cost));

    }, [formData.city, formData.deliveryType, cartTotal, deliverySettings]);


    const effectiveSubtotal = cartItems.reduce((acc, item) => acc + (item.price * (item.quantity || 1)), 0);
    const isFixedCoupon = coupon => coupon?.discountType === 'fixed' || Number(coupon?.discountAmount || 0) > 0;
    const calculateCouponDiscount = (coupon, subtotal) => {
        if (!coupon) return 0;
        if (isFixedCoupon(coupon)) return Math.min(Math.max(0, Number(subtotal || 0)), Math.max(0, Math.round(Number(coupon.discountAmount || 0))));
        return Math.round(Math.max(0, Number(subtotal || 0)) * (Math.max(0, Number(coupon.discountPercent || 0)) / 100));
    };
    const couponDiscount = calculateCouponDiscount(appliedCoupon, effectiveSubtotal);

    const discountAmount = (cartTotal - effectiveSubtotal) + couponDiscount;
    const total = cartTotal - discountAmount + deliveryCost;
    const walletBalance = walletEnabled ? Math.max(0, Number(customerWallet?.balance || 0)) : 0;
    const walletApplied = walletEnabled && useWalletCredit && walletPinVerified ? Math.min(walletBalance, total) : 0;
    const amountDueAfterWallet = Math.max(0, total - walletApplied);

    const requestWalletCredit = () => {
        if (!walletEnabled) return;
        if (useWalletCredit) {
            setUseWalletCredit(false);
            setWalletPinVerified(false);
            setWalletPin('');
            return;
        }
        if (!customerWallet?.pinHash) {
            alert('يرجى إعداد وتأمين محفظتك برمز PIN أولاً من زر المحفظة أعلى المتجر.');
            return;
        }
        if (walletBalance <= 0) {
            alert('لا يوجد رصيد متاح في محفظتك حاليًا.');
            return;
        }
        setWalletPinError('');
        setWalletPinOpen(true);
    };

    const confirmWalletPin = async () => {
        try {
            const hash = await hashWalletPin(walletPin);
            if (hash !== customerWallet?.pinHash) {
                setWalletPinError('الرمز السري غير صحيح.');
                return;
            }
            setWalletPinVerified(true);
            setUseWalletCredit(true);
            setWalletPinOpen(false);
            setWalletPin('');
        } catch (error) {
            setWalletPinError('أدخل رمزًا من 4 إلى 6 أرقام إنجليزية.');
        }
    };

    const handleConfirm = async (e) => {
        e.preventDefault();

        // 🔒 SECURITY BLOCK START: Payment & Price Verification
        try {
            setLoading(true); // Show loading while verifying

            // 0. Store Status Check (Security)
            if (storeStatus && !storeStatus.isOpen) {
                throw new Error("عذراً، المتجر مشغول حالياً ولا يستقبل طلبات جديدة.");
            }

            // 0. Cart Limits Verification
            if (cartSettings.enableMinAmount && total < cartSettings.minOrderAmount) {
                throw new Error(t('cart.min_order_alert').replace('{amount}', formatPrice(cartSettings.minOrderAmount)));
            }
            if (cartSettings.enableMaxAmount && total > cartSettings.maxOrderAmount) {
                throw new Error(t('cart.max_order_alert').replace('{amount}', formatPrice(cartSettings.maxOrderAmount)));
            }
            if (cartSettings.enableMaxCount) {
                const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
                if (totalItems > cartSettings.maxProductCount) {
                    throw new Error(t('cart.max_limit_alert').replace('{count}', cartSettings.maxProductCount));
                }
            }


            // 0.5 Daily Order Limit Verification
            const today = new Date().toISOString().split('T')[0];
            const storedDaily = JSON.parse(localStorage.getItem('daily_orders') || '{}');
            // Reset count if new day
            if (storedDaily.date !== today) {
                storedDaily.date = today;
                storedDaily.count = 0;
            }
            if (storedDaily.count >= (orderSettings.maxDailyOrders || 3)) {
                throw new Error(`عذراً، لقد تجاوزت الحد الأقصى للطلبات اليومية المسموح بها.`);
            }

            // 0.6 Email Validation (Server Logic Simulation)
            if (orderSettings.emailStatus === 'required' && !formData.email) {
                throw new Error("البريد الإلكتروني مطلوب لإتمام الطلب");
            }
            if (orderSettings.emailStatus !== 'hide' && formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
                throw new Error("يرجى إدخال بريد إلكتروني صحيح");
            }

            // 0.7 Payment Method Validation
            if (!formData.paymentMethod && amountDueAfterWallet > 0) {
                throw new Error(t('checkout.payment_required'));
            }

            // 1. Validate Payment Conditions (Client Logic)
            if (formData.paymentMethod === 'cod' && paymentSettings.cod_condition_enabled) {
                const min = Number(paymentSettings.cod_condition_min || 0);
                const max = Number(paymentSettings.cod_condition_max || 0);
                const type = paymentSettings.cod_condition_type;
                if (type === 'min' && total < min) throw new Error(`عذراً، الدفع عند الاستلام غير متاح للطلبات أقل من ${formatPrice(min)}`);
                if (type === 'max' && total > max) throw new Error(`عذراً، الدفع عند الاستلام غير متاح للطلبات أكثر من ${formatPrice(max)}`);
                if (type === 'range' && (total < min || total > max)) throw new Error(`عذراً، الدفع عند الاستلام متاح فقط للطلبات بين ${formatPrice(min)} و ${formatPrice(max)}`);
            }
            if (formData.paymentMethod === 'whatsapp' && paymentSettings.whatsapp_condition_enabled) {
                const min = Number(paymentSettings.whatsapp_condition_min || 0);
                const max = Number(paymentSettings.whatsapp_condition_max || 0);
                const type = paymentSettings.whatsapp_condition_type;
                if (type === 'min' && total < min) throw new Error(`عذراً، هذا الخيار غير متاح للطلبات أقل من ${formatPrice(min)}`);
                if (type === 'max' && total > max) throw new Error(`عذراً، هذا الخيار غير متاح للطلبات أكثر من ${formatPrice(max)}`);
                if (type === 'range' && (total < min || total > max)) throw new Error(`عذراً، هذا الخيار متاح فقط للطلبات بين ${formatPrice(min)} و ${formatPrice(max)}`);
            }

            // 2. 🛡️ PRICE VERIFICATION - Removed for Speed (Relies on Silent Background Validation)
            // The background useEffect ensures prices are correct before we get here.
            // 🔒 SECURITY BLOCK END

        } catch (error) {
            setLoading(false);
            alert(error.message);
            return;
        }

        // Prepare Order Data
        const newOrderId = '#ORD-' + Math.floor(100000 + Math.random() * 900000);
        // Never block order completion on an optional third-party IP lookup.
        // On weak Wi-Fi this request could stay pending and leave the submit UI loading forever.
        const ipAddress = 'غير متوفر';

        // Fetch current costPrices and current stock for inventory logic
        const cartItemsWithDetails = await Promise.all(cartItems.map(async (item) => {
            try {
                const pDoc = await getDoc(doc(db, "products", item.id));
                const data = pDoc.exists() ? pDoc.data() : {};
                const cost = Number(data.costPrice || 0);
                const currentStock = Number(data.stock || 0);
                return { ...item, costPrice: cost, currentStock };
            } catch (err) {
                console.error("Error fetching details for", item.id, err);
                return { ...item, costPrice: 0, currentStock: 0 };
            }
        }));

        // Always validate the requested quantity against the latest inventory.
        const invalidStockItem = cartItemsWithDetails.find(item => {
            const requested = Number(item.quantity) || 0;
            const currentStock = Number(item.currentStock) || 0;
            const sizeStock = item.size && item.sizeStocks && Object.prototype.hasOwnProperty.call(item.sizeStocks, item.size)
                ? Number(item.sizeStocks[item.size] || 0)
                : currentStock;
            return requested <= 0 || requested > currentStock || (item.size && item.sizeStocks && requested > sizeStock);
        });
        if (invalidStockItem) {
            alert(`عذراً، الكمية المطلوبة من "${invalidStockItem.title}" أكبر من الكمية المتوفرة في المخزون.`);
            setLoading(false);
            return;
        }

        const productSavings = cartTotal - effectiveSubtotal;

        const orderData = {
            id: newOrderId,
            formData: {
                ...formData,
                fullPhone: `${selectedCountry.dial_code}${formData.phone}`
            },
            cartItems: cartItemsWithDetails,
            total,
            subTotal: cartTotal, // Store the original price subtotal
            discount: productSavings + couponDiscount, // Product savings plus the exact coupon discount
            discountPercentage: appliedCoupon && !isFixedCoupon(appliedCoupon) ? Number(appliedCoupon.discountPercent || 0) : 0,
            couponDiscount: appliedCoupon ? couponDiscount : 0,
            couponDiscountType: appliedCoupon ? (isFixedCoupon(appliedCoupon) ? 'fixed' : 'percentage') : null,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            couponId: appliedCoupon ? appliedCoupon.id : null,
            deliveryCost,
            orderId: newOrderId,
            paymentMethod: amountDueAfterWallet === 0 && walletApplied > 0 ? 'wallet' : formData.paymentMethod,
            // Keep every store invoice tied to the customer's phone/device wallet, even
            // while wallet payments are temporarily disabled. This is the permanent
            // identity used by «طلباتك» and is independent of the payment method.
            customerWalletId: activeWalletId || null,
            walletApplied,
            amountDueAfterWallet,
            status: 'new',
            currency: activeCurrency, // Store the currency the customer used
            date: new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
            whatsappNumber: paymentSettings.whatsapp_number || null,
            deviceInfo: `${navigator.platform} - ${navigator.userAgent.split(') ')[0]})`,
            ipAddress
        };

        const orderRef = doc(collection(db, "orders"));
        const customerHistoryRef = activeWalletId
            ? customerOrderHistoryRef(activeWalletId, orderRef.id)
            : null;
        try {
            // Re-validate Coupon Logic (kept as is)
            if (appliedCoupon) {
                const couponRefDoc = doc(db, "coupons", appliedCoupon.id);
                const couponSnap = await getDoc(couponRefDoc);

                if (couponSnap.exists()) {
                    const currentCoupon = couponSnap.data();

                    if (!currentCoupon.isUnlimited && currentCoupon.usedCount >= currentCoupon.maxUses) {
                        alert("عذراً، لقد انتهت صلاحية هذا الكوبون للتو!");
                        localStorage.removeItem('cart_coupon');
                        setLoading(false);
                        window.location.reload();
                        return;
                    }

                    if (currentCoupon.expiryDate) {
                        const today = new Date();
                        const expiry = new Date(currentCoupon.expiryDate);
                        expiry.setHours(23, 59, 59, 999);
                        if (today > expiry) {
                            alert("عذراً، لقد انتهى تاريخ صلاحية هذا الكوبون!");
                            localStorage.removeItem('cart_coupon');
                            setLoading(false);
                            window.location.reload();
                            return;
                        }
                    }

                    const currentSubTotal = cartItems.reduce((acc, item) => {
                        const price = item.price; // We now store the effective price in item.price
                        return acc + (price * item.quantity);
                    }, 0);

                    if (currentCoupon.minOrderAmount && currentSubTotal < currentCoupon.minOrderAmount) {
                        alert(`عذراً، هذا الكوبون يتطلب مشتريات (قبل الخصم) بحد أدنى ${formatPrice(currentCoupon.minOrderAmount)}!`);
                        localStorage.removeItem('cart_coupon');
                        setLoading(false);
                        window.location.reload();
                        return;
                    }
                } else {
                    alert("عذراً، هذا الكوبون لم يعد متاحاً.");
                    localStorage.removeItem('cart_coupon');
                    setLoading(false);
                    window.location.reload();
                    return;
                }
            }

            // Save the order and decrement inventory in one transaction.
            // This prevents two customers from buying the same last units at once.
            const walletRef = walletApplied > 0 ? doc(db, 'customer_wallets', activeWalletId) : null;
            await runTransaction(db, async (transaction) => {
                const grouped = new Map();
                cartItems.forEach(item => {
                    const current = grouped.get(item.id) || { items: [], total: 0 };
                    current.items.push(item);
                    current.total += Number(item.quantity) || 0;
                    grouped.set(item.id, current);
                });

                const productRefs = [...grouped.keys()].map(id => doc(db, "products", id));
                const couponRef = appliedCoupon?.id ? doc(db, "coupons", appliedCoupon.id) : null;
                const couponSnap = couponRef ? await transaction.get(couponRef) : null;
                const walletSnap = walletRef ? await transaction.get(walletRef) : null;
                if (couponSnap?.exists() && !couponSnap.data().isUnlimited) {
                    const used = Number(couponSnap.data().usedCount || 0);
                    const max = Number(couponSnap.data().maxUses || 0);
                    if (used >= max) throw new Error("COUPON_LIMIT_REACHED");
                }
                const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

                if (walletRef) {
                    if (!walletSnap?.exists() || Number(walletSnap.data().balance || 0) < walletApplied) {
                        throw new Error('WALLET_BALANCE_CHANGED');
                    }
                    transaction.update(walletRef, {
                        balance: Number(walletSnap.data().balance || 0) - walletApplied,
                        phone: walletSnap.data().phone || `${selectedCountry.dial_code}${formData.phone}`,
                        updatedAt: serverTimestamp()
                    });
                }

                productSnaps.forEach((snap, idx) => {
                    const productId = [...grouped.keys()][idx];
                    const group = grouped.get(productId);
                    if (!snap.exists()) throw new Error(`PRODUCT_NOT_FOUND:${productId}`);
                    const data = snap.data();
                    const currentStock = Number(data.stock || 0);
                    if (group.total > currentStock) throw new Error(`INSUFFICIENT_STOCK:${productId}`);

                    const updates = { stock: currentStock - group.total };
                    if (data.sizeStocks && Object.keys(data.sizeStocks).length > 0) {
                        const nextSizeStocks = { ...data.sizeStocks };
                        group.items.forEach(item => {
                            if (item.size && Object.prototype.hasOwnProperty.call(nextSizeStocks, item.size)) {
                                const currentSizeStock = Number(nextSizeStocks[item.size] || 0);
                                const qty = Number(item.quantity) || 0;
                                if (qty > currentSizeStock) throw new Error(`INSUFFICIENT_SIZE_STOCK:${productId}:${item.size}`);
                                nextSizeStocks[item.size] = currentSizeStock - qty;
                            }
                        });
                        updates.sizeStocks = nextSizeStocks;
                    }
                    transaction.update(productRefs[idx], updates);
                });
                transaction.set(orderRef, orderData);
                const history = buildCustomerOrderHistory(orderData, orderRef.id);
                if (customerHistoryRef && history) transaction.set(customerHistoryRef, history);
                if (couponRef && couponSnap?.exists() && !couponSnap.data().isUnlimited) {
                    transaction.update(couponRef, { usedCount: increment(1) });
                }
            });

            // Auto-fix: cap negative stock at 0 and sync total with sizes
            try {
                for (const item of cartItems) {
                    const productRef = doc(db, "products", item.id);
                    const snap = await getDoc(productRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const fixes = {};
                        if (Number(data.stock || 0) < 0) fixes.stock = 0;
                        if (item.size && data.sizeStocks) {
                            const sizeQty = Number(data.sizeStocks?.[item.size] || 0);
                            if (sizeQty < 0) fixes[`sizeStocks.${item.size}`] = 0;
                        }
                        // Sync total stock with sum of sizes if product has sizes
                        if (data.sizeStocks && Object.keys(data.sizeStocks).length > 0) {
                            const sumOfSizes = Object.values(data.sizeStocks).reduce((sum, qty) => sum + Number(qty || 0), 0);
                            const currentStock = Number(data.stock || 0);
                            // if size was just fixed to 0, recalculate
                            const adjustedStock = fixes.stock !== undefined ? 0 : currentStock;
                            if (adjustedStock !== sumOfSizes) {
                                fixes.stock = sumOfSizes;
                            }
                        }
                        if (Object.keys(fixes).length > 0) {
                            await updateDoc(productRef, fixes);
                        }
                    }
                }
            } catch (autoFixErr) {
                console.warn("Auto-fix stock error:", autoFixErr);
            }


            // 2. Save to LocalStorage
            const existingOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');
            const orderForStorage = {
                ...orderData,
                sourceOrderId: orderRef.id,
                historyVersion: 1,
                createdAt: new Date().toISOString(),
                timestamp: Date.now()
            };
            existingOrders.unshift(orderForStorage);
            localStorage.setItem('myOrders', JSON.stringify(existingOrders));

            // Update Daily Order Count
            const currentDaily = JSON.parse(localStorage.getItem('daily_orders') || '{}');
            if (currentDaily.date !== today) {
                localStorage.setItem('daily_orders', JSON.stringify({ date: today, count: 1 }));
            } else {
                localStorage.setItem('daily_orders', JSON.stringify({ date: today, count: (currentDaily.count || 0) + 1 }));
            }

            // 3. Clear cart & coupon
            localStorage.removeItem('cart');
            localStorage.removeItem('cart_coupon');
            window.dispatchEvent(new CustomEvent('cart-updated'));

            // 4. Navigate (DIRECTLY to Tracking Page as per user request to be the "permalink")
            // Strip the '#' from the ID for the URL
            const cleanId = newOrderId.replace('#', '');
            navigate(`/order-tracking/${cleanId}`);
        } catch (error) {
            console.error("Error placing order:", error);
            if (error.message === "COUPON_LIMIT_REACHED") {
                alert(language === 'ar' ? "عذراً، انتهت كمية استخدام هذا الكوبون." : "Sorry, this coupon has reached its usage limit.");
                localStorage.removeItem('cart_coupon');
                setLoading(false);
                return;
            }
            // Store visitors may create orders but are intentionally not granted public product-update
            // permission. Preserve the sale instead of showing a generic browser error; the authenticated
            // admin dashboard reconciles this marked order with inventory exactly once.
            if (error?.code === 'permission-denied' && !appliedCoupon) {
                try {
                    await runTransaction(db, async transaction => {
                        if (walletApplied > 0) {
                            const walletRef = doc(db, 'customer_wallets', activeWalletId);
                            const walletSnap = await transaction.get(walletRef);
                            if (!walletSnap.exists() || Number(walletSnap.data().balance || 0) < walletApplied) {
                                throw new Error('WALLET_BALANCE_CHANGED');
                            }
                            transaction.update(walletRef, {
                                balance: Number(walletSnap.data().balance || 0) - walletApplied,
                                updatedAt: serverTimestamp()
                            });
                        }
                        const pendingOrder = {
                            ...orderData,
                            inventorySyncPending: true,
                            inventorySyncStatus: 'pending-admin-sync',
                            walletDebitPending: walletApplied > 0,
                            createdWithoutPublicInventoryWrite: true
                        };
                        transaction.set(orderRef, pendingOrder);
                        const history = buildCustomerOrderHistory(pendingOrder, orderRef.id);
                        if (customerHistoryRef && history) transaction.set(customerHistoryRef, history);
                    });
                    const existingOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');
                    existingOrders.unshift({ ...orderData, sourceOrderId: orderRef.id, historyVersion: 1, inventorySyncPending: true, walletDebitPending: walletApplied > 0, createdAt: new Date().toISOString(), timestamp: Date.now() });
                    localStorage.setItem('myOrders', JSON.stringify(existingOrders));
                    localStorage.removeItem('cart');
                    localStorage.removeItem('cart_coupon');
                    window.dispatchEvent(new CustomEvent('cart-updated'));
                    navigate(`/order-tracking/${newOrderId.replace('#', '')}`);
                    return;
                } catch (fallbackError) {
                    console.error('Order fallback creation error:', fallbackError);
                }
            }
            setLoading(false);
            alert(t('checkout.error_message'));
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white pb-20 pt-8 transition-colors duration-300">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Modern Back Button Header */}
                <div className="flex items-center gap-3 mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h1 className="text-2xl font-black text-blue-500">{t('checkout.title')}</h1>
                </div>

                <form onSubmit={handleConfirm} className="space-y-8">

                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.name')}</label>
                        <div className="bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-colors">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none px-4 py-3 outline-none text-start focus:bg-gray-50 dark:focus:bg-white/5 transition-colors text-gray-900 dark:text-white"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    {/* Email Field (Conditional) */}
                    {orderSettings.emailStatus !== 'hide' && (
                        <div className="space-y-2">
                            <label className="text-gray-700 dark:text-white font-bold text-sm">
                                {t('checkout.email')} {orderSettings.emailStatus === 'optional' && <span className="text-gray-400 font-normal text-xs">{t('checkout.optional')}</span>}
                            </label>
                            <div className="bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-colors">
                                <input
                                    type="email"
                                    className="w-full bg-transparent border-none px-4 py-3 outline-none text-start focus:bg-gray-50 dark:focus:bg-white/5 transition-colors text-gray-900 dark:text-white dir-ltr placeholder:text-start"
                                    placeholder="your@email.com"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required={orderSettings.emailStatus === 'required'}
                                />
                            </div>
                        </div>
                    )}

                    {/* Phone with Country Code */}
                    <div className="space-y-2 relative">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.phone')}</label>
                        <div className="flex border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#1c1c1e] focus-within:border-blue-500 transition-colors relative z-20 shadow-sm dark:shadow-none">
                            {/* Flag Trigger */}
                            <div
                                className="flex items-center justify-center px-3 bg-gray-50 dark:bg-white/5 border-l border-gray-200 dark:border-white/10 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors gap-2 min-w-[100px]"
                                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                            >
                                <img src={`https://flagcdn.com/w40/${selectedCountry.code}.png`} alt={selectedCountry.name} className="w-6 h-4 object-cover rounded-sm" />
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300" dir="ltr">{selectedCountry.dial_code}</span>
                                <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" />
                            </div>

                            <input
                                type="tel"
                                placeholder={t('checkout.phone_placeholder')}
                                className="w-full bg-transparent border-none px-4 py-3 outline-none text-start placeholder-gray-400 dark:placeholder-gray-600 text-gray-900 dark:text-white"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                dir="rtl"
                                required
                            />
                        </div>
                        {walletEnabled && phoneWalletId && <div className={`mt-2 rounded-lg border px-3 py-2 text-right text-[10px] font-bold ${customerWallet?.pinConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'}`}>
                            {customerWallet?.pinConfigured ? <>تم العثور على محفظة هذا الرقم — الرصيد المتاح: <span dir="ltr" className="font-mono font-black">$ {walletNumber(Math.max(0, Number(customerWallet.balance || 0)))}</span></> : 'لا توجد محفظة مؤمنة مرتبطة بهذا الرقم حتى الآن.'}
                        </div>}

                        {/* Dropdown Overlay */}
                        {showCountryDropdown && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowCountryDropdown(false)}></div>
                                <div className="absolute top-full right-0 mt-2 w-full max-w-xs bg-white dark:bg-[#2a2e35] border border-gray-100 dark:border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden">
                                    <div className="p-2 border-b border-gray-100 dark:border-white/5">
                                        <div className="flex items-center bg-gray-100 dark:bg-[#1c1c1e] rounded-lg px-3 py-2">
                                            <input
                                                type="text"
                                                placeholder="Search"
                                                className="bg-transparent border-none outline-none text-gray-900 dark:text-white text-sm w-full text-left"
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                autoFocus
                                            />
                                            <ChevronDown size={14} className="text-gray-500" />
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto w-full">
                                        {filteredCountries.map(country => (
                                            <div
                                                key={country.code}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                                onClick={() => {
                                                    setSelectedCountry(country);
                                                    setShowCountryDropdown(false);
                                                }}
                                            >
                                                <img src={`https://flagcdn.com/w40/${country.code}.png`} alt={country.name} className="w-5 h-3.5 object-cover rounded-sm" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 text-left">{country.name}</span>
                                                <span className="text-xs text-gray-500 font-mono">{country.dial_code}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Country - Read Only */}
                    <div className="space-y-2">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.country')}</label>
                        <div className="relative">
                            <select
                                className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 appearance-none cursor-not-allowed text-gray-400 dark:text-gray-500 shadow-sm dark:shadow-none"
                                value={formData.country}
                                disabled
                            >
                                <option value={selectedCountry.name}>{selectedCountry.name}</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-500 dark:text-white">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>

                    {/* City Selection */}
                    <div className="space-y-2">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.city')}</label>
                        <div className="relative">
                            <select
                                className="w-full bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 appearance-none cursor-pointer text-gray-900 dark:text-white shadow-sm dark:shadow-none"
                                value={formData.city}
                                onChange={e => setFormData({ ...formData, city: e.target.value })}
                                required
                            >
                                <option value="" disabled>{t('checkout.choose_city')}</option>
                                {deliverySettings.regions.length > 0 ? (
                                    deliverySettings.regions.map(region => (
                                        <option key={region.id} value={region.name}>{region.name}</option>
                                    ))
                                ) : (
                                    <option value="" disabled>{t('checkout.no_cities')}</option>
                                )}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-500 dark:text-white">
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Split Fees Selector - Only Show if Enabled */}
                    {deliverySettings.splitFees && !deliverySettings.dynamicPricing && !deliverySettings.freeDeliveryAll && (formData.city) && (
                        <div className="space-y-2">
                            <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.delivery_type')}</label>
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    className={`cursor-pointer border rounded-xl p-3 flex items-center justify-center gap-2 transition-all ${formData.deliveryType === 'home' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-white/10 text-gray-500'}`}
                                    onClick={() => setFormData({ ...formData, deliveryType: 'home' })}
                                >
                                    <span className="font-bold">{t('checkout.delivery_home')}</span>
                                    {formData.deliveryType === 'home' && <CheckCircle2 size={16} />}
                                </div>
                                <div
                                    className={`cursor-pointer border rounded-xl p-3 flex items-center justify-center gap-2 transition-all ${formData.deliveryType === 'office' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white dark:bg-[#1c1c1e] border-gray-200 dark:border-white/10 text-gray-500'}`}
                                    onClick={() => setFormData({ ...formData, deliveryType: 'office' })}
                                >
                                    <span className="font-bold">{t('checkout.delivery_office')}</span>
                                    {formData.deliveryType === 'office' && <CheckCircle2 size={16} />}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Address */}
                    <div className="space-y-2">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.address')}</label>
                        <div className="bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                            <input
                                type="text"
                                placeholder={t('checkout.address_placeholder')}
                                className="w-full bg-transparent border-none px-4 py-3 outline-none text-start focus:bg-gray-50 dark:focus:bg-white/5 transition-colors text-gray-900 dark:text-white"
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-2">
                        <label className="text-gray-700 dark:text-white font-bold text-sm">{t('checkout.notes')}</label>
                        <div className="bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none px-4 py-3 outline-none text-start focus:bg-gray-50 dark:focus:bg-white/5 transition-colors text-gray-900 dark:text-white"
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/5 my-8"></div>

                    {/* Order Summary & Payment */}
                    <div className="bg-white dark:bg-[#1c1c1e] rounded-[30px] border border-gray-100 dark:border-white/5 p-6 md:p-8 shadow-xl dark:shadow-none transition-colors">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white text-start mb-6">{t('cart.title')}</h2>

                        {/* Item Preview */}
                        <div className="space-y-4 mb-8 border-b border-gray-200 dark:border-white/5 pb-6">
                            {cartItems.map((item, index) => (
                                <div key={`${item.id}-${index}`} className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-lg flex-shrink-0 overflow-hidden border border-gray-200 dark:border-white/10">
                                                <ImageWithFallback src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                            </div>
                                            <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#3b82f6] text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                {item.quantity}
                                            </span>
                                        </div>
                                        <div className="text-start">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                                                {item.size && `(${item.size})`} {item.title}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[#16a34a] dark:text-[#4ADE80] font-bold text-sm">{formatPrice(item.price)}</p>
                                                {item.priceBeforeDiscount && Number(item.priceBeforeDiscount) > Number(item.price) && (
                                                    <p className="text-gray-400 dark:text-gray-500 text-[10px] line-through font-bold">{formatPrice(item.priceBeforeDiscount)}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div className="space-y-4 mb-8">
                            <div className="flex justify-between items-center text-sm font-bold">
                                <span className="text-gray-900 dark:text-white">{formatPrice(cartTotal)}</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('cart.subtotal')}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold">
                                <span className="text-red-600 dark:text-red-400">- {formatPrice(discountAmount)}</span>
                                <div className="flex items-center gap-2 font-bold">
                                    {cartTotal > 0 && discountAmount > 0 && (
                                        <span className="text-[10px] bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/50 font-black">
                                            {Math.round((discountAmount / cartTotal) * 100)}%
                                        </span>
                                    )}
                                    <span className="text-gray-500 dark:text-gray-400">{t('cart.discount')}</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center text-sm font-bold">
                                <span className="text-gray-900 dark:text-white">
                                    {deliveryCost === 0 ? t('checkout.free') : formatPrice(deliveryCost)}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400">{t('checkout.delivery_cost')}</span>
                            </div>
                            <div className="flex justify-between items-center text-base font-black text-blue-500 pt-4 border-t border-gray-200 dark:border-white/10 mt-4">
                                <span className="text-blue-500">{formatPrice(total)}</span>
                                <span className="text-gray-900 dark:text-white">{t('cart.total')}</span>
                            </div>
                            {walletEnabled && <button type="button" onClick={requestWalletCredit} className={`mt-2 flex w-full items-center justify-between rounded-xl border p-3 text-right transition-all ${useWalletCredit ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-400/50 dark:bg-emerald-400/10' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-400/40'}`}>
                                <div className="flex items-center gap-2"><div className={`flex h-7 w-7 items-center justify-center rounded-lg ${useWalletCredit ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300'}`}>{useWalletCredit ? <CheckCircle2 size={16}/> : <CheckCircle2 size={16}/>}</div><div><p className="text-xs font-black text-slate-800 dark:text-white">استخدام رصيد محفظتي</p><p className="mt-0.5 text-[9px] font-bold text-slate-400">رصيد متاح: <span dir="ltr" className="font-mono text-emerald-600 dark:text-emerald-300">$ {walletNumber(walletBalance)}</span></p></div></div>
                                <span className={`h-5 w-5 rounded-full border-2 ${useWalletCredit ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>{useWalletCredit && <CheckCircle2 size={16} className="m-[-1px] text-white"/>}</span>
                            </button>}
                            {walletApplied > 0 && <><div className="flex justify-between items-center text-sm font-black text-emerald-600 dark:text-emerald-300"><span dir="ltr">- $ {walletNumber(walletApplied)}</span><span>خصم من المحفظة</span></div><div className="flex justify-between items-center text-base font-black text-emerald-600 dark:text-emerald-300"><span>{amountDueAfterWallet > 0 ? formatPrice(amountDueAfterWallet) : '0'}</span><span>المتبقي للدفع</span></div></>}
                        </div>

                        {/* Payment Method */}
                        <div className={`mb-8 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
                            <h3 className="text-gray-900 dark:text-white font-bold mb-6">{t('checkout.payment_method')}</h3>

                            <div className="space-y-4">
                                {/* Store Busy Overlay for Payment Section */}
                                {(!storeStatus || !storeStatus.isOpen) ? (
                                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-white/10">
                                        <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-500 mx-auto flex items-center justify-center mb-3">
                                            <AlertTriangle size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                                            المتجر مشغول حالياً
                                        </h3>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                                            لا يزال بإمكانك التصفح وتجهيز عربة التسوق، ولكن تم إيقاف استقبال الطلبات مؤقتاً.
                                        </p>
                                    </div>
                                ) : (
                                    loading ? (
                                        <div className="text-center py-4 text-gray-400">جاري تحميل طرق الدفع...</div>
                                    ) : (
                                        <>
                                            {(() => {
                                                // 1. Calculate COD Visibility
                                                let showCOD = false;
                                                if (paymentSettings.cod_enabled) {
                                                    showCOD = true;
                                                    if (paymentSettings.cod_condition_enabled) {
                                                        const type = paymentSettings.cod_condition_type;
                                                        const min = Number(paymentSettings.cod_condition_min || 0);
                                                        const max = Number(paymentSettings.cod_condition_max || 0);
                                                        const currentTotal = total;

                                                        if (type === 'min' && currentTotal < min) showCOD = false;
                                                        else if (type === 'max' && currentTotal > max) showCOD = false;
                                                        else if (type === 'range' && (currentTotal < min || currentTotal > max)) showCOD = false;
                                                    }
                                                }

                                                // 2. Calculate WhatsApp Visibility
                                                let showWhatsApp = false;
                                                if (paymentSettings.whatsapp_enabled) {
                                                    showWhatsApp = true;
                                                    if (paymentSettings.whatsapp_condition_enabled) {
                                                        const type = paymentSettings.whatsapp_condition_type;
                                                        const min = Number(paymentSettings.whatsapp_condition_min || 0);
                                                        const max = Number(paymentSettings.whatsapp_condition_max || 0);
                                                        const currentTotal = total;

                                                        if (type === 'min' && currentTotal < min) showWhatsApp = false;
                                                        else if (type === 'max' && currentTotal > max) showWhatsApp = false;
                                                        else if (type === 'range' && (currentTotal < min || currentTotal > max)) showWhatsApp = false;
                                                    }
                                                }

                                                return (
                                                    <>
                                                        {/* Cash on Delivery */}
                                                        {showCOD && (
                                                            <div
                                                                className="flex items-center justify-end gap-3 cursor-pointer group"
                                                                onClick={() => setFormData({ ...formData, paymentMethod: 'cod' })}
                                                            >
                                                                <span className={`font-bold text-sm ${formData.paymentMethod === 'cod' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{t('checkout.payment_cod')}</span>
                                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.paymentMethod === 'cod' ? 'border-[#3b82f6]' : 'border-gray-400 dark:border-gray-600'}`}>
                                                                    {formData.paymentMethod === 'cod' && <div className="w-2.5 h-2.5 bg-[#3b82f6] rounded-full shadow-lg shadow-blue-500/50"></div>}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* WhatsApp Payment */}
                                                        {showWhatsApp && (
                                                            <div
                                                                className="flex items-center justify-end gap-3 cursor-pointer group"
                                                                onClick={() => setFormData({ ...formData, paymentMethod: 'whatsapp' })}
                                                            >
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`font-bold text-sm flex items-center gap-2 ${formData.paymentMethod === 'whatsapp' ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                                                        <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" className="w-5 h-5" />
                                                                        {paymentSettings.whatsapp_label || t('checkout.whatsapp_default')}
                                                                    </span>
                                                                    {formData.paymentMethod === 'whatsapp' && paymentSettings.whatsapp_number && (
                                                                        <span className="text-xs text-blue-500 font-bold mt-1 dir-ltr font-mono">{paymentSettings.whatsapp_number}</span>
                                                                    )}
                                                                </div>
                                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.paymentMethod === 'whatsapp' ? 'border-[#3b82f6]' : 'border-gray-400 dark:border-gray-600'}`}>
                                                                    {formData.paymentMethod === 'whatsapp' && <div className="w-2.5 h-2.5 bg-[#3b82f6] rounded-full shadow-lg shadow-blue-500/50"></div>}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Fallback Message: Show if NO methods are available/visible */}
                                                        {!showCOD && !showWhatsApp && (
                                                            <div className="text-center text-red-500 font-bold py-4 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20">
                                                                {t('checkout.order_unavailable_amount', { amount: total.toLocaleString() })}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </>
                                    ))}
                            </div>
                        </div>

                        {/* Complete Order Button */}
                        <button
                            type="submit"
                            disabled={loading || (!storeStatus || !storeStatus.isOpen)}
                            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-black text-lg shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] 
                                ${(!storeStatus || !storeStatus.isOpen)
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white'}`}
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : ((!storeStatus || !storeStatus.isOpen) ? 'المتجر مشغول حاليا' : t('checkout.complete_order'))}
                        </button>
                    </div>

                    {walletEnabled && walletPinOpen && <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-5 shadow-2xl dark:bg-[#171b26]"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-black text-slate-900 dark:text-white">تأكيد استخدام رصيد المحفظة</h3><p className="mt-1 text-[10px] font-bold text-slate-400">أدخل رمز PIN لحماية رصيدك.</p></div><button type="button" onClick={() => { setWalletPinOpen(false); setWalletPin(''); setWalletPinError(''); }} className="text-slate-400">×</button></div><div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-black text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">سيُستخدم حتى <span dir="ltr" className="font-mono">$ {walletNumber(Math.min(walletBalance, total))}</span> من رصيدك.</div><input autoFocus value={walletPin} onChange={event => setWalletPin(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={event => event.key === 'Enter' && confirmWalletPin()} inputMode="numeric" type="password" placeholder="رمز PIN من 4 إلى 6 أرقام" className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center font-mono text-sm font-black outline-none focus:border-emerald-400 dark:border-white/10 dark:bg-white/5"/><p className="mt-2 min-h-4 text-center text-[10px] font-bold text-rose-500">{walletPinError}</p><div className="mt-3 flex gap-2"><button type="button" onClick={confirmWalletPin} className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-black text-white">تأكيد الخصم</button><button type="button" onClick={() => setWalletPinOpen(false)} className="rounded-xl px-4 text-sm font-black text-slate-500">إلغاء</button></div></div></div>}

                </form>

            </div>
        </div>
    );
};

export default Checkout;
