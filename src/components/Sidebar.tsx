import React from 'react';
import { Clock, Users, LogOut, X } from 'lucide-react';
import logoDark from '../assets/logo_godata.png';
import logoLight from '../assets/logo_godata_light.png';
import TodayContent from './partials/TodayContent';
import UserInfoContent from './partials/UserInfoContent';

interface SidebarProps {
    activeTabId: string;
    onTabSelect: (id: string, title: string, content: React.ReactNode) => void;
    onLogout: () => void;
    isMobileOpen?: boolean;
    onClose?: () => void;
    theme: 'light' | 'dark';
}

const Sidebar: React.FC<SidebarProps> = ({
    activeTabId,
    onTabSelect,
    onLogout,
    isMobileOpen,
    onClose,
    theme
}) => {
    return (
        <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.5rem 1rem',
                marginBottom: '1rem'
            }}>
                <img src={theme === 'light' ? logoLight : logoDark} alt="GODATA" style={{ height: '60px', objectFit: 'contain' }} />
                <button
                    className="sidebar-close"
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        display: 'none' // Shown via media query
                    }}
                >
                    <X size={24} />
                </button>
            </div>
            <nav className="sidebar-nav">
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'today' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('today', '투데이', <TodayContent theme={theme} />);
                    }}
                >
                    <Clock size={20} /> 투데이
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'profile' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('profile', '회원정보', <UserInfoContent />);
                    }}
                >
                    <Users size={20} /> 회원정보
                </a>
                <a
                    href="#"
                    className="nav-item"
                    style={{ marginTop: '2rem', color: '#ef4444' }}
                    onClick={(e) => {
                        e.preventDefault();
                        onLogout();
                    }}
                >
                    <LogOut size={20} /> 로그아웃
                </a>
            </nav>
        </aside>
    );
};

export default Sidebar;
