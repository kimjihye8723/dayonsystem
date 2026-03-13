import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoDark from '../assets/joot_ams_w.png';
import logoLight from '../assets/joot_ams_b.png';
import { Sun, Moon } from 'lucide-react';

import axios from 'axios';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const [account, setAccount] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [rememberId, setRememberId] = React.useState(false);
    const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
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

    // Theme effect
    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await axios.post('/api/login', {
                account,
                password
            });

            if (response.data.success) {
                    // 현재 로그인 시간을 최근 접속일로 저장 (Dashboard top-nav 표시용)
                    localStorage.setItem('prev_last_login', new Date().toISOString());

                    // Store user info
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
                {/* <a
                    href="http://www.godata.co.kr:90/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="godata-link-btn"
                >
                    <span className="godata-link-btn-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </span>
                    <span className="godata-link-btn-text">고데이터 바로가기</span>
                    <span className="godata-link-btn-arrow">→</span>
                </a> */}
                <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                    <button
                        onClick={toggleTheme}
                        style={{
                            background: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            transition: 'background 0.2s'
                        }}
                    >
                        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                </div>
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
