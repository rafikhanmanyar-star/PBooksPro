
import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import Input from '../ui/Input';
import Button from '../ui/Button';

const LOCAL_SAVED_LOGIN_KEY = 'pbookspro_local_saved_login';

function readSavedLocalLogin(): { username: string; password: string } | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(LOCAL_SAVED_LOGIN_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as { username?: unknown; password?: unknown };
        if (typeof o.username !== 'string' || typeof o.password !== 'string') return null;
        return { username: o.username, password: o.password };
    } catch {
        return null;
    }
}

function persistSavedLocalLogin(username: string, password: string) {
    try {
        localStorage.setItem(LOCAL_SAVED_LOGIN_KEY, JSON.stringify({ username, password }));
    } catch {
        /* ignore */
    }
}

function clearSavedLocalLogin() {
    try {
        localStorage.removeItem(LOCAL_SAVED_LOGIN_KEY);
    } catch {
        /* ignore */
    }
}

const LoginPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const initialSaved = readSavedLocalLogin();
    const [username, setUsername] = useState(initialSaved?.username ?? '');
    const [password, setPassword] = useState(initialSaved?.password ?? '');
    const [savePassword, setSavePassword] = useState(!!initialSaved);
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const user = state.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());

        if (!user) {
            setError('User not found.');
            return;
        }

        // Simple password check (in real app, use hashing)
        if (user.password && user.password !== password) {
            setError('Incorrect password.');
            return;
        }

        // Allow empty password if user has no password set (default admin)
        if (!user.password && password) {
             // Optional: Fail if they typed a password but none is required? 
             // Or allow it. For security, better to be strict.
             setError('Incorrect password.');
             return;
        }

        if (savePassword) {
            persistSavedLocalLogin(username.trim(), password);
        } else {
            clearSavedLocalLogin();
        }

        dispatch({ type: 'LOGIN', payload: user });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
                    <p className="text-slate-500 mt-2">Sign in to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6" autoComplete="off" data-form-type="other">
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
                        autoComplete="off"
                        data-form-type="other"
                    />

                    <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                            checked={savePassword}
                            onChange={e => setSavePassword(e.target.checked)}
                        />
                        <span>
                            Save password on this device
                            <span className="block text-xs text-slate-500 font-normal mt-0.5">
                                Stored locally in your browser. Clear the checkbox and sign in to remove it.
                            </span>
                        </span>
                    </label>

                    {error && (
                        <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full justify-center py-3 text-lg">
                        Sign In
                    </Button>
                </form>
                
                <p className="text-xs text-center text-slate-400 mt-8">
                    Default Admin: <strong>admin</strong> (No Password)
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
