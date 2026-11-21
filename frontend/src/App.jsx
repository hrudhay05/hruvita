import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import Home from './pages/Home.jsx';

const Menu = lazy(() => import('./pages/Menu.jsx'));
const Groceries = lazy(() => import('./pages/Groceries.jsx'));
const BuildBowl = lazy(() => import('./pages/BuildBowl.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'));
const GroupDrops = lazy(() => import('./pages/GroupDrops.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile.jsx'));
const AddressFormPage = lazy(() => import('./pages/AddressFormPage.jsx'));
const SavedAddresses = lazy(() => import('./pages/SavedAddresses.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const GroceryAdmin = lazy(() => import('./pages/GroceryAdmin.jsx'));
const AdminAnalystPage = lazy(() => import('./pages/AdminAnalystPage.jsx'));
const DeliveryDashboard = lazy(() => import('./pages/DeliveryDashboard.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<PageSkeleton />}>
      <Routes>
      {/* Dedicated Role-Protected Workspaces */}
      <Route
        path="admin"
        element={
          <ProtectedRoute allowedRoles={['admin', 'staff']}>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="grocery-admin"
        element={
          <ProtectedRoute allowedRoles={['grocery_admin']}>
            <GroceryAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="admin-analyser"
        element={
          <ProtectedRoute allowedRoles={['admin_analyser', 'admin']}>
            <AdminAnalystPage />
          </ProtectedRoute>
        }
      />
      <Route path="admin-analyst" element={<Navigate to="/admin-analyser" replace />} />
      <Route
        path="delivery"
        element={
          <ProtectedRoute allowedRoles={['delivery_boy']}>
            <DeliveryDashboard />
          </ProtectedRoute>
        }
      />

      {/* Customer Brand Website */}
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<Menu />} />
        <Route path="groceries" element={<Groceries />} />
        <Route
          path="build-bowl"
          element={
            <ProtectedRoute redirectTo="/login">
              <BuildBowl />
            </ProtectedRoute>
          }
        />
        <Route path="product/:id" element={<ProductDetail />} />
        <Route
          path="subscriptions"
          element={
            <ProtectedRoute redirectTo="/login">
              <Subscriptions />
            </ProtectedRoute>
          }
        />
        <Route
          path="group-drops"
          element={
            <ProtectedRoute redirectTo="/login">
              <GroupDrops />
            </ProtectedRoute>
          }
        />
        <Route
          path="group-drops/:code"
          element={
            <ProtectedRoute redirectTo="/login">
              <GroupDrops />
            </ProtectedRoute>
          }
        />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="privacy" element={<LegalPage type="privacy" />} />
        <Route path="terms" element={<LegalPage type="terms" />} />
        <Route path="refund-policy" element={<LegalPage type="refund" />} />
        <Route path="cart" element={<Cart />} />
        <Route path="signup" element={<Signup />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="login" element={<Login />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="complete-profile" element={<CompleteProfile />} />
        <Route path="addresses" element={<SavedAddresses />} />
        <Route path="addresses/new" element={<AddressFormPage />} />
        <Route path="addresses/:id/edit" element={<AddressFormPage />} />
        <Route path="dashboard" element={<Account />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  );
}
