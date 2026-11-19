import { useNavigate } from 'react-router-dom';
import AdminAnalystDashboard from '../components/AdminAnalystDashboard.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminAnalystPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return <AdminAnalystDashboard user={user} onLogout={handleSignOut} />;
}
