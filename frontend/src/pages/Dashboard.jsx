import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Video, Search } from 'lucide-react';

const Dashboard = () => {
  const { user, logout, token } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { socket } = useContext(SocketContext);

  const fetchUsers = () => {
    if (token) {
      const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://facetime-bice.vercel.app');
      fetch(`${apiBase}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setUsers(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  };

  useEffect(() => {
    fetchUsers();
    // Refresh user list every 10 seconds for real-time accuracy on Vercel
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (socket) {
      socket.on('online-users', fetchUsers);
      return () => socket.off('online-users', fetchUsers);
    }
  }, [socket]);

  useEffect(() => {
    const activeRouteId = sessionStorage.getItem('activeCallWith');
    if (activeRouteId) {
      navigate(`/call/${activeRouteId}`, { state: { reconnect: true } });
    }
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCall = (recipient) => {
    navigate(`/call/${recipient._id}`, { state: { recipient } });
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <nav className="backdrop-blur-md bg-mac-blur border-b border-mac-border px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-xl font-semibold">Aashirshiya</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-300">Hello, {user?.name}</span>
          <button onClick={handleLogout} className="text-mac-red hover:text-red-400 p-2 rounded-full hover:bg-mac-gray transition">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6 mt-4 sm:mt-8">
        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-end gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Recent Calls</h2>
            <p className="text-gray-400 text-sm sm:text-base">Start a FaceTime with anyone.</p>
          </div>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search..."
              className="bg-mac-gray border border-mac-border rounded-full pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-mac-accent w-full sm:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredUsers.map((u) => {
            return (
              <div key={u._id} className="backdrop-blur-md bg-mac-blur border border-mac-border p-4 rounded-2xl flex items-center justify-between hover:bg-mac-gray transition group">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src={`https://ui-avatars.com/api/?name=${u.name}&background=6D28D9&color=fff&size=128`} alt={u.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10 group-hover:border-purple-500/50 transition-colors" />
                    {u.isOnline && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#121212] rounded-full shadow-lg shadow-green-500/20"></span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{u.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className={`w-2 h-2 rounded-full ${u.isOnline ? 'bg-mac-green shadow-[0_0_8px_#34C759]' : 'bg-gray-500'}`}></span>
                      {u.isOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleCall(u)}
                  className="bg-mac-green hover:bg-green-500 text-white p-3 rounded-full shadow-[0_4px_14px_rgba(52,199,89,0.39)] transition group-hover:scale-110"
                >
                  <Video size={20} />
                </button>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              No users found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
