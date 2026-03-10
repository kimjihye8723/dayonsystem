import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, Search, RefreshCw, Save, Trash2, Plus,
    UserPlus, X
} from 'lucide-react';
import axios from 'axios';
import './UserManagementContent.css';

// --- Interfaces (이미지 항목 기준 확장) ---
interface UserItem {
    USER_ID: string;
    USER_NM: string;
    REMARK?: string;
    LOGIN_ID?: string;
    USER_HP?: string;
    USER_TYP?: string;
    DEPT_CD?: string;
    POSITION_CD?: string;
}

interface UserHeader {
    USER_ID: string;
    LOGIN_ID: string;
    USER_NM: string;
    USER_TYP: string;
    PASSWORD_NO: string;
    JUMIN_NO: string;
    IPSA_DT: string;
    EXPIRE_DT: string;
    DEPT_CD: string;
    TEAM_CD: string;
    POSITION_CD: string;
    DUTY_CD: string;
    USER_HP: string;
    USER_TEL: string;
    USER_EMAIL: string;
    BIRTH_DT: string;
    MARRIED_DT: string;
    SORT_SEQ: string;
    EMAIL_ID: string;
    EMAIL_PW: string;
    PROPERTY_01: string; // 노인단가구분
    POPUP_YN: string;
    SERVICE_USEYN: string;
    LINK_ID: string;
    INCENTIVE_RAT: string;
    ACCOUNT_CD: string; // 은행
    ACCOUNT_NO: string; // 계좌번호
    ACCOUNT_NM: string; // 예금주
    ADDRESS_HDR: string;
    REMARK: string;
}

interface UserVendor {
    VENDOR_CD: string;
    VENDOR_NM?: string;
    isNew?: boolean;
}

interface UserCard {
    CARD_NO: string;
    CARDGIVE_DT: string;
    CARD_NM: string;      // PROPERTY_01
    CARD_COMPANY: string; // PROPERTY_02
    CARD_TYPE: string;    // PROPERTY_03
    EXPIRE_DT: string;    // PROPERTY_04
    COLLECT_DT: string;
    REMARK: string;
    isNew?: boolean;
}

interface Props {
    theme: 'light' | 'dark';
}

