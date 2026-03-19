import React, { useState } from 'react';
import { Lock, User, Globe, Loader2 } from 'lucide-react';

export default function LoginScreen({ onAuthenticate }) {
  const [workspace, setWorkspace] = useState('PH - Main Store');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isEngaging, setIsEngaging] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsEngaging(true);
    setError('');

    setTimeout(() => {
      if (username === 'admin' && pin === 'admin123') {
        onAuthenticate(workspace);
      } else {
        setError('❌ Invalid Username or Security PIN');
        setIsEngaging(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111827]">
      <div className="bg-[#1F2937] p-10 rounded-xl shadow-2xl border border-gray-800 w-full max-w-md">
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-white tracking-wider mb-2">
            iSUPPLY
          </h1>
          <h2 className="text-xl font-bold text-emerald-500 tracking-widest">
            FLEET COMMAND
          </h2>
          <p className="text-gray-400 mt-2 text-sm">Select Workspace Environment</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Globe className="h-5 w-5 text-gray-400" />
            </div>
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-[#374151] text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold"
            >
              <option value="PH - Main Store">PH - Main Store</option>
              <option value="VN - Expansion">VN - Expansion</option>
            </select>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              required
              placeholder="Admin Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-[#374151] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="password"
              required
              placeholder="Security PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-lg leading-5 bg-[#374151] text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {error && <div className="text-red-400 text-sm font-semibold text-center">{error}</div>}

          <button
            type="submit"
            disabled={isEngaging}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-emerald-500 transition-colors disabled:opacity-50"
          >
            {isEngaging ? (
              <span className="flex items-center">
                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                CONNECTING...
              </span>
            ) : (
              'ENGAGE SYSTEM'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}