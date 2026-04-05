import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : '');
      fetch(`${apiBase}/api/users/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data._id) {
            setUser(data);
          } else {
            logout();
          }
          setLoading(false);
        })
        .catch(() => {
          logout();
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
    localStorage.setItem('token', jwtToken);
  };

  const googleLogin = async (credential) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : '');
      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data, data.token);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error("Google login fetch error:", err);
      return { success: false, message: "Network error during Google sign-in" };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, googleLogin, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
