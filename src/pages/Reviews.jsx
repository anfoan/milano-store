import { useEffect, useState } from 'react';
import { Star, ArrowLeft, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';

const Reviews = () => {
    const { t, direction } = useLanguage();
    const navigate = useNavigate();
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        average: 5,
        total: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    });

    useEffect(() => {
        // window.scrollTo(0, 0); // Handled globally by ScrollToTop

        // Fetch Reviews Realtime
        const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReviews = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Calculate Stats
            const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
            let sum = 0;
            fetchedReviews.forEach(r => {
                const rating = r.rating || 5;
                distribution[rating] = (distribution[rating] || 0) + 1;
                sum += rating;
            });

            const average = fetchedReviews.length > 0 ? (sum / fetchedReviews.length).toFixed(1) : 5;

            setStats({
                average: average,
                total: fetchedReviews.length,
                distribution: distribution
            });

            setReviews(fetchedReviews);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching reviews:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);


    if (loading) {
        return <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b] flex items-center justify-center text-gray-900 dark:text-white font-['Cairo'] transition-colors duration-300">{t('reviews.loading')}</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b] text-gray-900 dark:text-white pb-6 font-['Cairo'] transition-colors duration-300">
            <div className="max-w-[1400px] mx-auto px-4 pt-8 relative">

                {/* Header (Back + Title) */}
                <div className="flex items-center gap-3 mb-10">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-10 h-10 rounded-full bg-gray-200/50 dark:bg-white/10 backdrop-blur-md flex items-center justify-center text-gray-900 dark:text-white hover:bg-gray-300/50 dark:hover:bg-white/20 transition-all shadow-sm border border-gray-200 dark:border-white/5"
                    >
                        <ArrowRight size={20} className="flip-rtl" />
                    </button>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white">{t('reviews.title')}</h1>
                </div>

                {/* Seller Profile Summary */}
                <div className="flex flex-col items-center mb-6">
                    <div className="w-28 h-28 md:w-32 md:h-32 rounded-full p-[3px] bg-gradient-to-b from-[#3b82f6] via-[#06b6d4] to-[#3b82f6] mb-3 shadow-2xl">
                        <div className="w-full h-full rounded-full bg-white dark:bg-zinc-950 p-1">
                            <img
                                src="/logo.jpg"
                                alt="Milano Logo"
                                className="w-full h-full rounded-full object-cover"
                            />
                        </div>
                    </div>
                    <h3 className="text-gray-900 dark:text-white font-black text-xl mb-1">{t('rate.store_title')}</h3>
                    <div className="flex gap-1 text-yellow-400 mb-1">
                        {[1, 2, 3, 4, 5].map(i => (
                            <Star
                                key={i}
                                size={20}
                                fill={i <= Math.round(stats.average) ? "currentColor" : "none"}
                                className={i <= Math.round(stats.average) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}
                            />
                        ))}
                    </div>
                    <span className="text-gray-500 dark:text-gray-400 font-bold text-sm">{stats.average}/5</span>
                </div>

                {/* New: Rate Store Card Section - Matches Profile Style */}
                <div className="mb-6 bg-white dark:bg-[#161618] rounded-[32px] p-6 md:p-8 border border-gray-100 dark:border-white/5 shadow-xl flex flex-col items-center gap-5 transition-colors duration-300">
                    <h4 className="text-gray-900 dark:text-white font-black text-xl md:text-2xl">{t('profile.rate_store')}</h4>
                    <button
                        onClick={() => navigate('/rate-order')}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#06b6d4] text-white font-black text-lg md:text-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transform transition-all active:scale-95 flex items-center justify-center"
                    >
                        {t('profile.rate_button')}
                    </button>
                </div>

                {/* Customer Reviews Section */}
                <div className="pt-4 border-t border-gray-200 dark:border-white/5">
                    <h2 className="text-2xl font-black mb-6 text-start">{t('reviews.customer_reviews')} ({reviews.length})</h2>

                    {reviews.length === 0 ? (
                        <div className="text-center text-gray-500 py-10 font-bold">{t('reviews.no_reviews')}</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {reviews.map((rev) => (
                                <div key={rev.id} className="bg-white dark:bg-[#161618] rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 flex flex-col shadow-md dark:shadow-lg transition-colors duration-300">
                                    {/* Review Header */}
                                    <div className="relative bg-gray-50 dark:bg-[#1f2d3d]/50 py-2.5 px-4 flex items-center justify-center border-b border-gray-100 dark:border-white/5">
                                        <span className="text-gray-900 dark:text-white font-black text-sm tracking-wide text-center">{rev.name}</span>
                                        <span className={`absolute ${direction === 'rtl' ? 'left-4' : 'right-4'} text-gray-400 dark:text-gray-505 text-xs font-semibold font-mono`} dir="ltr">
                                            {rev.createdAt
                                                ? (rev.createdAt.seconds
                                                    ? new Date(rev.createdAt.seconds * 1000).toLocaleDateString('en-CA')
                                                    : new Date(rev.createdAt).toLocaleDateString('en-CA'))
                                                : (rev.time || '')}
                                        </span>
                                    </div>

                                    {/* Review Body */}
                                    <div className="p-4 md:p-5 flex-grow flex flex-col justify-center text-center">
                                        <p className="text-gray-700 dark:text-gray-200 text-sm font-semibold leading-relaxed px-4 text-center">
                                            {rev.message || t('reviews.no_comment')}
                                        </p>

                                        {/* Store Reply */}
                                        {rev.replyText && (
                                            <div className={`mt-3 bg-blue-50 dark:bg-blue-900/10 ${direction === 'rtl' ? 'border-r-4 rounded-l-xl' : 'border-l-4 rounded-r-xl'} border-blue-500 p-3`}>
                                                <h4 className="font-black text-blue-600 dark:text-blue-400 text-xs mb-1 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                                    {t('reviews.store_reply')}
                                                </h4>
                                                <p className="text-gray-600 dark:text-gray-300 text-xs font-bold leading-relaxed">
                                                    {rev.replyText}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Review Footer */}
                                    <div className="relative bg-gray-50 dark:bg-[#1f2d3d]/50 py-2.5 px-4 flex items-center justify-center border-t border-gray-100 dark:border-white/5">
                                        <span className={`absolute ${direction === 'rtl' ? 'right-8' : 'left-8'} text-gray-900 dark:text-white font-black text-sm`}>
                                            {rev.status}
                                        </span>
                                        <div className="flex gap-0.5 text-yellow-400">
                                            {[...Array(rev.rating || 5)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Reviews;
