import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { safeSessionGet, safeSessionSet } from '../lib/safeStorage';

const scrollKey = (locationKey, pathname) => `store_scroll:${locationKey || pathname}`;

const readScrollPosition = (locationKey, pathname) => {
    const raw = safeSessionGet(scrollKey(locationKey, pathname));
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
};

const ScrollToTop = () => {
    const location = useLocation();
    const { pathname, key: locationKey } = location;
    const navType = useNavigationType();

    useLayoutEffect(() => {
        if ('scrollRestoration' in window.history) {
            // React Router owns the route transition, so native restoration can
            // race with the new page layout and visibly jump on touch devices.
            window.history.scrollRestoration = 'manual';
        }

        const savePosition = () => {
            safeSessionSet(scrollKey(locationKey, pathname), String(window.scrollY));
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
    }, [locationKey, pathname]);

    useLayoutEffect(() => {
        const savedPosition = navType === 'POP'
            ? readScrollPosition(locationKey, pathname)
            : 0;
        const target = savedPosition ?? 0;
        let frameId = null;
        let attempts = 0;

        const restore = () => {
            attempts += 1;
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const positionReady = target === 0 || maxScroll >= target || attempts >= 30;
            window.scrollTo({ top: Math.min(target, maxScroll), left: 0, behavior: 'auto' });
            if (!positionReady) {
                frameId = window.requestAnimationFrame(restore);
            }
        };

        // Run before the browser paints the next route. Delaying this one frame
        // briefly showed the old scroll position, then jumped to the new one.
        // A later frame is used only if an async page is not tall enough yet.
        restore();
        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId);
        };
    }, [locationKey, pathname, navType]);

    return null;
};

export default ScrollToTop;