const UserManagementContent: React.FC<Props> = ({ theme }) => {
    const [userList, setUserList] = useState<UserItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [header, setHeader] = useState<UserHeader>({
        USER_ID: '', LOGIN_ID: '', USER_NM: '', USER_TYP: '1', PASSWORD_NO: '',
        JUMIN_NO: '', IPSA_DT: '', EXPIRE_DT: '', DEPT_CD: '', TEAM_CD: '',
        POSITION_CD: '', DUTY_CD: '', USER_HP: '', USER_TEL: '', USER_EMAIL: '',
        BIRTH_DT: '', MARRIED_DT: '', SORT_SEQ: '0', EMAIL_ID: '', EMAIL_PW: '',
        PROPERTY_01: '', POPUP_YN: 'N', SERVICE_USEYN: 'N', LINK_ID: '',
        INCENTIVE_RAT: '0', ACCOUNT_CD: '', ACCOUNT_NO: '', ACCOUNT_NM: '',
        ADDRESS_HDR: '', REMARK: ''
    });
    const [vendors, setVendors] = useState<UserVendor[]>([]);
    const [cards, setCards] = useState<UserCard[]>([]);

    const [filterTyp, setFilterTyp] = useState('');
    const [filterNm, setFilterNm] = useState('');
    const [filterHp, setFilterHp] = useState('');

    const fetchUserList = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/users', {
                params: { userTyp: filterTyp, userNm: filterNm, userHp: filterHp }
            });
            if (response.data.success) setUserList(response.data.users);
        } catch (error) {
            console.error('Fetch users error:', error);
        } finally {
            setLoading(false);
        }
    }, [filterTyp, filterNm, filterHp]);

    useEffect(() => { fetchUserList(); }, [fetchUserList]);

    const fetchUserDetails = async (userId: string) => {
        try {
            setLoading(true);
            const response = await axios.get(`/api/users/${userId}/details`);
            if (response.data.success) {
                // 백엔드 PROPERTY 컬럼을 프론트 인터페이스에 매핑
                const head = response.data.header;
                setHeader({ ...head });

                const dbCards = (response.data.cards || []).map((c: any) => ({
                    ...c,
                    CARD_NM: c.PROPERTY_01 || '',
                    CARD_COMPANY: c.PROPERTY_02 || '',
                    CARD_TYPE: c.PROPERTY_03 || '',
                    EXPIRE_DT: c.PROPERTY_04 || ''
                }));
                setCards(dbCards);
                setVendors(response.data.vendors || []);
                setSelectedUserId(userId);
            }
        } catch (error) {
            console.error('Fetch user details error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setSelectedUserId(null);
        setHeader({
            USER_ID: '', LOGIN_ID: '', USER_NM: '', USER_TYP: '1', PASSWORD_NO: '',
            JUMIN_NO: '', IPSA_DT: '', EXPIRE_DT: '', DEPT_CD: '', TEAM_CD: '',
            POSITION_CD: '', DUTY_CD: '', USER_HP: '', USER_TEL: '', USER_EMAIL: '',
            BIRTH_DT: '', MARRIED_DT: '', SORT_SEQ: '0', EMAIL_ID: '', EMAIL_PW: '',
            PROPERTY_01: '', POPUP_YN: 'N', SERVICE_USEYN: 'N', LINK_ID: '',
            INCENTIVE_RAT: '0', ACCOUNT_CD: '', ACCOUNT_NO: '', ACCOUNT_NM: '',
            ADDRESS_HDR: '', REMARK: ''
        });
        setVendors([]);
        setCards([]);
    };

    const handleHeaderChange = (field: keyof UserHeader, value: any) => {
        setHeader(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!header.USER_ID || !header.USER_NM) {
            alert('사번과 사용자명은 필수입니다.');
            return;
        }
        try {
            setLoading(true);
            const response = await axios.post('/api/users/save', { header, vendors, cards });
            if (response.data.success) {
                alert('저장되었습니다.');
                fetchUserList();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || '저장 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleCardChange = (idx: number, field: keyof UserCard, value: string) => {
        const newCards = [...cards];
        newCards[idx] = { ...newCards[idx], [field]: value };
        setCards(newCards);
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card bc-toolbar-card" style={{ marginBottom: '1rem' }}>
                <div className="mgmt-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', borderRadius: '0.5rem' }}>
                            <Users size={20} color="var(--mgmt-primary)" />
                        </div>
                        <span className="bc-title-text" style={{ fontSize: '1.2rem', fontWeight: 800 }}>사용자 등록 관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <button className="mgmt-toolbar-btn mgmt-btn-secondary" onClick={fetchUserList}><RefreshCw size={16} /> 새로고침</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={fetchUserList}>
                            <Search size={16} className={loading ? 'animate-spin' : ''} /> 조회(F3)
                        </button>
                        <button className="mgmt-toolbar-btn mgmt-btn-success" onClick={handleReset}><UserPlus size={16} /> 신규등록</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={handleSave}><Save size={16} /> 저장(F4)</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-danger" onClick={() => { }} disabled={!selectedUserId}><Trash2 size={16} /> 삭제</button>
                    </div>
                </div>
            </div>

            <div className="um-main-layout">
                {/* Left Sidebar */}
                <div className="um-sidebar">
                    <div className="mgmt-card um-sidebar-filter" style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className="mgmt-field"><label className="mgmt-label">사용자구분</label>
                                <select className="mgmt-select" value={filterTyp} onChange={e => setFilterTyp(e.target.value)}>
                                    <option value="">전체</option><option value="1">일반사용자</option><option value="S">관리자</option>
                                </select>
                            </div>
                            <div className="mgmt-field"><label className="mgmt-label">사용자명</label>
                                <input className="mgmt-input" value={filterNm} onChange={e => setFilterNm(e.target.value)} />
                            </div>
                            <div className="mgmt-field"><label className="mgmt-label">전화번호</label>
                                <input className="mgmt-input" value={filterHp} onChange={e => setFilterHp(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="mgmt-card um-sidebar-list-card">
                        <div className="um-user-table-wrapper">
                            <table className="data-table">
                                <thead><tr><th>사용자ID</th><th>사용자명</th><th>비고</th></tr></thead>
                                <tbody>
                                    {userList.map(item => (
                                        <tr key={item.USER_ID} className={selectedUserId === item.USER_ID ? 'um-row-selected' : ''} onClick={() => fetchUserDetails(item.USER_ID)}>
                                            <td style={{ textAlign: 'center' }}>{item.USER_ID}</td>
                                            <td>{item.USER_NM}</td>
                                            <td>{item.REMARK}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="um-detail-container">
                    <div className="mgmt-card um-form-section" style={{ padding: '1.5rem' }}>

                        {/* 이미지와 동일한 3열 레이아웃 */}
                        <div className="um-input-group" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            {/* Row 1 */}
                            <div className="um-field"><label className="um-field-label">사번</label>
                                <input className="mgmt-input" value={header.USER_ID} onChange={e => handleHeaderChange('USER_ID', e.target.value)} disabled={!!selectedUserId} />
                            </div>
                            <div className="um-field"><label className="um-field-label">사용자구분</label>
                                <select className="mgmt-select" value={header.USER_TYP} onChange={e => handleHeaderChange('USER_TYP', e.target.value)}>
                                    <option value="1">일반사용자</option><option value="S">관리자</option>
                                </select>
                            </div>
                            <div className="um-field"><label className="um-field-label">로그인ID</label>
                                <input className="mgmt-input" value={header.LOGIN_ID} onChange={e => handleHeaderChange('LOGIN_ID', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">EMAILID</label>
                                <input className="mgmt-input" value={header.EMAIL_ID} onChange={e => handleHeaderChange('EMAIL_ID', e.target.value)} />
                            </div>

                            {/* Row 2 */}
                            <div className="um-field"><label className="um-field-label red-label">사용자명</label>
                                <input className="mgmt-input" value={header.USER_NM} onChange={e => handleHeaderChange('USER_NM', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">비밀번호</label>
                                <input type="password" className="mgmt-input" value={header.PASSWORD_NO} onChange={e => handleHeaderChange('PASSWORD_NO', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">EMAIL비밀번호</label>
                                <input type="password" className="mgmt-input" value={header.EMAIL_PW} onChange={e => handleHeaderChange('EMAIL_PW', e.target.value)} />
                            </div>

                            {/* Row 3 */}
                            <div className="um-field"><label className="um-field-label red-label">입사일자</label>
                                <input type="date" className="mgmt-input" value={header.IPSA_DT ? `${header.IPSA_DT.slice(0, 4)}-${header.IPSA_DT.slice(4, 6)}-${header.IPSA_DT.slice(6, 8)}` : ''} onChange={e => handleHeaderChange('IPSA_DT', e.target.value.replace(/-/g, ''))} />
                            </div>
                            <div className="um-field"><label className="um-field-label">주민번호</label>
                                <input className="mgmt-input" value={header.JUMIN_NO} onChange={e => handleHeaderChange('JUMIN_NO', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">노인단가구분</label>
                                <select className="mgmt-select" value={header.PROPERTY_01} onChange={e => handleHeaderChange('PROPERTY_01', e.target.value)}>
                                    <option value="">-</option><option value="1">구분1</option>
                                </select>
                            </div>

                            {/* Row 4 */}
                            <div className="um-field"><label className="um-field-label">부서</label>
                                <input className="mgmt-input" value={header.DEPT_CD} onChange={e => handleHeaderChange('DEPT_CD', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">퇴사일자</label>
                                <input type="date" className="mgmt-input" value={header.EXPIRE_DT ? `${header.EXPIRE_DT.slice(0, 4)}-${header.EXPIRE_DT.slice(4, 6)}-${header.EXPIRE_DT.slice(6, 8)}` : ''} onChange={e => handleHeaderChange('EXPIRE_DT', e.target.value.replace(/-/g, ''))} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="checkbox" checked={header.POPUP_YN === 'Y'} onChange={e => handleHeaderChange('POPUP_YN', e.target.checked ? 'Y' : 'N')} /> 팝업리스트 조회 가능
                                </label>
                                <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="checkbox" checked={header.SERVICE_USEYN === 'Y'} onChange={e => handleHeaderChange('SERVICE_USEYN', e.target.checked ? 'Y' : 'N')} /> 백서비스 직동여부
                                </label>
                            </div>

                            {/* Row 5 */}
                            <div className="um-field"><label className="um-field-label">팀</label>
                                <input className="mgmt-input" value={header.TEAM_CD} onChange={e => handleHeaderChange('TEAM_CD', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">직책</label>
                                <input className="mgmt-input" value={header.DUTY_CD} onChange={e => handleHeaderChange('DUTY_CD', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">연결사용자ID</label>
                                <input className="mgmt-input" value={header.LINK_ID} onChange={e => handleHeaderChange('LINK_ID', e.target.value)} />
                            </div>

                            {/* Row 6 */}
                            <div className="um-field"><label className="um-field-label">핸드폰</label>
                                <input className="mgmt-input" value={header.USER_HP} onChange={e => handleHeaderChange('USER_HP', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">전화번호</label>
                                <input className="mgmt-input" value={header.USER_TEL} onChange={e => handleHeaderChange('USER_TEL', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">인센티브지급율</label>
                                <input className="mgmt-input" value={header.INCENTIVE_RAT} onChange={e => handleHeaderChange('INCENTIVE_RAT', e.target.value)} />
                            </div>

                            {/* Row 7 */}
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">이메일</label>
                                <input className="mgmt-input" value={header.USER_EMAIL} onChange={e => handleHeaderChange('USER_EMAIL', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">출력순서</label>
                                <input className="mgmt-input" value={header.SORT_SEQ} onChange={e => handleHeaderChange('SORT_SEQ', e.target.value)} />
                            </div>

                            {/* Row 8 */}
                            <div className="um-field"><label className="um-field-label">생년월일</label>
                                <input type="date" className="mgmt-input" value={header.BIRTH_DT ? `${header.BIRTH_DT.slice(0, 4)}-${header.BIRTH_DT.slice(4, 6)}-${header.BIRTH_DT.slice(6, 8)}` : ''} onChange={e => handleHeaderChange('BIRTH_DT', e.target.value.replace(/-/g, ''))} />
                            </div>
                            <div className="um-field"><label className="um-field-label">결혼기념일</label>
                                <input type="date" className="mgmt-input" value={header.MARRIED_DT ? `${header.MARRIED_DT.slice(0, 4)}-${header.MARRIED_DT.slice(4, 6)}-${header.MARRIED_DT.slice(6, 8)}` : ''} onChange={e => handleHeaderChange('MARRIED_DT', e.target.value.replace(/-/g, ''))} />
                            </div>

                            {/* Row 9 - 계좌 */}
                            <div className="um-field"><label className="um-field-label">은행계좌</label>
                                <input className="mgmt-input" value={header.ACCOUNT_CD} onChange={e => handleHeaderChange('ACCOUNT_CD', e.target.value)} />
                            </div>
                            <div className="um-field"><label className="um-field-label">계좌번호</label>
                                <input className="mgmt-input" value={header.ACCOUNT_NO} onChange={e => handleHeaderChange('ACCOUNT_NO', e.target.value)} />
                            </div>
                            <div className="um-field" style={{ gridColumn: 'span 2' }}><label className="um-field-label">예금주</label>
                                <input className="mgmt-input" value={header.ACCOUNT_NM} onChange={e => handleHeaderChange('ACCOUNT_NM', e.target.value)} />
                            </div>

                            {/* Row 10 - 주소 */}
                            <div className="um-field" style={{ gridColumn: 'span 4' }}><label className="um-field-label">주소</label>
                                <input className="mgmt-input" value={header.ADDRESS_HDR} onChange={e => handleHeaderChange('ADDRESS_HDR', e.target.value)} />
                            </div>

                            {/* Row 11 - 비고 */}
                            <div className="um-field" style={{ gridColumn: 'span 4' }}><label className="um-field-label">비고</label>
                                <textarea className="mgmt-input" rows={3} value={header.REMARK} onChange={e => handleHeaderChange('REMARK', e.target.value)} style={{ resize: 'none' }}></textarea>
                            </div>
                        </div>
                    </div>

                    {/* Sub Tables */}
                    <div className="um-sub-tables-grid">
                        <div className="mgmt-card um-sub-table-card">
                            <div className="um-sub-table-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div className="um-section-bar" style={{ height: '14px' }} />
                                    <span className="um-sub-table-title">담당거래처</span>
                                </div>
                                <button className="bc-delete-btn" onClick={() => setVendors([...vendors, { VENDOR_CD: '', VENDOR_NM: '', isNew: true }])}><Plus size={18} /></button>
                            </div>
                            <div className="um-user-table-wrapper">
                                <table className="data-table um-table-compact">
                                    <thead><tr><th>선택</th><th>거래처코드</th><th>거래처명</th><th></th></tr></thead>
                                    <tbody>
                                        {vendors.map((v, i) => (
                                            <tr key={i}>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked /></td>
                                                <td><input className="bc-table-input" value={v.VENDOR_CD} onChange={e => {
                                                    const ns = [...vendors]; ns[i].VENDOR_CD = e.target.value; setVendors(ns);
                                                }} /></td>
                                                <td><input className="bc-table-input" value={v.VENDOR_NM} readOnly /></td>
                                                <td><button className="bc-delete-btn" onClick={() => setVendors(vendors.filter((_, idx) => idx !== i))}><X size={14} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="data-card um-sub-table-card">
                            <div className="um-sub-table-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div className="um-section-bar" style={{ height: '14px' }} />
                                    <span className="um-sub-table-title">사용자 카드관리</span>
                                </div>
                                <button className="bc-delete-btn" onClick={() => setCards([...cards, { CARD_NO: '', CARDGIVE_DT: '', CARD_NM: '', CARD_COMPANY: '', CARD_TYPE: '', EXPIRE_DT: '', COLLECT_DT: '', REMARK: '', isNew: true }])}><Plus size={18} /></button>
                            </div>
                            <div className="um-user-table-wrapper">
                                <table className="data-table um-table-compact">
                                    <thead><tr><th>카드번호</th><th>지급일</th><th>카드명</th><th>카드사</th><th>종류</th><th>유효일</th><th>회수일</th><th></th></tr></thead>
                                    <tbody>
                                        {cards.map((c, i) => (
                                            <tr key={i}>
                                                <td><input className="bc-table-input" value={c.CARD_NO} onChange={e => handleCardChange(i, 'CARD_NO', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.CARDGIVE_DT} onChange={e => handleCardChange(i, 'CARDGIVE_DT', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.CARD_NM} onChange={e => handleCardChange(i, 'CARD_NM', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.CARD_COMPANY} onChange={e => handleCardChange(i, 'CARD_COMPANY', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.CARD_TYPE} onChange={e => handleCardChange(i, 'CARD_TYPE', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.EXPIRE_DT} onChange={e => handleCardChange(i, 'EXPIRE_DT', e.target.value)} /></td>
                                                <td><input className="bc-table-input" value={c.COLLECT_DT} onChange={e => handleCardChange(i, 'COLLECT_DT', e.target.value)} /></td>
                                                <td><button className="bc-delete-btn" onClick={() => setCards(cards.filter((_, idx) => idx !== i))}><X size={14} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserManagementContent;
