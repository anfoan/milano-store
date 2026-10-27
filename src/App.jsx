import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import Home from './pages/Home';

// Keep storefront routes in the main application tree so navigation does not
// briefly replace a page with Suspense fallback while its chunk is fetched.
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Contact from './pages/Contact';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import Reviews from './pages/Reviews';
import Info from './pages/Info';
import UserProfile from './pages/UserProfile';
import CustomerChat from './pages/CustomerChat';
import RateOrder from './pages/RateOrder';
import OrderTracking from './pages/OrderTracking';
import OffersPage from './pages/OffersPage';
import CustomerWallet from './pages/CustomerWallet';

// Lazy load admin pages
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const POSView = lazy(() => import('./components/admin/POSView'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

import PageMetadataHandler from './components/PageMetadataHandler';
import { CurrencyProvider } from './context/CurrencyContext';

import ProtectedAdminRoute from './components/admin/ProtectedAdminRoute'; // Add Import
import CategoryPage from './pages/CategoryPage';

function App() {
    return (
    <CurrencyProvider>
      <PageMetadataHandler />
      <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="category/:categoryName" element={<CategoryPage />} /> {/* Dynamic Category Route */}
            <Route path="product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-confirmation" element={<OrderConfirmation />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/rate-order" element={<RateOrder />} />
            <Route path="/info" element={<Info />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/wallet" element={<CustomerWallet />} />
            <Route path="products" element={<div className="p-20 text-center">صفحة المنتجات (قيد الإنشاء)</div>} />
            <Route path="*" element={<div className="p-20 text-center">404 - الصفحة غير موجودة</div>} />
          </Route >

          {/* Standalone Chat Route (No Header/Footer) */}
          <Route path="/chat/:chatId" element={<Suspense fallback={<div className="min-h-screen" />}><CustomerChat /></Suspense>} />

          {/* Standalone Password Reset Route */}
          <Route path="/reset-password" element={<Suspense fallback={<div className="min-h-screen" />}><ResetPassword /></Suspense>} />

          {/* Standalone POS Route */}
          <Route path="/pos" element={
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#111317]">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            }>
              <POSView standalone={true} />
            </Suspense>
          } />

          {/* Secret Admin Routes */}
          < Route path="/milano-secure-gate-99" element={
            < Suspense fallback={< div className="p-20 text-center text-white" > جاري التحميل...</div >}>
              <AdminLogin />
            </Suspense >
          } />
          < Route path="/milano-dashboard-vault-77" element={
            <ProtectedAdminRoute>
              < Suspense fallback={< div className="p-20 text-center text-white" > جاري التحميل...</div >}>
                <AdminDashboard />
              </Suspense >
            </ProtectedAdminRoute>
          } />
      </Routes>
    </CurrencyProvider>
  );
}

export default App;
