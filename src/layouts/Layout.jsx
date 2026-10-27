import { Outlet, useLocation } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import WhatsAppButton from '../components/WhatsAppButton';
import StoreStatusGuardian from '../components/StoreStatusGuardian';
import ScrollToTop from '../components/ScrollToTop';
import Home from '../pages/Home';

const Layout = () => {
    const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
    const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
    const { pathname } = useLocation();
    const isHomeRoute = pathname === '/';

    useEffect(() => {
        const handleVideoPreview = (event) => setVideoPreviewOpen(Boolean(event.detail?.open));
        window.addEventListener('milano-video-preview', handleVideoPreview);
        return () => window.removeEventListener('milano-video-preview', handleVideoPreview);
    }, []);
    return (
        <div className="min-h-screen flex flex-col bg-brand-gray dark:bg-[#0f1218]">
            <ScrollToTop />
            <StoreStatusGuardian />
            <Navbar onCategoryDrawerChange={setCategoryDrawerOpen} />
            <main className="relative flex-grow pb-2">
                <Suspense fallback={
                    <div className="min-h-[60vh] flex items-center justify-center bg-brand-gray dark:bg-[#0f1218]" aria-label="جاري التحميل">
                        <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                    </div>
                }>
                    {/* Keep Home mounted between route changes.  Unmounting it rebuilt the
                        full product grid and made every image repaint when a visitor returned. */}
                    <div className={isHomeRoute ? 'relative z-0' : 'hidden'} aria-hidden={!isHomeRoute}>
                        <Home isActive={isHomeRoute} />
                    </div>
                    <div className={isHomeRoute ? 'hidden' : 'relative z-10'}>
                        <Outlet />
                    </div>
                </Suspense>
            </main>
            {!videoPreviewOpen && <Footer />}
            <WhatsAppButton hidden={false} />
        </div>
    );
};

export default Layout;
