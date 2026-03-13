import { Clock, Users, User, LogOut, X, Activity, LayoutDashboard, Database, ClipboardList, FileSpreadsheet, Landmark, ShieldCheck } from 'lucide-react';
import logoDark from '../assets/joot_ams_w.png';
import logoLight from '../assets/joot_ams_b.png';

interface SidebarProps {
    activeTabId: string;
    onTabSelect: (id: string, title: string) => void;
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
                justifyContent: 'center',
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
                        onTabSelect('today', '투데이');
                    }}
                >
                    <Clock size={20} /> 투데이
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'realtime' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('realtime', '실시간 현황');
                    }}
                >
                    <Activity size={20} /> 실시간 현황
                </a>
                <a
                    href="http://www.godata.co.kr:90/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-item"
                >
                    <LayoutDashboard size={20} /> 대시보드
                </a>
                <a
                    href="http://smartgate1001.cns-link.net:7002"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-item"
                >
                    <LayoutDashboard size={20} /> 피플카운팅
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'basiccode' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('basiccode', '기초코드관리');
                    }}
                >
                    <Database size={20} /> 기초코드관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'boardmgmt' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('boardmgmt', '게시판관리');
                    }}
                >
                    <ClipboardList size={20} /> 게시판관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'devicemgmt' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('devicemgmt', '장비관리');
                    }}
                >
                    <FileSpreadsheet size={20} /> 장비관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'vendormgmt' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('vendormgmt', '거래처관리');
                    }}
                >
                    <Landmark size={20} /> 거래처관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'usermgmt' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('usermgmt', '사용자등록관리');
                    }}
                >
                    <Users size={20} /> 사용자등록관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'userperm' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('userperm', '사용자권한관리');
                    }}
                >
                    <ShieldCheck size={20} /> 사용자권한관리
                </a>
                <a
                    href="#"
                    className={`nav-item ${activeTabId === 'profile' ? 'active' : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        onTabSelect('profile', '회원정보');
                    }}
                >
                    <User size={20} /> 회원정보
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
