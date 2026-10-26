import { Outlet } from 'react-router-dom';
import { Suspense, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import WhatsAppButton from '../components/WhatsAppButton';
import StoreStatusGuardian from '../components/StoreStatusGuardian';
import ScrollToTop from '../components/ScrollToTop';

const Layout = () => {
    const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

    return (
        <div className="min-h-screen flex flex-col bg-brand-gray dark:bg-[#0f1218]">
            <ScrollToTop />
            <StoreStatusGuardian />
            <Navbar onCategoryDrawerChange={setCategoryDrawerOpen} />
            <main className="flex-grow pb-2">
                <Suspense fallback={
                    <div className="min-h-[60vh] flex items-center justify-center bg-brand-gray dark:bg-[#0f1218]" aria-label="جاري التحميل">
                        <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                    </div>
                }>
                    <Outlet />
                </Suspense>
            </main>
            <Footer />
            <WhatsAppButton hidden={categoryDrawerOpen} />
        </div>
    );
};

export default Layout;
