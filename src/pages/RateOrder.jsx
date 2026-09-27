import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Star, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const RateOrder = () => {
    const { t, direction } = useLanguage();
    const navigate = useNavigate();
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState('');
    const [name, setName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Helper to get text based on rating
    const getRatingText = (r) => {
        if (r === 1) return t('rate.very_bad');
        if (r === 2) return t('rate.bad');
        if (r === 3) return t('rate.average');
        if (r === 4) return t('rate.good');
        if (r === 5) return t('rate.excellent');
        return t('rate.click_to_rate');
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            alert(t('rate.alert_name'));
            return;
        }
        if (rating === 0) {
            alert(t('rate.alert_stars'));
            return;
        }
        if (!comment.trim()) {
            alert(t('rate.alert_comment'));
            return;
        }

        setSubmitting(true);
        try {
            const statusText = getRatingText(rating);
            const reviewData = {
                name: name.trim(),
                rating: rating,
                message: comment.trim(),
                status: statusText,
                createdAt: new Date().toISOString(), // Use ISO string to match orders
                time: "جديد",
            };

            await addDoc(collection(db, "reviews"), reviewData);

            // Success
            setTimeout(() => {
                navigate('/reviews');
            }, 800);
        } catch (error) {
            console.error("DEBUG: Review Submission Failed:", error);
            alert(`${t('rate.alert_error')} (${error.message || 'Unknown Error'})`);
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#050505] flex items-center justify-center p-4 font-['Cairo'] transition-colors duration-300">

            {/* Main Card Container - Larger Max Width */}
            <div className="w-full max-w-2xl bg-white dark:bg-[#1c1c1e] rounded-[32px] overflow-hidden shadow-xl dark:shadow-2xl border border-gray-100 dark:border-white/5 relative transition-colors duration-300">

                {/* Modern Back Button Header (Absolute) */}
                <button
                    onClick={() => navigate(-1)}
                    className={`absolute top-6 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-sm border border-white/5 ${direction === 'rtl' ? 'right-6' : 'left-6'}`}
                >
                    <ArrowRight size={20} className="flip-rtl" />
                </button>

                {/* 1. Header Section (Blue Background) */}
                <div className="bg-[#4361ee] h-56 flex flex-col items-center justify-center relative pt-4">
                    {/* Logo Circle */}
                    <div className="w-32 h-32 bg-white dark:bg-black rounded-full border-[6px] border-white dark:border-[#1c1c1e] flex items-center justify-center overflow-hidden shadow-2xl mb-3 z-10 transform translate-y-6">
                        <img src="/logo.jpg" alt="Milano" className="w-full h-full object-contain" />
                    </div>
                </div>

                {/* 2. Body Section */}
                <div className="p-8 pt-16 pb-10 bg-white dark:bg-[#1c1c1e] transition-colors duration-300">

                    <div className="text-center mb-10">
                        <h2 className="text-gray-900 dark:text-white font-black text-3xl tracking-wide mb-1">{t('rate.store_title')}</h2>
                    </div>

                    {/* Stars Container */}
                    <div className="flex justify-center gap-4 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => {
                            const isSelected = star <= (hover || rating);
                            return (
                                <button
                                    key={star}
                                    type="button"
                                    className="transition-transform hover:scale-110 focus:outline-none"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHover(star)}
                                    onMouseLeave={() => setHover(rating)}
                                >
                                    <Star
                                        size={48}
                                        fill={isSelected ? "#fbbf24" : "transparent"} // Yellow-400 fill if selected
                                        className={`transition-colors duration-200 ${isSelected
                                            ? "text-yellow-400"
                                            : "text-gray-300 dark:text-gray-500"
                                            }`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {/* Dynamic Status Text */}
                    <p className={`text-center mb-10 font-bold text-xl transition-all duration-300 ${rating === 0 ? "text-[#4361ee]" : "text-gray-900 dark:text-white"}`}>
                        {getRatingText(hover || rating)}
                    </p>

                    {/* Name Input */}
                    <div className="mb-6 space-y-2">
                        <div className="flex justify-between items-end mb-2 px-1">
                            <label className="text-gray-600 dark:text-gray-300 font-bold text-base">{t('checkout.name')}</label>
                        </div>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white rounded-xl p-5 h-16 focus:outline-none focus:ring-1 focus:ring-[#4361ee] transition-all border border-gray-200 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-600 text-start font-medium text-lg"
                            placeholder={t('rate.name_placeholder')}
                        />
                    </div>

                    {/* Textarea */}
                    <div className="mb-8 space-y-2">
                        <div className="flex justify-between items-end mb-2 px-1">
                            <label className="text-gray-600 dark:text-gray-300 font-bold text-base">{t('rate.notes_label')}</label>
                        </div>
                        <div className="relative">
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                maxLength={350}
                                className="w-full bg-gray-50 dark:bg-[#111317] text-gray-900 dark:text-white rounded-xl p-5 h-40 resize-none focus:outline-none focus:ring-1 focus:ring-[#4361ee] transition-all border border-gray-200 dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-600 text-start font-medium text-lg leading-relaxed"
                            />
                            <span className={`absolute bottom-4 text-xs text-gray-400 dark:text-gray-500 font-mono ${direction === 'rtl' ? 'left-4' : 'right-4'}`}>
                                {comment.length}/350
                            </span>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={`w-full py-5 rounded-2xl font-black text-2xl text-white shadow-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2
                            ${submitting
                                ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
                                : "bg-[#4361ee] hover:bg-[#3651d4] shadow-blue-500/20 hover:shadow-blue-500/40"
                            }`}
                    >
                        {submitting ? (
                            <span>{t('rate.submitting')}</span>
                        ) : (
                            <>
                                <span>{t('rate.submit')}</span>
                            </>
                        )}
                    </button>

                </div>
            </div>
        </div>
    );
};

export default RateOrder;
