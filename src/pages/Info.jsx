import React, { useState, useEffect } from 'react';
import { Star, Loader2, ArrowRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const Info = () => {
    const { t, direction } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        general: {},
        social: {},
        images: {}
    });

    useEffect(() => {
        const fetchAllSettings = async () => {
            try {
                const [generalSnap, socialSnap, imagesSnap] = await Promise.all([
                    getDoc(doc(db, "settings", "general")),
                    getDoc(doc(db, "settings", "social_links")),
                    getDoc(doc(db, "settings", "images"))
                ]);

                setSettings({
                    general: generalSnap.exists() ? generalSnap.data() : {},
                    social: socialSnap.exists() ? socialSnap.data() : {},
                    images: imagesSnap.exists() ? imagesSnap.data() : {}
                });
            } catch (error) {
                console.error("Error fetching info data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAllSettings();
    }, []);

    const { general, social, images } = settings;

    if (loading) {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#111317]">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full min-h-screen bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white font-['Cairo'] pb-20 transition-colors duration-300" dir={direction}>
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-8">
                {/* Page Title with Back Button */}
                <div className="flex items-center gap-3 mb-10">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h1 className="text-3xl font-black text-cyan-500">
                        {t('info.title')}
                    </h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Main Info Section (Right Side) */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-[#1c1c1e] rounded-[32px] border border-gray-100 dark:border-white/5 p-8 shadow-xl transition-colors">
                            <div className="space-y-10">
                                {/* Location */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider">{t('info.location_label')}</h3>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white leading-relaxed">
                                        {general.storeAddress || t('info.location_value')}
                                    </p>
                                </div>

                                {/* Phone Number */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider">{t('info.phone_label')}</h3>
                                    <p className="text-2xl font-black text-cyan-500" dir="ltr">
                                        <a href={`tel:${general.countryCode}${general.phoneNumber}`} className="hover:underline flex items-center gap-2">
                                            <span>{general.countryCode}</span>
                                            <span>{general.phoneNumber}</span>
                                        </a>
                                    </p>
                                </div>

                                {/* Google Map */}
                                {general.googleMapLink && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider">{t('info.map_label')}</h3>
                                        <p className="text-lg font-bold">
                                            <a
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                href={general.googleMapLink}
                                                className="inline-flex items-center gap-2 text-cyan-500 hover:text-cyan-400 transition-colors"
                                            >
                                                <span className="underline underline-offset-4">{t('info.click_here')}</span>
                                            </a>
                                        </p>
                                    </div>
                                )}

                                {/* Description */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider">{t('info.desc_label')}</h3>
                                    <p className="text-lg font-bold text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                        {(general.storeDescription && general.storeDescription.includes('نايك'))
                                            ? general.storeDescription
                                            : t('info.desc_value')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar / Profile Section (Left Side) */}
                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-[#1c1c1e] rounded-[32px] border border-gray-100 dark:border-white/5 p-8 shadow-xl text-center transition-colors">

                            {/* Profile Header */}
                            <div className="relative group mb-6 flex justify-center">
                                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity w-32 h-32 mx-auto"></div>
                                <div className="relative w-32 h-32 rounded-full p-1 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg mx-auto">
                                    <div className="w-full h-full rounded-full border-4 border-white dark:border-[#1c1c1e] overflow-hidden bg-gray-100">
                                        <img
                                            src={images.profileImage || "/logo.jpg"}
                                            alt="Logo"
                                            className="w-full h-full object-cover"
                                            onError={(e) => e.target.src = "/logo.jpg"}
                                        />
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 leading-snug">
                                {t('rate.store_title')}
                            </h3>

                            {/* Stars */}
                            <div className="flex justify-center gap-1 text-yellow-500 mb-8">
                                {[1, 2, 3, 4, 5].map(i => <Star key={i} size={20} fill="currentColor" strokeWidth={0} />)}
                            </div>

                            {/* Social Media Widget */}
                            <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-white/5">
                                <h4 className="text-sm font-black text-gray-400 uppercase mb-4">{t('contact.social_media')}</h4>
                                <div className="grid grid-cols-1 gap-3" dir="ltr">
                                    {(social?.linkOrder || ['whatsapp', 'instagram', 'tiktok', 'facebook', 'snapchat', 'youtube', 'twitter', 'googlemap'])
                                        .filter(id => social[id]) // Only show if link exists
                                        .map(id => {
                                            const iconMap = {
                                                facebook: "https://b3na.com/Store-assets/img/Facebook.webp",
                                                instagram: "https://b3na.com/Store-assets/img/Instagram.webp",
                                                tiktok: "https://b3na.com/Store-assets/img/Tiktok.webp",
                                                whatsapp: "https://b3na.com/Store-assets/img/Whatsapp.webp",
                                                snapchat: "https://b3na.com/Store-assets/img/Snapchat.webp",
                                                youtube: "https://b3na.com/Store-assets/img/Youtube.webp",
                                                twitter: "/twitter.png",
                                                googlemap: "https://b3na.com/Store-assets/img/GoogleMap.webp"
                                            };
                                            const labelMap = {
                                                facebook: "Facebook",
                                                instagram: "Instagram",
                                                tiktok: "TikTok",
                                                whatsapp: "WhatsApp",
                                                snapchat: "Snapchat",
                                                youtube: "YouTube",
                                                twitter: "Twitter",
                                                googlemap: "Google Map"
                                            };
                                            const hoverColors = {
                                                facebook: "hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all group",
                                                instagram: "hover:bg-pink-50 dark:hover:bg-pink-500/10 transition-all group",
                                                tiktok: "hover:bg-gray-100 dark:hover:bg-white/10 transition-all group",
                                                whatsapp: "hover:bg-green-50 dark:hover:bg-green-500/10 transition-all group",
                                                snapchat: "hover:bg-yellow-50 dark:hover:bg-yellow-500/10 transition-all group",
                                                youtube: "hover:bg-red-50 dark:hover:bg-red-500/10 transition-all group",
                                                twitter: "hover:bg-gray-100 dark:hover:bg-white/10 transition-all group",
                                                googlemap: "hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all group"
                                            };
                                            const textColors = {
                                                facebook: "group-hover:text-blue-600 dark:group-hover:text-blue-400",
                                                instagram: "group-hover:text-pink-600 dark:group-hover:text-pink-400",
                                                tiktok: "group-hover:text-black dark:group-hover:text-white",
                                                whatsapp: "group-hover:text-green-600 dark:group-hover:text-green-400",
                                                snapchat: "group-hover:text-yellow-600 dark:group-hover:text-yellow-400",
                                                youtube: "group-hover:text-red-600 dark:group-hover:text-red-400",
                                                twitter: "group-hover:text-black dark:group-hover:text-white",
                                                googlemap: "group-hover:text-blue-600 dark:group-hover:text-blue-400"
                                            };

                                            return (
                                                <a 
                                                    key={id} 
                                                    href={social[id]} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className={`flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-white/5 ${hoverColors[id]}`}
                                                >
                                                    <img src={iconMap[id]} alt={labelMap[id]} className="w-6 h-6" />
                                                    <span className={`font-bold text-gray-700 dark:text-gray-300 ${textColors[id]}`}>{labelMap[id]}</span>
                                                </a>
                                            );
                                        })
                                    }
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Info;
