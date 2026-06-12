
import { useDispatchOnly, useUsers } from '../../hooks/useSelectiveState';
import React, { useState } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { ClientVersionFootnote } from '../ui/ClientVersionLabel';
import { isValidEmailFormat, normalizeUserEmail } from '../../shared/auth/emailIdentity';

const LOCAL_SAVED_LOGIN_KEY = 'pbookspro_local_saved_login';

function readSavedLocalLogin(): { email: string; password: string } | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(LOCAL_SAVED_LOGIN_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as { email?: unknown; username?: unknown; password?: unknown };
        const email =
            typeof o.email === 'string'
                ? o.email
                : typeof o.username === 'string'
                  ? o.username
                  : null;
        if (!email || typeof o.password !== 'string') return null;
        return { email, password: o.password };
    } catch {
        return null;
    }
}

function persistSavedLocalLogin(email: string, password: string) {
    try {
        localStorage.setItem(LOCAL_SAVED_LOGIN_KEY, JSON.stringify({ email, password }));
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
    const users = useUsers();
    const dispatch = useDispatchOnly();
    const initialSaved = readSavedLocalLogin();
    const [email, setEmail] = useState(initialSaved?.email ?? '');
    const [password, setPassword] = useState(initialSaved?.password ?? '');
    const [savePassword, setSavePassword] = useState(!!initialSaved);
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const emailVal = email.trim();
        if (!emailVal) {
            setError('Email address is required.');
            return;
        }
        if (!isValidEmailFormat(emailVal) && !emailVal.includes('@')) {
            setError('Enter a valid email address (e.g. admin@company.local after upgrade).');
            return;
        }

        const normalized = normalizeUserEmail(emailVal) || emailVal.toLowerCase();
        const user = users.find(u => {
            const userEmail = normalizeUserEmail((u as { email?: string }).email);
            if (userEmail && userEmail === normalized) return true;
            return u.username.toLowerCase() === normalized && !normalized.includes('@');
        });

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

        if (savePassword) {
            persistSavedLocalLogin(emailVal, password);
        } else {
            clearSavedLocalLogin();
        }

        dispatch({ type: 'LOGIN', payload: user });
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="text-center mb-8">
                    <img
                        src="/pbookspro-logo.png"
                        alt="PBooksPro"
                        className="h-12 w-auto mx-auto mb-4"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
                    <p className="text-slate-500 mt-2">Sign in with your email</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6" autoComplete="off" data-form-type="other">
                    <Input 
                        id="email"
                        name="email"
                        label="Email Address" 
                        type="email"
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        autoFocus 
                        required 
                        autoComplete="email"
                    />
                    <Input 
                        id="password"
                        name="password"
                        label="Password" 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        placeholder={email.toLowerCase().startsWith('admin@') ? '(Default: No password)' : ''}
                        autoComplete="current-password"
                    />

                    <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                            checked={savePassword}
                            onChange={e => setSavePassword(e.target.checked)}
                        />
                        <span>
                            Remember me on this device
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

                    <p className="text-center text-sm text-slate-500">
                        <button
                            type="button"
                            className="text-slate-600 underline-offset-2 hover:underline"
                            onClick={() => setError('Password reset is available in cloud mode. For offline desktop, ask your administrator to reset your password in Administration → Users.')}
                        >
                            Forgot password?
                        </button>
                    </p>
                </form>
                
                <p className="text-xs text-center text-slate-400 mt-6">
                    Default admin after upgrade: <strong>admin@company.local</strong> (no password until set)
                </p>

                <ClientVersionFootnote className="mt-4 !text-slate-400" />
            </div>
        </div>
    );
};

export default LoginPage;
