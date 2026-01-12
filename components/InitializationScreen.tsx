import React, { useState, useEffect } from 'react';

interface InitializationScreenProps {
    initMessage: string;
    initProgress: number;
    useFallback?: boolean;
}

// App features to showcase during loading
const APP_FEATURES = [
    {
        title: 'Smart Financial Management',
        description: 'Track transactions, invoices, and expenses with ease',
        color: '#16a34a'
    },
    {
        title: 'Property & Rental Management',
        description: 'Manage buildings, properties, units, and rental agreements',
        color: '#0891b2'
    },
    {
        title: 'Project Management',
        description: 'Track projects, budgets, and payroll efficiently',
        color: '#7c3aed'
    },
    {
        title: 'Contact & Vendor Management',
        description: 'Organize contacts, vendors, and stakeholders',
        color: '#dc2626'
    },
    {
        title: 'Advanced Invoicing',
        description: 'Create professional invoices with custom templates',
        color: '#ea580c'
    },
    {
        title: 'Budget & Analytics',
        description: 'Monitor budgets and get insights with detailed reports',
        color: '#059669'
    },
    {
        title: 'Recurring Transactions',
        description: 'Automate recurring invoices and scheduled transactions',
        color: '#2563eb'
    },
    {
        title: 'Investment Tracking',
        description: 'Track investments, returns, and shareholder distributions',
        color: '#9333ea'
    },
    {
        title: 'Cloud Sync',
        description: 'Access your data anywhere with cloud synchronization',
        color: '#0284c7'
    },
    {
        title: 'Secure & Multi-tenant',
        description: 'Enterprise-grade security with multi-tenant support',
        color: '#15803d'
    }
];

const InitializationScreen: React.FC<InitializationScreenProps> = ({ 
    initMessage, 
    initProgress, 
    useFallback = false 
}) => {
    const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(true);

    // Rotate through features every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(false);
            setTimeout(() => {
                setCurrentFeatureIndex((prev) => (prev + 1) % APP_FEATURES.length);
                setIsAnimating(true);
            }, 300);
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const currentFeature = APP_FEATURES[currentFeatureIndex];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%)',
            backgroundSize: '400% 400%',
            animation: 'gradient 15s ease infinite',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            position: 'relative'
        }}>
            {/* Full Screen Feature Display */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '2rem',
                textAlign: 'center',
                transition: 'all 0.5s ease',
                opacity: isAnimating ? 1 : 0,
                transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)'
            }}>
                <h1 style={{
                    fontSize: 'clamp(2rem, 5vw, 4rem)',
                    fontWeight: 'bold',
                    color: currentFeature.color,
                    marginBottom: '1.5rem',
                    lineHeight: '1.2',
                    textShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
                }}>
                    {currentFeature.title}
                </h1>
                <p style={{
                    fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
                    color: 'rgba(255, 255, 255, 0.95)',
                    maxWidth: '800px',
                    lineHeight: '1.6',
                    fontWeight: '400',
                    textShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                }}>
                    {currentFeature.description}
                </p>
            </div>

            {/* Progress Bar at Bottom */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '2rem',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderTop: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
                <div style={{
                    maxWidth: '600px',
                    width: '100%',
                    margin: '0 auto'
                }}>
                    {/* Progress Bar */}
                    <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(255, 255, 255, 0.3)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '0.75rem',
                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{
                            width: `${initProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #ffffff 0%, rgba(255, 255, 255, 0.8) 100%)',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease',
                            boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                            animation: 'shimmer 2s linear infinite'
                        }} />
                    </div>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes gradient {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                @keyframes shimmer {
                    0% { 
                        background-position: 200% 0;
                        opacity: 0.9;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% { 
                        background-position: -200% 0;
                        opacity: 0.9;
                    }
                }
            `}</style>
        </div>
    );
};

export default InitializationScreen;


