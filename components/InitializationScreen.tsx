import React, { useState, useEffect } from 'react';

interface InitializationScreenProps {
    initMessage: string;
    initProgress: number;
    useFallback?: boolean;
}

// App features to showcase during loading
const APP_FEATURES = [
    {
        icon: '💰',
        title: 'Smart Financial Management',
        description: 'Track transactions, invoices, and expenses with ease',
        color: '#16a34a'
    },
    {
        icon: '🏢',
        title: 'Property & Rental Management',
        description: 'Manage buildings, properties, units, and rental agreements',
        color: '#0891b2'
    },
    {
        icon: '📊',
        title: 'Project Management',
        description: 'Track projects, budgets, and payroll efficiently',
        color: '#7c3aed'
    },
    {
        icon: '👥',
        title: 'Contact & Vendor Management',
        description: 'Organize contacts, vendors, and stakeholders',
        color: '#dc2626'
    },
    {
        icon: '💳',
        title: 'Advanced Invoicing',
        description: 'Create professional invoices with custom templates',
        color: '#ea580c'
    },
    {
        icon: '📈',
        title: 'Budget & Analytics',
        description: 'Monitor budgets and get insights with detailed reports',
        color: '#059669'
    },
    {
        icon: '🔄',
        title: 'Recurring Transactions',
        description: 'Automate recurring invoices and scheduled transactions',
        color: '#2563eb'
    },
    {
        icon: '💎',
        title: 'Investment Tracking',
        description: 'Track investments, returns, and shareholder distributions',
        color: '#9333ea'
    },
    {
        icon: '☁️',
        title: 'Cloud Sync',
        description: 'Access your data anywhere with cloud synchronization',
        color: '#0284c7'
    },
    {
        icon: '🔒',
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
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%)',
            backgroundSize: '400% 400%',
            animation: 'gradient 15s ease infinite',
            padding: '2rem',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            {/* Main Container */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(10px)',
                padding: '3rem',
                borderRadius: '1.5rem',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.5)',
                maxWidth: '600px',
                width: '100%',
                textAlign: 'center'
            }}>
                {/* App Logo/Title */}
                <div style={{
                    fontSize: '2.5rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    background: 'linear-gradient(135deg, #16a34a 0%, #0891b2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'pulse 2s ease-in-out infinite'
                }}>
                    PBooksPro
                </div>

                <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '2rem',
                    fontWeight: '500'
                }}>
                    Professional Business Management Suite
                </div>

                {/* Feature Showcase with Animation */}
                <div style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 100%)',
                    borderRadius: '1rem',
                    padding: '2rem',
                    marginBottom: '2rem',
                    minHeight: '180px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    border: '2px solid rgba(255, 255, 255, 0.8)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.3s ease',
                    opacity: isAnimating ? 1 : 0,
                    transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)'
                }}>
                    <div style={{
                        fontSize: '4rem',
                        marginBottom: '1rem',
                        animation: 'bounce 2s ease-in-out infinite'
                    }}>
                        {currentFeature.icon}
                    </div>
                    <div style={{
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        color: currentFeature.color,
                        marginBottom: '0.5rem'
                    }}>
                        {currentFeature.title}
                    </div>
                    <div style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        lineHeight: '1.5'
                    }}>
                        {currentFeature.description}
                    </div>
                </div>

                {/* Feature Dots Indicator */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '2rem'
                }}>
                    {APP_FEATURES.map((_, index) => (
                        <div
                            key={index}
                            style={{
                                width: index === currentFeatureIndex ? '24px' : '8px',
                                height: '8px',
                                borderRadius: '4px',
                                background: index === currentFeatureIndex 
                                    ? 'linear-gradient(135deg, #16a34a 0%, #0891b2 100%)'
                                    : '#d1d5db',
                                transition: 'all 0.3s ease'
                            }}
                        />
                    ))}
                </div>

                {/* Progress Section */}
                <div style={{
                    background: '#f9fafb',
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    border: '1px solid #e5e7eb'
                }}>
                    {/* Progress Message */}
                    <div style={{
                        fontSize: '0.875rem',
                        color: '#374151',
                        marginBottom: '1rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                    }}>
                        {initProgress < 100 && (
                            <div style={{
                                width: '12px',
                                height: '12px',
                                border: '2px solid #e5e7eb',
                                borderTop: '2px solid #16a34a',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }} />
                        )}
                        {initMessage}
                    </div>

                    {/* Progress Bar */}
                    <div style={{
                        width: '100%',
                        height: '12px',
                        background: '#e5e7eb',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        marginBottom: '0.5rem',
                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{
                            width: `${initProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #16a34a 0%, #0891b2 50%, #7c3aed 100%)',
                            backgroundSize: '200% 100%',
                            borderRadius: '6px',
                            transition: 'width 0.5s ease',
                            boxShadow: '0 0 15px rgba(22, 163, 74, 0.5)',
                            animation: 'shimmer 2s linear infinite'
                        }} />
                    </div>

                    <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        fontWeight: '600'
                    }}>
                        {Math.round(initProgress)}% Complete
                    </div>
                </div>

                {/* Debug info in development */}
                {process.env.NODE_ENV === 'development' && (
                    <div style={{
                        marginTop: '1.5rem',
                        padding: '0.75rem',
                        background: '#f3f4f6',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        textAlign: 'left',
                        fontFamily: 'monospace',
                        color: '#374151',
                        border: '1px solid #e5e7eb'
                    }}>
                        <div>Mode: {useFallback ? 'localStorage (fallback)' : 'SQL Database'}</div>
                        <div>Progress: {initProgress}%</div>
                        <div>Feature: {currentFeature.title}</div>
                    </div>
                )}
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

                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }

                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </div>
    );
};

export default InitializationScreen;


