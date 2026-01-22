import { useEffect } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';

export const NotFound = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        // Auto-redirect to home after 3 seconds
        const timer = setTimeout(() => {
            console.log('Auto-redirecting from 404 to home');
            navigate({ to: '/home' });
        }, 3000);

        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            textAlign: 'center',
            color: 'var(--app-text-colour, #fff)'
        }}>
            <h2>Page Not Found</h2>
            <p style={{ opacity: 0.7 }}>The requested route cannot be found.</p>
            <code style={{
                marginTop: '16px',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px',
                fontSize: '0.9em'
            }}>
                {location.pathname}
            </code>
            <p style={{ marginTop: '24px', fontSize: '0.9em', opacity: 0.6 }}>
                Redirecting to home in 3 seconds...
            </p>
            <button
                onClick={() => navigate({ to: '/home' })}
                style={{
                    marginTop: '16px',
                    padding: '8px 16px',
                    background: 'var(--app-colour-primary, #6200ee)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                }}
            >
                Go to Home Now
            </button>
        </div>
    );
};
