import { Link } from 'react-router-dom';
import { FiInstagram, FiMail, FiMapPin, FiPhone, FiYoutube } from 'react-icons/fi';
import Logo from './Logo.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import './Footer.css';

export default function Footer() {
  const { settings } = useCatalog();

  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div className="footer-about">
          <Logo light />
          <p>
            Fresh Choices. Healthier You. Hand-cut seasonal fruit bowls, custom bowls, and wholesome
            morning breakfasts prepared fresh every day in {settings.city}.
          </p>
          <div className="footer-socials">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              aria-label="HRUVITA on Instagram"
            >
              <FiInstagram size={18} />
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noreferrer"
              aria-label="HRUVITA on YouTube"
            >
              <FiYoutube size={18} />
            </a>
            <a href={`mailto:${settings.email}`} aria-label="Email HRUVITA">
              <FiMail size={18} />
            </a>
          </div>
        </div>

        <div>
          <h3>Quick Links</h3>
          <ul>
            <li><Link to="/menu">Explore Menu</Link></li>
            <li><Link to="/build-bowl">Build Your Bowl</Link></li>
            <li><Link to="/subscriptions">Daily Subscriptions</Link></li>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/contact">Contact Us</Link></li>
          </ul>
        </div>

        <div>
          <h3>Policies</h3>
          <ul>
            <li><Link to="/privacy">Privacy Policy</Link></li>
            <li><Link to="/terms">Terms &amp; Conditions</Link></li>
            <li><Link to="/refund-policy">Refund Policy</Link></li>
            <li><Link to="/dashboard">Customer Dashboard</Link></li>
          </ul>
        </div>

        <div>
          <h3>Contact</h3>
          <ul className="footer-contact-list">
           <li><FiPhone size={14} /> 7569754679</li>
            <li><FiMail size={14} /> sanjaydasaraju@gmail.com</li>
            <li><FiMapPin size={14} /> {settings.city}, India</li>
            <li>{settings.hours}</li>
          </ul>
        </div>
      </div>

      <div className="footer-copy">
        <div className="container footer-copy-inner">
          <span>&copy; {new Date().getFullYear()} {settings.name}. All rights reserved.</span>
          <span>Prepared fresh daily with zero preservatives.</span>
        </div>
      </div>
    </footer>
  );
}
