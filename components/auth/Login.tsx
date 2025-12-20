
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { APP_LOGO } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { syncService } from '../../services/SyncService';
import SyncScannerModal from '../sync/SyncScannerModal';

const LoginPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    // Sync Scanner State
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Initialize Sync Service with context for login page instance
    useEffect(() => {
        syncService.init(dispatch, () => state);
    }, [dispatch, state]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const user = state.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

        if (!user) {
            setError('User not found.');
            return;
        }

        if (user.password && user.password !== password) {
            setError('Incorrect password.');
            return;
        }

        if (!user.password && password) {
             setError('Incorrect password.');
             return;
        }

        dispatch({ type: 'LOGIN', payload: user });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-8">
                    <img src={APP_LOGO} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-slate-800">My Accountant</h1>
                    <p className="text-slate-500 mt-2">Sign in to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <Input 
                        id="username"
                        name="username"
                        label="Username" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        autoFocus 
                        required 
                        autoComplete="username"
                    />
                    <Input 
                        id="password"
                        name="password"
                        label="Password" 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        placeholder={username === 'admin' ? '(Default: No password)' : ''}
                        autoComplete="current-password"
                    />

                    {error && (
                        <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full justify-center py-3 text-lg">
                        Sign In
                    </Button>
                </form>
                
                <div className="mt-6 pt-6 border-t border-slate-100">
                    <Button 
                        variant="secondary" 
                        className="w-full justify-center py-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                        onClick={() => setIsScannerOpen(true)}
                    >
                        <div className="w-5 h-5 mr-2">
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </div>
                        Sync / Join Session
                    </Button>
                    <p className="text-xs text-center text-slate-400 mt-2">Scan QR code from Desktop to sync data.</p>
                </div>

                <p className="text-xs text-center text-slate-400 mt-8">
                    Default Admin: <strong>admin</strong> (No Password)
                </p>
            </div>
            
            <SyncScannerModal 
                isOpen={isScannerOpen} 
                onClose={() => setIsScannerOpen(false)} 
            />
        </div>
    );
};

export default LoginPage;
