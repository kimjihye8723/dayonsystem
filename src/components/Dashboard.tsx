import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, User, Camera, Save, Menu, Sun, Moon
} from 'lucide-react';
import axios from 'axios';
import Sidebar from './Sidebar';
import TodayContent from './partials/TodayContent';
import UserInfoContent from './partials/UserInfoContent';
import BasicCodeContent from './partials/BasicCodeContent';
import RealTimeStatusContent from './partials/RealTimeStatusContent';
import BoardManagementContent from './partials/BoardManagementContent';
import DeviceManagementContent from './partials/DeviceManagementContent';
import VendorManagementContent from './partials/VendorManagementContent';
import UserManagementContent from './partials/UserManagementContent';
import UserPermissionManagementContent from './partials/UserPermissionManagementContent';
import UserStatusContent from './partials/UserStatusContent';
import UserLoginInfoContent from './partials/UserLoginInfoContent';
import ContentsFileManagementContent from './partials/ContentsFileManagementContent';
import VendorStatusContent from './partials/VendorStatusContent';
import AdContentRegistrationContent from './partials/AdContentRegistrationContent';
import AdScheduleSettingContent from './partials/AdScheduleSettingContent';
import TodayAppliedScheduleContent from './partials/TodayAppliedScheduleContent';
import StoreStatusContent from './partials/StoreStatusContent';
import AdPlayLogContent from './partials/AdPlayLogContent';
import ContentAggContent from './partials/ContentAggContent';
import BleLogAggContent from './partials/BleLogAggContent';

