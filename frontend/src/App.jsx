import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import BuildBowl from './pages/BuildBowl.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import LegalPage from './pages/LegalPage.jsx';
import Cart from './pages/Cart.jsx';
import Signup from './pages/Signup.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import CompleteProfile from './pages/CompleteProfile.jsx';
import AddressFormPage from './pages/AddressFormPage.jsx';
import SavedAddresses from './pages/SavedAddresses.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import AdminAnalystPage from './pages/AdminAnalystPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      {/* Dedicated Admin Workspaces */}
      <Route path="admin" element={<Admin />} />
      <Route path="admin-analyst" element={<AdminAnalystPage />} />

      {/* Customer Brand Website */}
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<Menu />} />
        <Route path="build-bowl" element={<BuildBowl />} />
        <Route path="product/:id" element={<ProductDetail />} />
        <Route path="subscriptions" element={<Subscriptions />} />
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
  );
}
