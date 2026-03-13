import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, RefreshCw, Search, Save, X, Plus
} from 'lucide-react';
import axios from 'axios';
import './UserPermissionManagementContent.css';

interface UserSearchItem {
    USER_NM: string;
    USER_ID: string;
    USER_TYP: string;
}

interface CopyUserItem {
    USER_ID: string;
    USER_NM: string;
    USER_TYP: string;
}

interface ProgramPermission {
    PGM_ID: string;
    PROGRAM_NM?: string; // TCM_PROGRAM 등과 조인 필요할 수 있음
    TASK_NM?: string;
    START_DT?: string;
    END_DT?: string;
    AUTH_SEARCH: boolean;
    AUTH_CONFIRM: boolean;
    AUTH_SAVE: boolean;
    AUTH_DELETE: boolean;
    AUTH_PRINT: boolean;
    AUTH_EXCEL: boolean;
    AUTH_UPLOAD: boolean;
}

interface PcPermission {
    ALLOW_YN: boolean;
    DISK_INFO: string;
    MAC_ADDR: string;
    REMARK: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const UserPermissionManagementContent: React.FC<Props> = ({ theme }) => {
    const [userItems, setUserItems] = useState<UserSearchItem[]>([]);
    const [copyUserItems, setCopyUserItems] = useState<CopyUserItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterNm, setFilterNm] = useState('');

