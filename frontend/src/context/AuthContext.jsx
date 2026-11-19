import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setStoredToken } from '../lib/api.js';
import { disconnectAllHruvitaSockets } from '../lib/socket.js';

const AuthContext = createContext(null);

export function getDashboardPathForRole(role) {
  if (role === 'admin' || role === 'staff') return '/admin';
  if (role === 'admin_analyser') return '/admin-analyser';
  if (role === 'delivery_boy') return '/delivery';
  return '/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const syncAddressesState = useCallback((addrList = []) => {
    setAddresses(addrList);
    const def = addrList.find((a) => a.isDefault) || addrList[0];
    setSelectedAddressId((prev) =>
      prev && addrList.some((a) => a.id === prev) ? prev : def?.id || ''
    );
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiRequest('/api/profile/notifications');
      setNotifications(data.notifications || []);
    } catch {
      // ignore if unauthenticated
    }
  }, []);

  const fetchAddresses = useCallback(async () => {
    try {
      const data = await apiRequest('/api/addresses');
      syncAddressesState(data.addresses || []);
      return data.addresses || [];
    } catch {
      return [];
    }
  }, [syncAddressesState]);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/session');
      if (data.authenticated && data.user) {
        setUser(data.user);
        syncAddressesState(data.user?.addresses || []);
        fetchNotifications();
        return data.user;
      }
      setUser(null);
      setAddresses([]);
      return null;
    } catch {
      setStoredToken('');
      setUser(null);
      setAddresses([]);
      return null;
    }
  }, [fetchNotifications, syncAddressesState]);

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const signup = async (payload) => {
    return apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const verifyEmailOtp = async ({ email, otp, rememberMe = false }) => {
    const data = await apiRequest('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, otp, rememberMe }),
    });
    if (data.token) setStoredToken(data.token);
    if (data.user) {
      setUser(data.user);
      syncAddressesState(data.user.addresses || []);
    }
    await fetchNotifications();
    return data;
  };

  const resendOtp = async (email) => {
    return apiRequest('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const login = async (emailOrUsername, password, rememberMe = false, directDemo = false) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        emailOrUsername,
        email: emailOrUsername,
        password,
        rememberMe,
        directDemo,
      }),
    });
    if (data.requiresOtpVerification) {
      return data;
    }
    if (data.token) setStoredToken(data.token);
    if (data.user) {
      setUser(data.user);
      syncAddressesState(data.user?.addresses || []);
      await fetchNotifications();
    }
    return data.user;
  };

  const register = signup;

  const googleSignIn = async (payload) => {
    const data = await apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) setStoredToken(data.token);
    setUser(data.user);
    syncAddressesState(data.user?.addresses || []);
    await fetchNotifications();
    return data.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout network errors
    }
    disconnectAllHruvitaSockets();
    setStoredToken('');
    setUser(null);
    setAddresses([]);
    setNotifications([]);
  };

  const forgotPassword = async (email) => {
    return apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const resetPassword = async ({ token, newPassword, confirmPassword }) => {
    return apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword, confirmPassword }),
    });
  };

  const completeProfile = async (payload) => {
    const data = await apiRequest('/api/users/complete-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async (patch) => {
    const data = await apiRequest('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setUser(data.user);
    return data.user;
  };

  const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    const data = await apiRequest('/api/users/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    await fetchNotifications();
    return data;
  };

  const getAddressById = async (addressId) => {
    const data = await apiRequest(`/api/addresses/${addressId}`);
    return data.address;
  };

  const addAddress = async (addr) => {
    const data = await apiRequest('/api/addresses', {
      method: 'POST',
      body: JSON.stringify(addr),
    });
    if (data.user) setUser(data.user);
    if (data.addresses) syncAddressesState(data.addresses);
    return data.address;
  };

  const updateAddress = async (addressId, addr) => {
    const data = await apiRequest(`/api/addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(addr),
    });
    if (data.user) setUser(data.user);
    if (data.addresses) syncAddressesState(data.addresses);
    return data.address;
  };

  const setDefaultAddress = async (addressId) => {
    const data = await apiRequest(`/api/addresses/${addressId}/default`, {
      method: 'PATCH',
    });
    if (data.user) setUser(data.user);
    if (data.addresses) syncAddressesState(data.addresses);
    setSelectedAddressId(addressId);
    return data.address;
  };

  const removeAddress = async (addressId) => {
    const data = await apiRequest(`/api/addresses/${addressId}`, {
      method: 'DELETE',
    });
    if (data.user) setUser(data.user);
    if (data.addresses) syncAddressesState(data.addresses);
    return true;
  };

  const toggleWishlist = async (productId) => {
    const data = await apiRequest(`/api/profile/wishlist/${productId}`, {
      method: 'POST',
    });
    setUser(data.user);
    return data;
  };

  const markNotificationsRead = async () => {
    const data = await apiRequest('/api/profile/notifications/read-all', {
      method: 'POST',
    });
    setNotifications(data.notifications || []);
  };

  const clearNotifications = async () => {
    await apiRequest('/api/profile/notifications', { method: 'DELETE' });
    setNotifications([]);
  };

  const deleteAccount = async () => {
    await apiRequest('/api/profile', { method: 'DELETE' });
    setStoredToken('');
    setUser(null);
    setAddresses([]);
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        addresses,
        selectedAddressId,
        setSelectedAddressId,
        loading,
        isAdmin: user?.role === 'admin' || user?.role === 'staff',
        getCurrentUser: () => user,
        isAuthenticated: () => Boolean(user),
        hasRole: (role) => user?.role === role,
        getDashboardPathForRole,
        notifications,
        unreadCount,
        refreshMe,
        fetchAddresses,
        getAddressById,
        fetchNotifications,
        markNotificationsRead,
        clearNotifications,
        signup,
        register,
        verifyEmailOtp,
        resendOtp,
        login,
        googleSignIn,
        logout,
        forgotPassword,
        resetPassword,
        completeProfile,
        updateProfile,
        changePassword,
        addAddress,
        updateAddress,
        setDefaultAddress,
        removeAddress,
        toggleWishlist,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
