import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';
import BottomNav from './BottomNav.jsx';
import VoiceButton from './VoiceButton.jsx';
import './Layout.css';

export default function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);

  return (
    <>
      <div className="layout-shell">
        <Navbar />
        <main className="layout-main">
          <Outlet />
        </main>
        <Footer />
        <BottomNav />
      </div>
      <VoiceButton />
    </>
  );
}
