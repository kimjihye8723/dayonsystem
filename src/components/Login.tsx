import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoDark from '../assets/logo_godata.png';
import logoLight from '../assets/logo_godata_light.png';

import axios from 'axios';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const [account, setAccount] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [rememberId, setRememberId] = React.useState(false);
    const [theme] = React.useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    });

    // Populate saved account on mount
    React.useEffect(() => {
        const savedAccount = localStorage.getItem('savedAccount');
        if (savedAccount) {
            setAccount(savedAccount);
            setRememberId(true);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await axios.post('/api/login', {
                account,
                password
            });

            if (response.data.success) {
                // Store user info if needed
                localStorage.setItem('user', JSON.stringify(response.data.user));

                // Handle Remember ID
                if (rememberId) {
                    localStorage.setItem('savedAccount', account);
                } else {
                    localStorage.removeItem('savedAccount');
                }

                navigate('/dashboard');
            }
        } catch (error: any) {
            const message = error.response?.data?.message || '로그인에 실패했습니다. 서버 연결을 확인해주세요.';
            alert(message);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <a
                    href="http://www.godata.co.kr:90/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        marginBottom: '1.5rem',
                        color: 'var(--text-muted)',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'color 0.2s',
                        fontWeight: 500,
                        textAlign: 'right'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                    고데이터 바로가기 (www.godata.co.kr:90)
                    <span style={{ fontSize: '0.7rem' }}>↗</span>
                </a>
                <div className="login-header">
                    <img src={theme === 'light' ? logoLight : logoDark} alt="GODATA" className="login-logo" />
                </div>

                <form onSubmit={handleLogin}>
                    <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.1rem' }}>
                            <label className="input-label" style={{ margin: 0 }}>User ID</label>
                            <label className="remember-group" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    id="remember"
                                    style={{ width: '14px', height: '14px' }}
                                    checked={rememberId}
                                    onChange={(e) => setRememberId(e.target.checked)}
                                />
                                <span className="remember-label">Remember ID</span>
                            </label>
                        </div>
                        <input
                            type="text"
                            className="login-input"
                            placeholder="사용계정을 입력하세요."
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group" style={{ marginBottom: '2.5rem' }}>
                        <label className="input-label" style={{ paddingLeft: '0.1rem' }}>Password</label>
                        <input
                            type="password"
                            className="login-input"
                            placeholder="비밀번호를 입력하세요."
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{
                        width: '100%',
                        padding: '1rem',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        borderRadius: '0.375rem',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
                    }}>
                        로그인
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
