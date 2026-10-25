import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { safeSessionGet, safeSessionSet } from '../lib/safeStorage';

const scrollKey = (pathname) => `store_scroll:${pathname}`;

const readScrollPosition = (pathname) => {
    const value = Number.parseInt(safeSessionGet(scrollKey(pathname)) || '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

const ScrollToTop = () => {
    const { pathname } = useLocation();
    const navType = useNavigationType();

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        const savePosition = () => {
            safeSessionSet(scrollKey(window.location.pathname), String(window.scrollY));
        };

        window.addEventListener('scroll', savePosition, { passive: true });
        return () => window.removeEventListener('scroll', savePosition);
    }, []);

    useLayoutEffect(() => {
        const savedPosition = navType === 'POP' ? readScrollPosition(pathname) : 0;
        let frameId;
        let retryId;

        const restore = () => {
            window.scrollTo({ top: savedPosition, left: 0, behavior: 'auto' });
        };

        // Keep PUSH navigation at the top, while POP navigation returns the
        // customer to the exact place where they were browsing before.
        frameId = window.requestAnimationFrame(restore);
        retryId = window.setTimeout(restore, navType === 'POP' ? 120 : 0);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(retryId);
        };
    }, [pathname, navType]);

    return null;
};

export default ScrollToTop;
