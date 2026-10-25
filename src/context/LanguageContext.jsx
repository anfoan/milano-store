import React, { createContext, useState, useContext, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { translations } from '../utils/translations';
import { safeLocalGet, safeLocalSet } from '../lib/safeStorage';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const localOverride = safeLocalGet('storeLanguageOverride');
    const initialLanguage = localOverride === 'en' || localOverride === 'ar' ? localOverride : 'ar';
    const [language, setLanguage] = useState(initialLanguage);
    const [direction, setDirection] = useState(initialLanguage === 'ar' ? 'rtl' : 'ltr');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Real-time listener for language settings
        const unsubscribe = onSnapshot(doc(db, "settings", "language"), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                const currentOverride = safeLocalGet('storeLanguageOverride');
                const newLang = currentOverride === 'en' || currentOverride === 'ar' ? currentOverride : 'ar';
                setLanguage(newLang);
                setDirection(newLang === 'ar' ? 'rtl' : 'ltr');
                safeLocalSet('storeLanguage', newLang);

                // Update Document Attributes
                document.documentElement.lang = newLang;
                document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
                document.body.lang = newLang;
                document.body.dir = newLang === 'ar' ? 'rtl' : 'ltr';
            } else {
                const fallbackLang = initialLanguage;
                setLanguage(fallbackLang);
                setDirection(fallbackLang === 'ar' ? 'rtl' : 'ltr');
                document.documentElement.lang = fallbackLang;
                document.documentElement.dir = fallbackLang === 'ar' ? 'rtl' : 'ltr';
                document.body.lang = fallbackLang;
                document.body.dir = fallbackLang === 'ar' ? 'rtl' : 'ltr';
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching language settings:", error);
            // Keep the last selected language if the network is temporarily unavailable.
            const fallbackLang = initialLanguage;
            setLanguage(fallbackLang);
            setDirection(fallbackLang === 'ar' ? 'rtl' : 'ltr');
            document.documentElement.lang = fallbackLang;
            document.documentElement.dir = fallbackLang === 'ar' ? 'rtl' : 'ltr';
            document.body.lang = fallbackLang;
            document.body.dir = fallbackLang === 'ar' ? 'rtl' : 'ltr';
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const t = (key) => {
        const langDict = translations[language] || translations['ar'];
        return langDict[key] || key;
    };

    const setStoreLanguage = (nextLanguage) => {
        const next = nextLanguage === 'en' ? 'en' : 'ar';
        safeLocalSet('storeLanguageOverride', next);
        safeLocalSet('storeLanguage', next);
        setLanguage(next);
        setDirection(next === 'ar' ? 'rtl' : 'ltr');
        document.documentElement.lang = next;
        document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
        document.body.lang = next;
        document.body.dir = next === 'ar' ? 'rtl' : 'ltr';
    };

    const value = {
        language,
        direction,
        t,
        setStoreLanguage,
        loading
    };

    return (
        <LanguageContext.Provider value={value}>
            {!loading && children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
