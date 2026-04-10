import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';

const Login = () => {
  const { googleLogin } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    const result = await googleLogin(credentialResponse.credential);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.message || 'Google login failed. Please try again.');
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In was unsuccessful. Try again later.');
  };

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <div className="min-h-screen flex items-center justify-center bg-black overflow-x-hidden relative p-4">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[96px] md:blur-[128px] opacity-30"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-[96px] md:blur-[128px] opacity-30"></div>
        
        <div className="backdrop-blur-xl bg-mac-blur border border-mac-border rounded-3xl p-10 md:p-14 w-full max-w-md shadow-2xl z-10 text-center">
          <h1 className="text-4xl font-bold mb-2 text-white">Aashirshiya</h1>
          <p className="text-gray-400 mb-10">Premium video calling, powered by Google.</p>
          
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="w-full flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap
                theme="filled_blue"
                shape="pill"
                size="large"
                width="100%"
              />
            </div>
            
            {error && (
              <p className="text-mac-red text-sm font-medium animate-pulse">
                {error}
              </p>
            )}

          </div>

          <p className="mt-10 text-xs text-gray-500 uppercase tracking-widest leading-loose">
            Secure • Encrypted • Instant
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default Login;