interface Tab {
    id: string;
    title: string;
}

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [name, setName] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [profileImg, setProfileImg] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [user, setUser] = React.useState<any>(null);

    React.useEffect(() => {
        if (isOpen) {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const userData = JSON.parse(storedUser);
                setUser(userData);
                setName(userData.USER_NM || '');
                setEmail(userData.email || '');
                setPhone(userData.phone || '');
                setProfileImg(userData.profile_img || null);
            }
            setPassword('');
            setConfirmPassword('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('이미지 파일 크기는 2MB 이하여야 합니다.');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImg(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeletePhoto = () => {
        if (window.confirm('프로필 사진을 삭제하시겠습니까?')) {
            setProfileImg(null);
        }
    };

    const handleUpdate = async () => {
        if (password && password !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.put('/api/user/update', {
                account: user.account,
                name,
                password: password || undefined,
                email,
                phone,
                profile_img: profileImg
            });

            if (response.data.success) {
                const updatedUser = response.data.user;
                localStorage.setItem('user', JSON.stringify(updatedUser));
                window.dispatchEvent(new Event('userUpdated'));
                alert('회원정보 수정이 완료되었습니다.');
                onClose();
            }
        } catch (error: any) {
            console.error('Update error:', error);
            const message = error.response?.data?.message || error.message || '정보 수정 중 오류가 발생했습니다.';
            alert(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 style={{ color: 'var(--text-main)' }}>회원정보 수정</h3>
                    <X size={18} onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />
                </div>
                <div className="modal-body">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*" />
                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                        <div style={{ flex: 1 }} className="modal-form-grid">
                            <span className="modal-label">소속기업</span>
                            <span style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: '1.1rem' }}>현대보안월드</span>

                            <span className="modal-label">소속매장</span>
                            <span style={{ color: '#94a3b8' }}>-</span>
                        </div>
                        <div className="profile-preview">
                            <div className="profile-img-placeholder" style={{ overflow: 'hidden' }}>
                                {profileImg ? (
                                    <img src={profileImg} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <User size={40} color="#94a3b8" />
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                                <button className="btn" style={{
                                    background: '#22d3ee', color: 'white', padding: '0.4rem 0.8rem',
                                    fontSize: '0.75rem', borderRadius: '0.25rem', display: 'flex', gap: '0.5rem', border: 'none'
                                }} onClick={() => fileInputRef.current?.click()}>
                                    <Camera size={14} /> {profileImg ? '변경' : '등록'}
                                </button>
                                {profileImg && (
                                    <button className="btn" style={{
                                        background: '#ef4444', color: 'white', padding: '0.4rem 0.8rem',
                                        fontSize: '0.75rem', borderRadius: '0.25rem', border: 'none'
                                    }} onClick={handleDeletePhoto}>
                                        삭제
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="data-card" style={{
                        padding: 0,
                        background: 'var(--bg-card)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)'
                    }}>
                        <table className="data-table" style={{ margin: 0 }}></table>
                    </div>

                    <div className="modal-form-grid" style={{ rowGap: '1rem' }}>
                        <label className="modal-label">사용계정</label>
                        <input type="text" className="modal-input" value={user?.LOGIN_ID || ''} readOnly style={{ background: 'rgba(255,255,255,0.05)', cursor: 'not-allowed', color: '#64748b' }} />

                        <label className="modal-label">사용자명</label>
                        <input type="text" className="modal-input" placeholder="사용자명을 입력해주세요." value={name} onChange={(e) => setName(e.target.value)} />

                        <label className="modal-label">비밀번호</label>
                        <input type="password" className="modal-input" placeholder="변경 시 입력 (미입력 시 유지)" value={password} onChange={(e) => setPassword(e.target.value)} />

                        <label className="modal-label">비번확인</label>
                        <input type="password" className="modal-input" placeholder="비밀번호 재입력" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

                        <label className="modal-label">이메일</label>
                        <input type="email" className="modal-input" placeholder="이메일 주소를 입력하세요." value={email} onChange={(e) => setEmail(e.target.value)} />

                        <label className="modal-label">휴대번호</label>
                        <input type="tel" className="modal-input" placeholder="휴대폰 번호를 입력하세요." value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>

                    <div className="modal-footer">
                        <button className="btn-save" onClick={handleUpdate} disabled={loading} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <Save size={18} /> {loading ? '처리 중...' : '저장'}
                        </button>
                        <button className="btn-close" onClick={onClose}>종료</button>
                    </div>
                </div>
            </div>
        </div>
    );
};



// Helper to get tab content component from ID
const getTabContent = (id: string, theme: 'light' | 'dark', closeTabById: (id: string) => void): React.ReactNode => {
    switch (id) {
        case 'today':
            return <TodayContent theme={theme} />;
        case 'realtime':
            return <RealTimeStatusContent theme={theme} />;
        case 'profile':
            return <UserInfoContent />;
        case 'basiccode':
            return <BasicCodeContent theme={theme} />;
        case 'boardmgmt':
            return <BoardManagementContent theme={theme} />;
        case 'devicemgmt':
            return <DeviceManagementContent theme={theme} />;
        case 'vendormgmt':
            return <VendorManagementContent theme={theme} />;
        case 'usermgmt':
            return <UserManagementContent theme={theme} />;
        case 'userperm':
            return <UserPermissionManagementContent theme={theme} />;
        case 'userstatus':
            return <UserStatusContent theme={theme} />;
        case 'logininfo':
            return <UserLoginInfoContent theme={theme} />;
        case 'contentsfile':
            return <ContentsFileManagementContent theme={theme} />;
        case 'adcontents':
            return <AdContentRegistrationContent theme={theme} />;
        case 'vendorstatus':
            return <VendorStatusContent theme={theme} />;
        case 'adschedule':
            return <AdScheduleSettingContent theme={theme} />;
        case 'todayapplied':
            return <TodayAppliedScheduleContent theme={theme} onClose={() => closeTabById(id)} />;
        case 'storestatus':
            return <StoreStatusContent theme={theme} onClose={() => closeTabById(id)} />;
        case 'adplaylog':
            return <AdPlayLogContent theme={theme} onClose={() => closeTabById(id)} />;
        case 'agg':
            return <ContentAggContent theme={theme} onClose={() => closeTabById(id)} />;
        case 'ble-log':
            return <BleLogAggContent theme={theme} onClose={() => closeTabById(id)} />;
        case 'monthlyplan':
            return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>월간 계획표 작성 준비 중...</div>;
        default:
            return null;
    }
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [user, setUser] = useState<any>(null);
    // 로그인 시 저장된 최근 접속일 (컴포넌트 마운트 시 1회 읽음)
    const [prevLastLogin] = useState<string | null>(() => localStorage.getItem('prev_last_login'));
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Load user info from localStorage on mount
    useEffect(() => {
        const loadUser = () => {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                setUser(JSON.parse(storedUser));
            } else {
                // Redirect if login info is missing
                navigate('/login');
            }
        };

        loadUser();

        // Listen for internal updates
        window.addEventListener('userUpdated', loadUser);
        // Listen for updates from other tabs (optional but good)
        window.addEventListener('storage', (e) => {
            if (e.key === 'user') loadUser();
        });

        return () => {
            window.removeEventListener('userUpdated', loadUser);
            window.removeEventListener('storage', loadUser);
        };
    }, []);

    // Tab Management State with Persistence
    const [tabs, setTabs] = useState<Tab[]>(() => {
        const savedTabs = localStorage.getItem('open_tabs');

        if (savedTabs) {
            try {
                const metadata = JSON.parse(savedTabs);
                if (Array.isArray(metadata) && metadata.length > 0) {
                    return metadata;
                }
            } catch (e) {
                console.error('Failed to parse saved tabs:', e);
            }
        }
        // Default initial tab
        return [{ id: 'today', title: '투데이' }];
    });

    const [activeTabId, setActiveTabId] = useState(() => {
        return localStorage.getItem('active_tab_id') || 'today';
    });

    // Save tabs metadata to localStorage
    useEffect(() => {
        const metadata = tabs.map(({ id, title }) => ({ id, title }));
        localStorage.setItem('open_tabs', JSON.stringify(metadata));
    }, [tabs]);

    // Save active tab ID to localStorage
    useEffect(() => {
        localStorage.setItem('active_tab_id', activeTabId);
    }, [activeTabId]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const openTab = (id: string, title: string) => {
        if (tabs.find(tab => tab.id === id)) {
            setActiveTabId(id);
        } else {
            setTabs([...tabs, { id, title }]);
            setActiveTabId(id);
        }
    };

    const closeTab = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (tabs.length === 1) {
            alert('최소 한 개의 탭은 열려 있어야 합니다.');
            return;
        }

        const newTabs = tabs.filter(tab => tab.id !== id);
        setTabs(newTabs);

        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    const closeTabById = (id: string) => {
        if (tabs.length === 1) {
            alert('최소 한 개의 탭은 열려 있어야 합니다.');
            return;
        }
        const newTabs = tabs.filter(tab => tab.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Theme synchronization is now handled directly in render

    return (
        <div className="dashboard-layout">
            <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />

            {/* Mobile Sidebar Overlay */}
            {isMobileSidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            <Sidebar
                activeTabId={activeTabId}
                onTabSelect={(id, title) => {
                    openTab(id, title);
                    setIsMobileSidebarOpen(false); // Close on selection
                }}
                onLogout={handleLogout}
                isMobileOpen={isMobileSidebarOpen}
                onClose={() => setIsMobileSidebarOpen(false)}
                theme={theme}
            />

            {/* Main Content */}
            <main className="main-content">
                {/* Top Header */}
                <header className="top-nav">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', width: '100%', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button
                                className="menu-toggle"
                                onClick={() => setIsMobileSidebarOpen(true)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer',
                                    display: 'none',
                                    padding: '0.5rem'
                                }}
                            >
                                <Menu size={24} />
                            </button>
                            <span className="current-time" style={{ fontWeight: 600, color: 'var(--text-main)', letterSpacing: '0.05em' }}>{formatTime(currentTime)}</span>

                            {/* Theme Toggle Button */}
                            <button
                                onClick={toggleTheme}
                                title={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
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
                                    marginLeft: '0.5rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)'}
                            >
                                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                            </button>
                        </div>
                        <div className="profile-chip" onClick={() => setIsProfileModalOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0.5rem 1rem', height: 'auto', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.1)'
                                }}>
                                    {user?.profile_img ? (
                                        <img src={user.profile_img} alt="P" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={12} />
                                    )}
                                </div>
                                <span style={{ fontWeight: 700 }}>{user ? `${user.USER_NM} / ${user.LOGIN_ID}` : 'Guest'}</span>
                            </div>
                            {prevLastLogin && (
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', paddingLeft: '1.4rem' }}>
                                    최근 접속일: {new Date(prevLastLogin).toLocaleString('ko-KR')}
                                </span>
                            )}

                        </div>
                    </div>
                </header>

                <div style={{ padding: '1.5rem' }}>
                    {/* Tab Selection Area */}
                    <div className="tabs-container">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTabId(tab.id)}
                            >
                                {tab.title}
                                <X
                                    size={18}
                                    className="tab-close-icon"
                                    onClick={(e) => closeTab(e, tab.id)}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Active Content Rendering with Keep-Alive */}
                    <div className="tab-content-inner" style={{ position: 'relative' }}>
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                style={{
                                    display: activeTabId === tab.id ? 'block' : 'none',
                                    height: '100%'
                                }}
                            >
                                {getTabContent(tab.id, theme, closeTabById)}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
