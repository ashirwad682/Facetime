import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallWindow from './pages/CallWindow';
import IncomingCallModal from './components/IncomingCallModal';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

const App = () => {
  return (
    <>
      <IncomingCallModal />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/call/:id" element={
          <ProtectedRoute>
            <CallWindow />
          </ProtectedRoute>
        } />
      </Routes>
    </>
  );
};

export default App;
