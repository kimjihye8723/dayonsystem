import { Users, User, LogOut, X, Activity, Database, ClipboardList, FileSpreadsheet, Landmark, ShieldCheck, BarChart2, BarChart3, Monitor, FileVideo, Calendar, CalendarDays, History as HistoryIcon } from 'lucide-react';
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
                <div className="nav-category">공통업무</div>
                <div className="nav-group">
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mgmt-primary)', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>기초코드/게시판</div>
                    <NavItem id="basiccode" icon={<Database size={18} />} label="기초코드 관리" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="boardmgmt" icon={<ClipboardList size={18} />} label="게시판 관리" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="devicemgmt" icon={<FileSpreadsheet size={18} />} label="장비관리" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="monthlyplan" icon={<Calendar size={18} />} label="월간 계획표 작성" activeId={activeTabId} onClick={onTabSelect} />
                </div>

                <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mgmt-primary)', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>사용자관리</div>
                    <NavItem id="usermgmt" icon={<Users size={18} />} label="사용자 등록관리" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="userperm" icon={<ShieldCheck size={18} />} label="사용자 권한관리" activeId={activeTabId} onClick={onTabSelect} />
                    <div className="nav-divider"></div>
                    <NavItem id="userstatus" icon={<BarChart2 size={18} />} label="사용자 현황" activeId={activeId => activeId === 'userstatus'} onClick={onTabSelect} />
                    <NavItem id="logininfo" icon={<Monitor size={18} />} label="사용자 로그인정보" activeId={activeTabId} onClick={onTabSelect} />
                </div>

                <div className="nav-category" style={{ marginTop: '1.5rem' }}>광고관리</div>
                <div className="nav-group">
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mgmt-primary)', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>기본정보</div>
                    <NavItem id="vendormgmt" icon={<Landmark size={18} />} label="거래처관리" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="contentsfile" icon={<FileVideo size={18} />} label="컨텐츠 파일 관리" activeId={activeTabId} onClick={onTabSelect} />
                    <div className="nav-divider"></div>
                    <NavItem id="vendorstatus" icon={<Landmark size={18} />} label="거래처현황" activeId={activeTabId} onClick={onTabSelect} />
                </div>

                <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mgmt-primary)', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>광고관리</div>
                    <NavItem id="adcontents" icon={<FileVideo size={18} />} label="광고 컨텐츠 등록" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="adschedule" icon={<Calendar size={18} />} label="광고 스케줄 설정" activeId={activeTabId} onClick={onTabSelect} />
                    <div className="nav-divider"></div>
                    <NavItem id="todayapplied" icon={<CalendarDays size={18} />} label="당일 적용 스케줄" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="storestatus" icon={<Monitor size={18} />} label="점포 상태 확인" activeId={activeTabId} onClick={onTabSelect} />
                </div>

                <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mgmt-primary)', borderBottom: '1px solid var(--glass-border)', background: 'var(--bg-card)' }}>광고집계</div>
                    <NavItem id="adplaylog" icon={<HistoryIcon size={18} />} label="광고송출 로그조회" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="agg" icon={<BarChart3 size={18} />} label="컨텐츠별 집계조회" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="ble-log" icon={<Activity size={18} />} label="인원 계수측정 집계" activeId={activeTabId} onClick={onTabSelect} />
                </div>

                <NavItem id="profile" icon={<User size={18} />} label="회원정보" activeId={activeTabId} onClick={onTabSelect} />
                
                <a
                    href="#"
                    className="nav-item logout-nav-item"
                    style={{ marginTop: '1rem', color: '#ef4444' }}
                    onClick={(e) => {
                        e.preventDefault();
                        onLogout();
                    }}
                >
                    <LogOut size={18} /> 로그아웃
                </a>
            </nav>
        </aside>
    );
};

const NavItem: React.FC<{ id: string; icon: React.ReactNode; label: string; activeId: string | ((id: string) => boolean); onClick: (id: string, label: string) => void }> = ({ id, icon, label, activeId, onClick }) => {
    const isActive = typeof activeId === 'function' ? activeId(id) : activeId === id;
    return (
        <a
            href="#"
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={(e) => {
                e.preventDefault();
                onClick(id, label);
            }}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
            {icon} {label}
        </a>
    );
};

export default Sidebar;
