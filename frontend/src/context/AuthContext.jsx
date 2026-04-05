import React, { createContext, useState, useEffect } from 'react';
import { getApiBase } from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const apiBase = getApiBase();
      console.log("Checking Auth State via:", `${apiBase}/api/users/profile`);
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
      const apiBase = getApiBase();
      console.log("Attempting Google login via:", `${apiBase}/api/auth/google`);
      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (res.ok) {
        // IMPORTANT: Ensure state is updated BEFORE returning success to trigger navigation
        setUser(data.user || data); 
        setToken(data.token);
        localStorage.setItem('token', data.token);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error("Google login fetch error details:", err);
      return { 
        success: false, 
        message: `Network error: ${err.message}. Please check if the backend at ${apiBase} is running.` 
      };
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
