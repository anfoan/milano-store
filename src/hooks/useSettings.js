import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const CACHE_KEYS = {
    INTERFACE: 'settings_interface',
    GENERAL: 'settings_general',
    IMAGES: 'settings_images',
    CART: 'settings_cart',
    SOCIAL: 'settings_social'
};

const DEFAULTS = {
    interfaceSettings: {
        lastSeen: true,
        hideOutOfStock: false,
        hideSKU: false,
        hideExtraOptions: false,
        showCountryFlag: true,
        showOffersSection: false,
        showCategories: true,
        productSharing: true,
        contactForm: true
    },
    generalSettings: { storeName: '', currency: 'YER', countryFlag: 'ye' },
    imageSettings: { profileImage: '', coverImage: '', logoImage: '' },
    cartSettings: {
        minOrderAmount: '', enableMinAmount: false,
        maxOrderAmount: '', enableMaxAmount: false,
        maxProductCount: '', enableMaxCount: false
    },
    socialLinks: {}
};

const getCached = (key, defaultValue) => {
    try {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : defaultValue;
    } catch {
        return defaultValue;
    }
};

let sharedSettings = {
    interfaceSettings: getCached(CACHE_KEYS.INTERFACE, DEFAULTS.interfaceSettings),
    generalSettings: getCached(CACHE_KEYS.GENERAL, DEFAULTS.generalSettings),
    imageSettings: getCached(CACHE_KEYS.IMAGES, DEFAULTS.imageSettings),
    cartSettings: getCached(CACHE_KEYS.CART, DEFAULTS.cartSettings),
    socialLinks: getCached(CACHE_KEYS.SOCIAL, DEFAULTS.socialLinks)
};

const subscribers = new Set();
let listenersStarted = false;

const notify = () => subscribers.forEach(setState => setState({ ...sharedSettings }));

const updateSetting = (key, data, cacheKey) => {
    if (!data) return;
    sharedSettings = {
        ...sharedSettings,
        [key]: { ...sharedSettings[key], ...data }
    };
    try { localStorage.setItem(cacheKey, JSON.stringify(sharedSettings[key])); } catch { /* cache is optional */ }
    notify();
};

const startSharedListeners = () => {
    if (listenersStarted) return;
    listenersStarted = true;
    onSnapshot(doc(db, 'settings', 'interface'), snapshot => updateSetting('interfaceSettings', snapshot.exists() ? snapshot.data() : null, CACHE_KEYS.INTERFACE), error => console.error('Interface settings error:', error));
    onSnapshot(doc(db, 'settings', 'general'), snapshot => updateSetting('generalSettings', snapshot.exists() ? snapshot.data() : null, CACHE_KEYS.GENERAL), error => console.error('General settings error:', error));
    onSnapshot(doc(db, 'settings', 'images'), snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        updateSetting('imageSettings', data, CACHE_KEYS.IMAGES);
        if (data.invoiceLogo) updateSetting('generalSettings', { invoiceLogo: data.invoiceLogo }, CACHE_KEYS.GENERAL);
    }, error => console.error('Image settings error:', error));
    onSnapshot(doc(db, 'settings', 'cart'), snapshot => updateSetting('cartSettings', snapshot.exists() ? snapshot.data() : null, CACHE_KEYS.CART), error => console.error('Cart settings error:', error));
    onSnapshot(doc(db, 'settings', 'social_links'), snapshot => {
        if (!snapshot.exists()) return;
        sharedSettings = { ...sharedSettings, socialLinks: snapshot.data() };
        try { localStorage.setItem(CACHE_KEYS.SOCIAL, JSON.stringify(snapshot.data())); } catch { /* cache is optional */ }
        notify();
    }, error => console.error('Social links error:', error));
};

export const useSettings = () => {
    const [settings, setSettings] = useState(() => ({ ...sharedSettings }));

    useEffect(() => {
        subscribers.add(setSettings);
        startSharedListeners();
        return () => subscribers.delete(setSettings);
    }, []);

    const getStoreUrl = () => {
        const url = settings.generalSettings?.storeUrl || window.location.origin;
        return url.replace(/\/$/, '');
    };

    const getOrderedSocialLinks = () => {
        const socialLinks = settings.socialLinks;
        if (!socialLinks) return [];
        const order = socialLinks.linkOrder || ['whatsapp', 'instagram', 'tiktok', 'facebook', 'snapchat', 'youtube', 'twitter', 'googlemap'];
        const iconMap = {
            facebook: 'https://b3na.com/Store-assets/img/Facebook.webp',
            instagram: 'https://b3na.com/Store-assets/img/Instagram.webp',
            tiktok: 'https://b3na.com/Store-assets/img/Tiktok.webp',
            whatsapp: 'https://b3na.com/Store-assets/img/Whatsapp.webp',
            snapchat: 'https://b3na.com/Store-assets/img/Snapchat.webp',
            youtube: 'https://b3na.com/Store-assets/img/Youtube.webp',
            twitter: '/twitter.png',
            googlemap: 'https://b3na.com/Store-assets/img/GoogleMap.webp'
        };
        const labelMap = {
            facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp',
            snapchat: 'Snapchat', youtube: 'YouTube', twitter: 'Twitter', googlemap: 'Google Map'
        };
        return order.filter(id => socialLinks[id]).map(id => ({
            id,
            name: labelMap[id],
            img: iconMap[id],
            link: socialLinks[id],
            size: (id === 'googlemap' || id === 'twitter') ? '38px' : '42px'
        }));
    };

    return {
        interfaceSettings: settings.interfaceSettings,
        generalSettings: settings.generalSettings,
        imageSettings: settings.imageSettings,
        cartSettings: settings.cartSettings,
        socialLinks: settings.socialLinks,
        orderedSocialLinks: getOrderedSocialLinks(),
        loading: false,
        storeUrl: getStoreUrl()
    };
};