    // Details from TCM_ROLEPGMUSERAUTH & TCM_USERPCAUTH
    const [permissions, setPermissions] = useState<ProgramPermission[]>([]);
    const [pcPermissions, setPcPermissions] = useState<PcPermission[]>([]);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/users', { params: { userNm: filterNm } });
            if (response.data.success) {
                setUserItems(response.data.users);
            }
        } catch (error) {
            console.error('Fetch users error:', error);
        } finally {
            setLoading(false);
        }
    }, [filterNm]);

    const fetchCopyUsers = useCallback(async () => {
        try {
            const response = await axios.get('/api/user-auth-copy-list');
            if (response.data.success) {
                setCopyUserItems(response.data.users);
            }
        } catch (error) {
            console.error('Fetch copy users error:', error);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
        fetchCopyUsers();
    }, [fetchUsers, fetchCopyUsers]);

    const handleUserSelect = async (userId: string) => {
        setSelectedUserId(userId);
        try {
            setLoading(true);
            // 1. Fetch permissions from TCM_ROLEPGMUSERAUTH
            const permRes = await axios.get(`/api/user-permissions/${userId}`);
            if (permRes.data.success) {
                // DB의 PGM_ID를 UI의 ID 필드로 매핑하거나 그대로 사용
                setPermissions(permRes.data.permissions);
            }

            // 2. Fetch PC Permissions
            const pcRes = await axios.get(`/api/user-pc-auth/${userId}`);
            if (pcRes.data.success) {
                setPcPermissions(pcRes.data.pcAuth);
            }
        } catch (error) {
            console.error('Fetch details error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedUserId) {
            alert('사용자를 먼저 선택해주세요.');
            return;
        }
        try {
            setLoading(true);
            const response = await axios.post('/api/user-permissions/save', {
                userId: selectedUserId,
                permissions: permissions
            });
            if (response.data.success) {
                alert('저장되었습니다.');
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const togglePermission = (idx: number, field: keyof ProgramPermission) => {
        const newPerms = [...permissions];
        (newPerms[idx] as any)[field] = !(newPerms[idx] as any)[field];
        setPermissions(newPerms);
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card bc-toolbar-card" style={{ marginBottom: '1rem' }}>
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <ShieldCheck size={20} color="var(--mgmt-primary)" />
                        <span className="vm-title-text">사용자 권한관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <button className="mgmt-toolbar-btn mgmt-btn-secondary" onClick={fetchUsers}><RefreshCw size={16} /> 새로고침(F2)</button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={fetchUsers}>
                            <Search size={16} className={loading ? 'animate-spin' : ''} /> 조회(F3)
                        </button>
                        <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={handleSave}><Save size={16} /> 저장(F4)</button>
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
                    <span className="mgmt-label perm-filter-label">사용자구분</span>
                    <select className="mgmt-select perm-filter-select-medium">
                        <option value="">전체</option>
                        <option value="S">관리자</option>
                        <option value="1">일반사용자</option>
                    </select>
                </div>
                <div className="perm-filter-item" style={{ flex: 1 }}>
                    <span className="mgmt-label perm-filter-label">사용자명/ID</span>
                    <input 
                        className="mgmt-input perm-filter-search-input" 
                        placeholder="검색어..." 
                        value={filterNm}
                        onChange={e => setFilterNm(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && fetchUsers()}
                    />
                </div>
            </div>

            {/* Matrix Layout */}
            <div className="perm-layout-container">
                
                {/* Top Row */}
                <div className="perm-grid-row perm-top-row">
                    {/* Top Left: User Search (TCM_USERHDR) */}
                    <div className="mgmt-card perm-card-user-list">
                        <div className="vm-subgrid-header">사용자조회</div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1 }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th>사용자명</th>
                                        <th>사용자ID</th>
                                        <th>사용자구분</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userItems.length > 0 ? (
                                        userItems.map(item => (
                                            <tr key={item.USER_ID} className={`vm-row ${selectedUserId === item.USER_ID ? 'selected' : ''}`} onClick={() => handleUserSelect(item.USER_ID)}>
                                                <td>{item.USER_NM}</td>
                                                <td style={{ textAlign: 'center' }}>{item.USER_ID}</td>
                                                <td style={{ textAlign: 'center' }}>{item.USER_TYP === 'S' ? '관리자' : '일반사용자'}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={3} className="vm-cell-empty">검색 결과가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Top Right: Copy Permission (TCM_USERAUTH) */}
                    <div className="mgmt-card perm-card-copy-box">
                        <div className="vm-subgrid-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="perm-copy-info">
                                <span>프로그램 권한 복사</span>
                                <span className="perm-copy-target-name">{selectedUserId ? userItems.find(u => u.USER_ID === selectedUserId)?.USER_NM : ''}</span>
                            </div>
                            <div className="perm-copy-info">
                                <span className="perm-copy-action-text">의 권한을 선택 사용자(들)에게 복사</span>
                                <button className="mgmt-toolbar-btn mgmt-btn-primary" style={{ padding: '2px 8px', fontSize: '11px' }}>복사</button>
                            </div>
                        </div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1 }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>±</th>
                                        <th style={{ width: '40px' }}>선택</th>
                                        <th>사용자ID</th>
                                        <th>성명</th>
                                        <th>사용자구분</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {copyUserItems.length > 0 ? (
                                        copyUserItems.map(item => (
                                            <tr key={item.USER_ID} className="vm-row">
                                                <td style={{ textAlign: 'center' }}>+</td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" /></td>
                                                <td style={{ textAlign: 'center' }}>{item.USER_ID}</td>
                                                <td>{item.USER_NM}</td>
                                                <td style={{ textAlign: 'center' }}>{item.USER_TYP === 'S' ? '관리자' : '일반사용자'}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="vm-cell-empty">복사 대상이 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Bottom Row */}
                <div className="perm-grid-row perm-bottom-row">
                    {/* Bottom Left: Permission Settings (TCM_ROLEPGMUSERAUTH) */}
                    <div className="mgmt-card perm-card-program-perm">
                        <div className="vm-subgrid-header">프로그램 권한 설정 [ 메뉴별 전체 권한설정 - 전체:Ctrl_F2, 헤더 클릭 시 컬럼 전체 선택 ]</div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1 }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>±</th>
                                        <th colSpan={3}>프로그램</th>
                                        <th colSpan={2}>적용</th>
                                        <th colSpan={7}>권한</th>
                                    </tr>
                                    <tr>
                                        <th></th>
                                        <th style={{ width: '90px' }}>ID</th>
                                        <th>명</th>
                                        <th style={{ width: '70px' }}>업무</th>
                                        <th style={{ width: '85px' }}>시작</th>
                                        <th style={{ width: '85px' }}>종료</th>
                                        <th style={{ width: '35px' }}>조회</th>
                                        <th style={{ width: '35px' }}>확정</th>
                                        <th style={{ width: '35px' }}>저장</th>
                                        <th style={{ width: '35px' }}>삭제</th>
                                        <th style={{ width: '35px' }}>출력</th>
                                        <th style={{ width: '35px' }}>엑셀</th>
                                        <th style={{ width: '35px' }}>업로드</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {permissions.length > 0 ? (
                                        permissions.map((p, i) => (
                                            <tr key={p.PGM_ID} className="vm-row">
                                                <td style={{ textAlign: 'center' }}>-</td>
                                                <td className="perm-id-cell">{p.PGM_ID}</td>
                                                <td>{p.PROGRAM_NM || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>{p.TASK_NM || '-'}</td>
                                                <td className="perm-date-cell">{p.START_DT || '-'}</td>
                                                <td className="perm-date-cell">{p.END_DT || '-'}</td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_SEARCH} onChange={() => togglePermission(i, 'AUTH_SEARCH')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_CONFIRM} onChange={() => togglePermission(i, 'AUTH_CONFIRM')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_SAVE} onChange={() => togglePermission(i, 'AUTH_SAVE')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_DELETE} onChange={() => togglePermission(i, 'AUTH_DELETE')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_PRINT} onChange={() => togglePermission(i, 'AUTH_PRINT')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_EXCEL} onChange={() => togglePermission(i, 'AUTH_EXCEL')} /></td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.AUTH_UPLOAD} onChange={() => togglePermission(i, 'AUTH_UPLOAD')} /></td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={13} className="vm-cell-empty">조회된 권한 정보가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bottom Right: PC Auth */}
                    <div className="mgmt-card perm-card-pc-auth">
                        <div className="vm-subgrid-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>사용자 접속PC권한</span>
                            <button className="bc-delete-btn"><Plus size={14} /></button>
                        </div>
                        <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ flex: 1 }}>
                            <table className="mgmt-table perm-table-sticky">
                                <thead>
                                    <tr>
                                        <th style={{ width: '30px' }}>±</th>
                                        <th style={{ width: '80px' }}>접속허가여부</th>
                                        <th>디스크정보</th>
                                        <th>맥주소</th>
                                        <th>비고</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pcPermissions.length > 0 ? (
                                        pcPermissions.map((pc, i) => (
                                            <tr key={i} className="vm-row">
                                                <td style={{ textAlign: 'center' }}>+</td>
                                                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!pc.ALLOW_YN} readOnly /></td>
                                                <td><input className="bc-table-input" value={pc.DISK_INFO} readOnly title={pc.DISK_INFO} /></td>
                                                <td><input className="bc-table-input" value={pc.MAC_ADDR} readOnly title={pc.MAC_ADDR} /></td>
                                                <td><input className="bc-table-input" value={pc.REMARK} readOnly title={pc.REMARK} /></td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="vm-cell-empty">조회된 PC 권한이 없습니다.</td></tr>
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

export default UserPermissionManagementContent;
