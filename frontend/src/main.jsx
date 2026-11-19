import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { CatalogProvider } from './context/CatalogContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import './styles/theme.css';
import './styles/global.css';

document.title = 'HRUVITA — Fresh Choices. Healthier You.';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <CatalogProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </CatalogProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
