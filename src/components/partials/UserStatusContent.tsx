import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, RefreshCw, Search, Printer, FileSpreadsheet, X
} from 'lucide-react';
import axios from 'axios';
import './UserStatusContent.css';

interface UserStatusItem {
    USER_ID: string;
    USER_NM: string;
    REGISTDT: string;
    IPSA_DT: string;
    EXPIRE_DT: string;
    DEPT_NM: string;
    TEAM_NM: string;
    POSITION_NM: string;
    DUTY_NM: string;
    USER_TEL: string;
    USER_HP: string;
    USER_EMAIL: string;
    BIRTH_DT: string;
    MARRIED_DT: string;
    ADDRESS_HDR: string;
    ADDRESS_DTL: string;
    REMARK: string;
    PRINT_SELECTED?: boolean;
}

interface PcAuthItem {
    ALLOW_YN: boolean;
    DISK_INFO: string;
    MAC_ADDR: string;
    REMARK: string;
    REGISTDT: string;
    MODIFYDT: string;
}

interface UserCardItem {
    CARD_NO: string;
    CARD_NM: string;
    CARD_COMPANY: string;
    CARD_TYPE: string;
    EXPIRE_DT: string;
    CARDGIVE_DT: string;
    COLLECT_DT: string;
    REMARK: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const UserStatusContent: React.FC<Props> = ({ theme }) => {
    const [userItems, setUserItems] = useState<UserStatusItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [pcAuthItems, setPcAuthItems] = useState<PcAuthItem[]>([]);
    const [cardItems, setCardItems] = useState<UserCardItem[]>([]);
    const [deptList, setDeptList] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [filterTyp, setFilterTyp] = useState('');
    const [filterDept, setFilterDept] = useState('');
    const [filterNm, setFilterNm] = useState('');

    const fetchUserStatus = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/user-status', {
                params: {
                    startDate,
                    endDate,
                    userTyp: filterTyp,
                    deptCd: filterDept,
                    userNm: filterNm
                }
            });
            if (response.data.success) {
                setUserItems(response.data.users);
            }
        } catch (error) {
            console.error('Fetch user status error:', error);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, filterTyp, filterDept, filterNm]);

    useEffect(() => {
        const fetchDepts = async () => {
            try {
                const res = await axios.get('/api/basic-codes', { params: { groupCd: 'DP001' } });
                if (res.data.success) setDeptList(res.data.codes);
            } catch (e) {
                console.error('Fetch depts error:', e);
            }
        };
        fetchDepts();
    }, []);

    useEffect(() => {
        fetchUserStatus();
    }, [fetchUserStatus]);

    const handleUserSelect = async (userId: string) => {
        setSelectedUserId(userId);
        try {
            // Fetch PC Auth & Cards
            const [pcRes, cardRes] = await Promise.all([
                axios.get(`/api/user-pc-auth/${userId}`),
                axios.get(`/api/users/${userId}/details`)
            ]);

            if (pcRes.data.success) {
                setPcAuthItems(pcRes.data.pcAuth);
            }
            if (cardRes.data.success) {
                setCardItems(cardRes.data.cards || []);
            }
        } catch (error) {
            console.error('Fetch user details error:', error);
        }
    };

    const togglePrintSelection = (idx: number) => {
        const newItems = [...userItems];
        newItems[idx].PRINT_SELECTED = !newItems[idx].PRINT_SELECTED;
        setUserItems(newItems);
    };

    const handleExportExcel = () => {
        alert('엑셀 출력 기능은 구현 준비 중입니다.');
    };

    const handlePrint = () => {
        alert('조회된 데이터 출력 기능은 구현 준비 중입니다.');
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card bc-toolbar-card" style={{ marginBottom: '1rem' }}>
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Users size={20} color="var(--mgmt-primary)" />
                        <span className="vm-title-text">사용자 현황</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <button className="mgmt-toolbar-btn mgmt-btn-secondary" onClick={fetchUserStatus}><RefreshCw size={16} /> 새로고침(F2)</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={fetchUserStatus}>
                            <Search size={16} className={loading ? 'animate-spin' : ''} /> 조회(F3)
                        </button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={handlePrint}><Printer size={16} /> 출력(F6)</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-success" onClick={handleExportExcel}><FileSpreadsheet size={16} /> 엑셀(F7)</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-danger"><X size={16} /> 창닫기</button>
                    </div>
                </div>
            </div>

            {/* Filter Area */}
            <div className="mgmt-card perm-filter-bar">
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input className="mgmt-input perm-filter-input-small" defaultValue="JOOT AMS" readOnly />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">입사일자</span>
                    <div className="mgmt-btn-group" style={{ gap: '5px' }}>
                        <input type="date" className="mgmt-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '130px' }} />
                        <span style={{ color: 'var(--text-main)' }}>~</span>
                        <input type="date" className="mgmt-input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '130px' }} />
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">부서</span>
                    <select
                        className="mgmt-select perm-filter-select-medium"
                        value={filterDept}
                        onChange={e => setFilterDept(e.target.value)}
                    >
                        <option value="">전체</option>
                        {deptList.map(dept => (
                            <option key={dept.CODE_CD} value={dept.CODE_CD}>{dept.CODE_NM}</option>
                        ))}
                    </select>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">사용자구분</span>
                    <select
                        className="mgmt-select perm-filter-select-medium"
                        value={filterTyp}
                        onChange={e => setFilterTyp(e.target.value)}
                    >
                        <option value="">전체</option>
                        <option value="M">일반사용자</option>
                        <option value="A">사용자관리자</option>
                        <option value="S">시스템관리자</option>
                    </select>
                </div>
                <div className="perm-filter-item" style={{ flex: 1 }}>
                    <span className="mgmt-label perm-filter-label">이름</span>
                    <input
                        className="mgmt-input perm-filter-search-input"
                        placeholder="이름 또는 ID..."
                        value={filterNm}
                        onChange={e => setFilterNm(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && fetchUserStatus()}
                    />
                </div>
            </div>

            {/* Matrix Layout */}
            <div className="perm-layout-container status-layout-variant">

                {/* Top Grid: User Info */}
                <div className="mgmt-card status-card-user-info">
                    <div className="vm-subgrid-header">사용자 정보 [{userItems.length}건]</div>
                    <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1, overflow: 'scroll', maxWidth: '1600px', maxHeight: '350px' }}>
                        <table className="mgmt-table perm-table-sticky status-table-scroll">
                            <thead>
                                <tr>
                                    <th style={{ width: '30px', whiteSpace: 'nowrap' }}>±</th>
                                    <th style={{ width: '80px', whiteSpace: 'nowrap' }}>출력선택</th>
                                    <th style={{ width: '120px', whiteSpace: 'nowrap' }}>사용자ID</th>
                                    <th style={{ width: '130px', whiteSpace: 'nowrap' }}>사용자명</th>
                                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>등록일자</th>
                                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>입사일자</th>
                                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>퇴사일자</th>
                                    <th style={{ width: '150px', whiteSpace: 'nowrap' }}>부서</th>
                                    <th style={{ width: '150px', whiteSpace: 'nowrap' }}>팀</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>직위</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>직책</th>
                                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>전화번호</th>
                                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>핸드폰</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>E-MAIL</th>
                                    <th style={{ width: '130px', whiteSpace: 'nowrap' }}>생일</th>
                                    <th style={{ width: '130px', whiteSpace: 'nowrap' }}>결혼기념일</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>주소기본</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>주소상세</th>
                                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userItems.length > 0 ? (
                                    userItems.map((item, idx) => (
                                        <tr
                                            key={item.USER_ID}
                                            className={`vm-row ${selectedUserId === item.USER_ID ? 'selected' : ''}`}
                                            onClick={() => handleUserSelect(item.USER_ID)}
                                        >
                                            <td>+</td>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={!!item.PRINT_SELECTED}
                                                    onChange={() => togglePrintSelection(idx)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </td>
                                            <td title={item.USER_ID}>{item.USER_ID}</td>
                                            <td className="vm-cell-highlight" title={item.USER_NM}>{item.USER_NM}</td>
                                            <td title={item.REGISTDT}>{item.REGISTDT}</td>
                                            <td title={item.IPSA_DT}>{item.IPSA_DT}</td>
                                            <td title={item.EXPIRE_DT}>{item.EXPIRE_DT}</td>
                                            <td title={item.DEPT_NM}>{item.DEPT_NM}</td>
                                            <td title={item.TEAM_NM}>{item.TEAM_NM}</td>
                                            <td title={item.POSITION_NM}>{item.POSITION_NM}</td>
                                            <td title={item.DUTY_NM}>{item.DUTY_NM}</td>
                                            <td title={item.USER_TEL}>{item.USER_TEL}</td>
                                            <td title={item.USER_HP}>{item.USER_HP}</td>
                                            <td title={item.USER_EMAIL}>{item.USER_EMAIL}</td>
                                            <td title={item.BIRTH_DT}>{item.BIRTH_DT}</td>
                                            <td title={item.MARRIED_DT}>{item.MARRIED_DT}</td>
                                            <td title={item.ADDRESS_HDR}>{item.ADDRESS_HDR}</td>
                                            <td title={item.ADDRESS_DTL}>{item.ADDRESS_DTL}</td>
                                            <td title={item.REMARK}>{item.REMARK}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={19} className="vm-cell-empty">데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Bottom Row split */}
                <div className="perm-grid-row perm-bottom-row" style={{ height: '35%', minHeight: '280px' }}>

                    {/* PC Auth Grid */}
                    <div className="mgmt-card perm-card-pc-auth">
                        <div className="vm-subgrid-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>접속정보관리</span>
                        </div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1, overflow: 'scroll', maxWidth: '800px', maxHeight: '250px' }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>±</th>
                                        <th style={{ width: '100px', whiteSpace: 'nowrap' }}>접속허가여부</th>
                                        <th style={{ minWidth: '100px' }}>디스크정보</th>
                                        <th style={{ minWidth: '150px' }}>맥주소</th>
                                        <th style={{ minWidth: '100px' }}>비고</th>
                                        <th style={{ width: '150px', whiteSpace: 'nowrap' }}>등록일시</th>
                                        <th style={{ width: '150px', whiteSpace: 'nowrap' }}>수정일시</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pcAuthItems.length > 0 ? (
                                        pcAuthItems.map((pc, i) => (
                                            <tr key={i} className="vm-row">
                                                <td style={{ textAlign: 'center' }}>+</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input type="checkbox" checked={!!pc.ALLOW_YN} readOnly />
                                                </td>
                                                <td title={pc.DISK_INFO}>{pc.DISK_INFO}</td>
                                                <td title={pc.MAC_ADDR}>{pc.MAC_ADDR}</td>
                                                <td title={pc.REMARK}>{pc.REMARK}</td>
                                                <td style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={pc.REGISTDT}>{pc.REGISTDT}</td>
                                                <td style={{ fontSize: '11px', color: 'var(--text-muted)' }} title={pc.MODIFYDT}>{pc.MODIFYDT}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={7} className="vm-cell-empty">조회된 접속 정보가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Card Grid */}
                    <div className="mgmt-card perm-card-program-perm">
                        <div className="vm-subgrid-header">사용자 카드관리</div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1, overflow: 'scroll', maxWidth: '800px', maxHeight: '250px' }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>±</th>
                                        <th style={{ width: '150px', whiteSpace: 'nowrap' }}>카드번호</th>
                                        <th style={{ minWidth: '150px', whiteSpace: 'nowrap' }}>카드명</th>
                                        <th style={{ minWidth: '150px', whiteSpace: 'nowrap' }}>카드사</th>
                                        <th style={{ width: '80px', whiteSpace: 'nowrap' }}>종류</th>
                                        <th style={{ width: '120px', whiteSpace: 'nowrap' }}>유효일</th>
                                        <th style={{ width: '120px', whiteSpace: 'nowrap' }}>카드 지급일</th>
                                        <th style={{ width: '120px', whiteSpace: 'nowrap' }}>카드 회수일</th>
                                        <th style={{ minWidth: '200px', whiteSpace: 'nowrap' }}>적요</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cardItems.length > 0 ? (
                                        cardItems.map((c, i) => (
                                            <tr key={i} className="vm-row">
                                                <td style={{ textAlign: 'center' }}>+</td>
                                                <td>{c.CARD_NO}</td>
                                                <td>{c.CARD_NM}</td>
                                                <td>{c.CARD_COMPANY}</td>
                                                <td>{c.CARD_TYPE}</td>
                                                <td>{c.EXPIRE_DT}</td>
                                                <td>{c.CARDGIVE_DT}</td>
                                                <td>{c.COLLECT_DT}</td>
                                                <td>{c.REMARK}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={9} className="vm-cell-empty">조회된 카드 정보가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default UserStatusContent;
