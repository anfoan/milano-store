import { Outlet } from 'react-router-dom';
import { Suspense, useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import WhatsAppButton from '../components/WhatsAppButton';
import StoreStatusGuardian from '../components/StoreStatusGuardian';
import ScrollToTop from '../components/ScrollToTop';

const Layout = () => {
    const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
    const lastInternalNavigationRef = useRef({ href: '', at: 0 });

    useEffect(() => {
        const handleInternalClick = (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const anchor = event.target.closest?.('a[href]');
            if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

            let destination;
            try {
                destination = new URL(anchor.href, window.location.href);
            } catch {
                return;
            }

            if (destination.origin !== window.location.origin) return;

            const href = `${destination.pathname}${destination.search}${destination.hash}`;
            const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            const now = performance.now();
            const lastNavigation = lastInternalNavigationRef.current;

            // A repeated tap/click must not create duplicate history entries.
            if (href === currentHref || (lastNavigation.href === href && now - lastNavigation.at < 700)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }

            lastInternalNavigationRef.current = { href, at: now };
        };

        document.addEventListener('click', handleInternalClick, true);
        return () => document.removeEventListener('click', handleInternalClick, true);
    }, []);

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
            <WhatsAppButton hidden={false} />
        </div>
    );
};

export default Layout;
