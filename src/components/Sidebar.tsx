import React, { useState } from 'react';
import {
    Users, User, LogOut, X, Activity, Database, ClipboardList,
    FileSpreadsheet, Landmark, ShieldCheck, BarChart2, BarChart3,
    Monitor, FileVideo, Calendar, CalendarDays, History as HistoryIcon,
    ChevronDown, ChevronRight, LayoutDashboard, Video
} from 'lucide-react';
import logoDark from '../assets/joot_ams_w.png';
import logoLight from '../assets/joot_ams_b.png';
import '../styles/components/Sidebar.css';

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
    // Categories collapsed states - Default everything to true (collapsed)
    const [collapsed, setCollapsed] = useState<{ [key: string]: boolean }>({
        'common': false,
        'ad': false,
        'basic': true,
        'user': true,
        'ad_info': true,
        'ad_mgmt': true,
        'ad_agg': true
    });

    // Auto-expand section containing activeTabId
    React.useEffect(() => {
        const groups: { [key: string]: string[] } = {
            'basic': ['basiccode', 'boardmgmt', 'devicemgmt', 'cctvmgmt', 'monthlyplan'],
            'user': ['usermgmt', 'userperm', 'userstatus', 'logininfo'],
            'ad_info': ['vendormgmt', 'contentsfile', 'vendorstatus'],
            'ad_mgmt': ['adcontents', 'adschedule', 'todayapplied', 'storestatus'],
            'ad_agg': ['adplaylog', 'agg', 'ble-log']
        };

        // Find which group contains activeTabId
        for (const [groupId, items] of Object.entries(groups)) {
            if (items.includes(activeTabId)) {
                setCollapsed(prev => ({ ...prev, [groupId]: false }));
                // Also ensure the parent category is open
                if (['basic', 'user'].includes(groupId)) {
                    setCollapsed(prev => ({ ...prev, 'common': false }));
                } else if (['ad_info', 'ad_mgmt', 'ad_agg'].includes(groupId)) {
                    setCollapsed(prev => ({ ...prev, 'ad': false }));
                }
                break;
            }
        }
    }, [activeTabId]);

    const toggleSection = (id: string) => {
        setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const renderChevron = (id: string) => {
        return collapsed[id] ? <ChevronRight size={16} /> : <ChevronDown size={16} />;
    };

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
                        display: 'none'
                    }}
                >
                    <X size={24} />
                </button>
            </div>
            <nav className="sidebar-nav">
                <div style={{ paddingBottom: '1rem' }}>
                    <NavItem id="today" icon={<BarChart3 size={18} />} label="투데이" activeId={activeTabId} onClick={onTabSelect} />
                    <NavItem id="realtime" icon={<Activity size={18} />} label="실시간 현황" activeId={activeTabId} onClick={onTabSelect} />
                    <a
                        href="http://www.godata.co.kr:90/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-item"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                        <LayoutDashboard size={18} /> 대시보드
                    </a>
                    <a
                        href="http://smartgate1001.cns-link.net:7002"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nav-item"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                        <LayoutDashboard size={18} /> 피플카운팅
                    </a>
                </div>

                <div className="nav-category" onClick={() => toggleSection('common')}>
                    공통업무 {renderChevron('common')}
                </div>
                {!collapsed['common'] && (
                    <>
                        <div className="nav-group">
                            <div className="nav-group-header" onClick={() => toggleSection('basic')}>
                                기초코드/게시판 {renderChevron('basic')}
                            </div>
                            {!collapsed['basic'] && (
                                <>
                                    <NavItem id="basiccode" icon={<Database size={18} />} label="기초코드 관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="boardmgmt" icon={<ClipboardList size={18} />} label="게시판 관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="devicemgmt" icon={<FileSpreadsheet size={18} />} label="장비관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="cctvmgmt" icon={<Video size={18} />} label="CCTV 관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="monthlyplan" icon={<Calendar size={18} />} label="월간 계획표 작성" activeId={activeTabId} onClick={onTabSelect} />
                                </>
                            )}
                        </div>

                        <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                            <div className="nav-group-header" onClick={() => toggleSection('user')}>
                                사용자관리 {renderChevron('user')}
                            </div>
                            {!collapsed['user'] && (
                                <>
                                    <NavItem id="usermgmt" icon={<Users size={18} />} label="사용자 등록관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="userperm" icon={<ShieldCheck size={18} />} label="사용자 권한관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="userstatus" icon={<BarChart2 size={18} />} label="사용자 현황" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="logininfo" icon={<Monitor size={18} />} label="사용자 로그인정보" activeId={activeTabId} onClick={onTabSelect} />
                                </>
                            )}
                        </div>
                    </>
                )}

                <div className="nav-category" style={{ marginTop: '1.5rem' }} onClick={() => toggleSection('ad')}>
                    광고관리 {renderChevron('ad')}
                </div>
                {!collapsed['ad'] && (
                    <>
                        <div className="nav-group">
                            <div className="nav-group-header" onClick={() => toggleSection('ad_info')}>
                                기본정보 {renderChevron('ad_info')}
                            </div>
                            {!collapsed['ad_info'] && (
                                <>
                                    <NavItem id="vendormgmt" icon={<Landmark size={18} />} label="거래처관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="contentsfile" icon={<FileVideo size={18} />} label="컨텐츠 파일 관리" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="vendorstatus" icon={<Landmark size={18} />} label="거래처현황" activeId={activeTabId} onClick={onTabSelect} />
                                </>
                            )}
                        </div>

                        <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                            <div className="nav-group-header" onClick={() => toggleSection('ad_mgmt')}>
                                광고관리 {renderChevron('ad_mgmt')}
                            </div>
                            {!collapsed['ad_mgmt'] && (
                                <>
                                    <NavItem id="adcontents" icon={<FileVideo size={18} />} label="광고 컨텐츠 등록" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="adschedule" icon={<Calendar size={18} />} label="광고 스케줄 설정" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="todayapplied" icon={<CalendarDays size={18} />} label="당일 적용 스케줄" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="storestatus" icon={<Monitor size={18} />} label="점포 상태 확인" activeId={activeTabId} onClick={onTabSelect} />
                                </>
                            )}
                        </div>

                        <div className="nav-group" style={{ marginTop: '0.5rem' }}>
                            <div className="nav-group-header" onClick={() => toggleSection('ad_agg')}>
                                광고집계 {renderChevron('ad_agg')}
                            </div>
                            {!collapsed['ad_agg'] && (
                                <>
                                    <NavItem id="adplaylog" icon={<HistoryIcon size={18} />} label="광고송출 로그조회" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="agg" icon={<BarChart3 size={18} />} label="컨텐츠별 집계조회" activeId={activeTabId} onClick={onTabSelect} />
                                    <NavItem id="ble-log" icon={<Activity size={18} />} label="인원 계수측정 집계" activeId={activeTabId} onClick={onTabSelect} />
                                </>
                            )}
                        </div>
                    </>
                )}

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
