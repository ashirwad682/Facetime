import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:5001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        login(data, data.token);
        navigate('/');
      } else {
        alert(data.message || 'Signup failed');
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black overflow-x-hidden relative p-4">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[96px] md:blur-[128px] opacity-30"></div>
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-[96px] md:blur-[128px] opacity-30"></div>
      
      <div className="backdrop-blur-xl bg-mac-blur border border-mac-border rounded-3xl p-8 md:p-10 w-full max-w-md shadow-2xl z-10 text-center">
        <h1 className="text-4xl font-bold mb-2">Aashirshiya</h1>
        <p className="text-gray-400 mb-8">Create an account to get started.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="text" 
            placeholder="Full Name" 
            className="w-full bg-mac-gray border border-mac-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-mac-accent"
            value={name} onChange={(e) => setName(e.target.value)} required 
          />
          <input 
            type="email" 
            placeholder="Email" 
            className="w-full bg-mac-gray border border-mac-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-mac-accent"
            value={email} onChange={(e) => setEmail(e.target.value)} required 
          />
          <input 
            type="password" 
            placeholder="Password" 
            className="w-full bg-mac-gray border border-mac-border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-mac-accent"
            value={password} onChange={(e) => setPassword(e.target.value)} required 
          />
          <button type="submit" className="w-full bg-mac-accent hover:bg-blue-600 text-white font-semibold py-3 rounded-lg transition">
            Sign Up
          </button>
        </form>
        <div className="mt-6 text-gray-400">
          Already have an account? <Link to="/login" className="text-mac-accent hover:underline">Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
