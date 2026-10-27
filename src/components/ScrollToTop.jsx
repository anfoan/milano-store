import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { safeSessionGet, safeSessionSet } from '../lib/safeStorage';

const scrollKey = (pathname) => `store_scroll:${pathname}`;

const readScrollPosition = (pathname) => {
    const raw = safeSessionGet(scrollKey(pathname));
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
};

const ScrollToTop = () => {
    const { pathname } = useLocation();
    const navType = useNavigationType();
    const previousPathnameRef = useRef(pathname);

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        const savePosition = () => {
            safeSessionSet(scrollKey(window.location.pathname), String(window.scrollY));
        };

        // Mobile browsers may start the route transition before their passive
        // scroll event is flushed. Capture the position at the first touch so
        // POP navigation can restore the exact point instead of falling back
        // to the top of the page.
        const saveBeforeTouchNavigation = (event) => {
            const anchor = event.target.closest?.('a[href]');
            if (anchor && anchor.origin === window.location.origin) savePosition();
        };

        window.addEventListener('scroll', savePosition, { passive: true });
        document.addEventListener('pointerdown', saveBeforeTouchNavigation, { capture: true, passive: true });
        document.addEventListener('touchstart', saveBeforeTouchNavigation, { capture: true, passive: true });
        return () => {
            window.removeEventListener('scroll', savePosition);
            document.removeEventListener('pointerdown', saveBeforeTouchNavigation, true);
            document.removeEventListener('touchstart', saveBeforeTouchNavigation, true);
        };
    }, []);

    useEffect(() => {
        const previousPathname = previousPathnameRef.current;
        return () => {
            safeSessionSet(scrollKey(previousPathname), String(window.scrollY));
        };
    }, [pathname]);

    useEffect(() => {
        previousPathnameRef.current = pathname;
    }, [pathname]);

    useLayoutEffect(() => {
        const savedPosition = navType === 'POP' ? readScrollPosition(pathname) : 0;

        // If no position was captured, let the browser keep its native mobile
        // restoration. Calling scrollTo(0) here is what caused the reset.
        if (navType === 'POP' && savedPosition === null) return undefined;

        // Keep PUSH navigation at the top, while POP navigation returns the
        // customer to the exact place where they were browsing before.
        const frameId = window.requestAnimationFrame(() => {
            window.scrollTo({ top: savedPosition, left: 0, behavior: 'auto' });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [pathname, navType]);

    return null;
};

export default ScrollToTop;
