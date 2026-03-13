import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Save, Trash2, RefreshCw, X, Search, Database } from 'lucide-react';
import axios from 'axios';
import './BasicCodeContent.css';

interface BasicCode {
    CORP_CD: string;
    GROUP_CD: string;
    CODE_CD: string;
    GROUP_NM: string;
    CODE_NM: string;
    CODE_PROP1: string | null;
    CODE_PROP2: string | null;
    CODE_PROP3: string | null;
    DESCRIPTION_TX: string | null;
    DEFAULT_YN: string;
    USE_YN: string;
    SYSTEM_YN: string;
    RELATION_CD: string | null;
    SORT_SEQ: number;
    REMARK: string | null;
}

interface GroupSummary {
    GROUP_CD: string;
    GROUP_NM: string;
    count: number;
}

interface Props {
    theme: 'light' | 'dark';
}

const BasicCodeContent: React.FC<Props> = ({ theme }) => {
    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [codes, setCodes] = useState<BasicCode[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [groupSearch, setGroupSearch] = useState('');
    const [codeSearch, setCodeSearch] = useState('');
    const [systemFilter, setSystemFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingCells, setEditingCells] = useState<Record<string, BasicCode>>({});
    const [newRows, setNewRows] = useState<Partial<BasicCode>[]>([]);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

    const fetchGroups = useCallback(async () => {
        try {
            setLoading(true);
            const startTime = Date.now();
            const res = await axios.get(`/api/basic-codes/groups?_t=${Date.now()}`);

            // Artificial delay to make animation visible (min 500ms)
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 500) await new Promise(r => setTimeout(r, 500 - elapsedTime));

            if (res.data.success) {
                setGroups(res.data.groups);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    const fetchCodes = useCallback(async (groupCd: string) => {
        try {
            setLoading(true);
            const startTime = Date.now();
            const res = await axios.get(`/api/basic-codes?groupCd=${groupCd}&_t=${Date.now()}`);

            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 500) await new Promise(r => setTimeout(r, 500 - elapsedTime));

            if (res.data.success) {
                setCodes(res.data.codes);
                setEditingCells({});
                setNewRows([]);
                setSelectedRows(new Set());
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    const handleRefresh = useCallback(() => {
        setGroupSearch('');
        setCodeSearch('');
        setSystemFilter('');
        // Don't null selectedGroup to keep context, but reload everything
        fetchGroups();
        if (selectedGroup) fetchCodes(selectedGroup);
    }, [fetchGroups, fetchCodes, selectedGroup]);

    const handleSearch = useCallback(() => {
        fetchGroups();
        if (selectedGroup) fetchCodes(selectedGroup);
    }, [fetchGroups, fetchCodes, selectedGroup]);

    const handleSaveAll = useCallback(async () => {
        const invalidNewRows = newRows.filter(r => !r.CODE_CD || !r.CODE_NM);
        if (invalidNewRows.length > 0) {
            alert('신규 추가 행의 공통코드와 코드명을 모두 입력해주세요.');
            return;
        }

        const invalidEdits = Object.values(editingCells).filter(code => !code.CODE_NM);
        if (invalidEdits.length > 0) {
            alert('수정 중인 행의 코드명을 입력해주세요.');
            return;
        }

        const editPromises = Object.values(editingCells).map(code =>
            axios.put('/api/basic-codes', code)
        );
        const addPromises = newRows.map(row =>
            axios.post('/api/basic-codes', {
                ...row,
                GROUP_CD: selectedGroup,
                GROUP_NM: groups.find(g => g.GROUP_CD === selectedGroup)?.GROUP_NM || ''
            })
        );
        try {
            await Promise.all([...editPromises, ...addPromises]);
            setEditingCells({});
            setNewRows([]);
            fetchGroups();
            if (selectedGroup) fetchCodes(selectedGroup);
            alert('저장되었습니다.');
        } catch (err: any) {
            console.error('Save failed:', err.response?.data || err);
            alert(err.response?.data?.error || err.response?.data?.message || err.message || '저장 실패');
        }
    }, [editingCells, newRows, selectedGroup, groups, fetchGroups, fetchCodes]);

    const handleDelete = useCallback(async () => {
        if (selectedRows.size === 0) { alert('삭제할 행을 선택해주세요.'); return; }
        if (!window.confirm(`선택된 ${selectedRows.size}개 코드를 삭제하시겠습니까?`)) return;
        try {
            await Promise.all(Array.from(selectedRows).map(key => {
                const [GROUP_CD, CODE_CD] = key.split('::');
                return axios.delete('/api/basic-codes', { data: { GROUP_CD, CODE_CD } });
            }));
            setSelectedRows(new Set());
            fetchGroups();
            if (selectedGroup) fetchCodes(selectedGroup);
        } catch (err: any) { alert(err.response?.data?.message || '삭제 실패'); }
    }, [selectedRows, fetchGroups, selectedGroup, fetchCodes]);

    const toggleRowSelection = useCallback((key: string) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    const handleAddRow = useCallback(() => {
        setNewRows([...newRows, {
            GROUP_CD: selectedGroup || '', CODE_CD: '', CODE_NM: '',
            CODE_PROP1: '', CODE_PROP2: '', CODE_PROP3: '',
            DESCRIPTION_TX: '', DEFAULT_YN: 'N', USE_YN: 'Y',
            SYSTEM_YN: 'N', RELATION_CD: '', SORT_SEQ: codes.length + newRows.length + 1, REMARK: ''
        }]);
    }, [newRows, selectedGroup, codes.length]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);
    useEffect(() => { if (selectedGroup) fetchCodes(selectedGroup); }, [selectedGroup, fetchCodes]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                handleRefresh();
            }
            if (e.key === 'F3') { e.preventDefault(); handleSearch(); }
            if (e.key === 'F4') { e.preventDefault(); handleSaveAll(); }
            if (e.key === 'F5') { e.preventDefault(); if (selectedGroup) handleAddRow(); }
            if (e.key === 'F8') { e.preventDefault(); handleDelete(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh, handleSearch, handleSaveAll, handleAddRow, handleDelete, selectedGroup]);

    const updateEditingCell = (code: BasicCode, field: string, value: any) => {
        const key = `${code.GROUP_CD}::${code.CODE_CD}`;
        setEditingCells(prev => ({
            ...prev,
            [key]: { ...(prev[key] || code), [field]: value }
        }));
    };

    const getEditValue = (code: BasicCode, field: keyof BasicCode) => {
        const key = `${code.GROUP_CD}::${code.CODE_CD}`;
        return editingCells[key] ? (editingCells[key] as any)[field] : code[field];
    };

    const handleDragStart = (idx: number) => { dragItem.current = idx; setDraggingIdx(idx); };
    const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
    const handleDragEnd = async () => {
        if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
            setDraggingIdx(null); return;
        }
        const items = [...codes];
        const dragged = items.splice(dragItem.current, 1)[0];
        items.splice(dragOverItem.current, 0, dragged);
        const updated = items.map((c, i) => ({ ...c, SORT_SEQ: i + 1 }));
        setCodes(updated);
        setDraggingIdx(null);
        dragItem.current = null;
        dragOverItem.current = null;
        try {
            await axios.put('/api/basic-codes/reorder', {
                GROUP_CD: selectedGroup,
                orders: updated.map(c => ({ CODE_CD: c.CODE_CD, SORT_SEQ: c.SORT_SEQ }))
            });
        } catch { if (selectedGroup) fetchCodes(selectedGroup); }
    };

    const filteredGroups = groups.filter(g =>
        g.GROUP_CD.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.GROUP_NM.toLowerCase().includes(groupSearch.toLowerCase())
    );

    const filteredCodes = codes.filter(c => {
        const matchCode = !codeSearch ||
            c.CODE_CD.toLowerCase().includes(codeSearch.toLowerCase()) ||
            c.CODE_NM.toLowerCase().includes(codeSearch.toLowerCase());
        const matchSystem = systemFilter === '' || c.SYSTEM_YN === systemFilter;
        return matchCode && matchSystem;
    });

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Top Toolbar */}
            <div className="mgmt-card bc-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Database size={20} color="var(--mgmt-primary)" />
                        <span className="bc-title-text">기초코드관리</span>
                    </div>

                    <div className="bc-filter-group">
                        <div className="mgmt-form-group horizontal">
                            <span className="mgmt-label">그룹코드/명</span>
                            <input type="text" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="검색..." className="mgmt-input bc-filter-input" />
                        </div>
                        <div className="mgmt-form-group horizontal">
                            <span className="mgmt-label">공통코드/명</span>
                            <input type="text" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} placeholder="검색..." className="mgmt-input bc-filter-input" />
                        </div>
                        <div className="mgmt-form-group horizontal">
                            <span className="mgmt-label">시스템</span>
                            <select className="mgmt-select bc-filter-select" value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
                                <option value="">전체</option>
                                <option value="N">N</option>
                                <option value="Y">Y</option>
                            </select>
                        </div>
                    </div>

                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={handleSearch} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSaveAll} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                        {selectedGroup && (
                            <ToolbarBtn icon={<Plus size={16} />} label="행추가(F5)" variant="success" onClick={handleAddRow} />
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bc-main-layout">
                {/* Left - Group List */}
                <div className="mgmt-card bc-sidebar-card">
                    <div className="mgmt-table-wrapper bc-sidebar-table-wrapper">
                        <div className="vm-subgrid-header">기초코드 목록</div>
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th className="bc-sidebar-col-code">그룹코드</th>
                                    <th>그룹명</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredGroups.map(g => (
                                    <tr key={g.GROUP_CD}
                                        onClick={() => setSelectedGroup(g.GROUP_CD)}
                                        className={selectedGroup === g.GROUP_CD ? 'selected' : ''}
                                    >
                                        <td className="bc-sidebar-cell-code">{g.GROUP_CD}</td>
                                        <td>{g.GROUP_NM}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right - Code Detail Area */}
                <div className="mgmt-card bc-detail-card">
                    {/* Header Banner */}
                    {selectedGroup && (
                        <div className="bc-detail-header">
                            <div className="bc-header-item">
                                <span className="bc-header-label">Group Code:</span>
                                <span className="bc-header-value-primary">{selectedGroup}</span>
                            </div>
                            <div className="bc-header-item">
                                <span className="bc-header-label">Group Name:</span>
                                <span className="bc-header-value-main">{groups.find(g => g.GROUP_CD === selectedGroup)?.GROUP_NM}</span>
                            </div>
                            <div className="bc-header-count">
                                {codes.length} 건
                            </div>
                        </div>
                    )}

                    {!selectedGroup ? (
                        <div className="bc-detail-empty">
                            <Database size={64} strokeWidth={1} className="bc-detail-icon" />
                            <p className="bc-detail-text">좌측에서 그룹을 선택하세요.</p>
                        </div>
                    ) : (
                        <div className="mgmt-table-wrapper bc-table-wrapper">
                            <table className="mgmt-table">
                                <thead>
                                    <tr>
                                        <th className="bc-col-check">
                                            <input type="checkbox" checked={selectedRows.size > 0 && selectedRows.size === filteredCodes.length} onChange={() => {
                                                if (selectedRows.size > 0) setSelectedRows(new Set());
                                                else {
                                                    const allKeys = filteredCodes.map(c => `${c.GROUP_CD}::${c.CODE_CD}`);
                                                    setSelectedRows(new Set(allKeys));
                                                }
                                            }} />
                                        </th>
                                        <th className="bc-col-no">NO</th>
                                        <th className="bc-col-code">공통코드</th>
                                        <th className="bc-col-name">코드명</th>
                                        <th className="bc-col-desc">코드설명</th>
                                        <th className="bc-col-yn">기본</th>
                                        <th className="bc-col-status">사용상태</th>
                                        <th className="bc-col-system">시스템</th>
                                        <th className="bc-col-rel">연결코드</th>
                                        <th className="bc-col-sort">순번</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCodes.map((code, idx) => {
                                        const key = `${code.GROUP_CD}::${code.CODE_CD}`;
                                        const isEditing = !!editingCells[key];
                                        const isSelected = selectedRows.has(key);
                                        const isDragging = draggingIdx === idx;
                                        return (
                                            <tr key={key}
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragEnter={() => handleDragEnter(idx)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                                className={`${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} ${isDragging ? 'dragging' : ''}`}
                                            >
                                                <td className="bc-col-check bc-cell-center" onMouseDown={e => e.stopPropagation()}>
                                                    <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelection(key)} />
                                                </td>
                                                <td className="bc-col-no bc-cell-no">{idx + 1}</td>
                                                <td className="bc-col-code bc-cell-code">{code.CODE_CD}</td>
                                                <td className="bc-col-name">
                                                    <input className="mgmt-input bc-table-input" value={getEditValue(code, 'CODE_NM') || ''}
                                                        title={getEditValue(code, 'CODE_NM') || ''}
                                                        onChange={(e) => updateEditingCell(code, 'CODE_NM', e.target.value)} />
                                                </td>
                                                <td className="bc-col-desc">
                                                    <input className="mgmt-input bc-table-input" value={getEditValue(code, 'DESCRIPTION_TX') || ''}
                                                        title={getEditValue(code, 'DESCRIPTION_TX') || ''}
                                                        onChange={(e) => updateEditingCell(code, 'DESCRIPTION_TX', e.target.value)} />
                                                </td>
                                                <td className="bc-col-yn bc-cell-center">
                                                    <select className="mgmt-select bc-table-select"
                                                        value={getEditValue(code, 'DEFAULT_YN') || 'N'}
                                                        onChange={(e) => updateEditingCell(code, 'DEFAULT_YN', e.target.value)}>
                                                        <option value="Y">Y</option>
                                                        <option value="N">N</option>
                                                    </select>
                                                </td>
                                                <td className="bc-col-status bc-cell-center">
                                                    <YNBadge value={getEditValue(code, 'USE_YN')}
                                                        onChange={(v) => updateEditingCell(code, 'USE_YN', v)} />
                                                </td>
                                                <td className="bc-col-system bc-cell-center">
                                                    <select className="mgmt-select bc-table-select"
                                                        value={getEditValue(code, 'SYSTEM_YN') || 'N'}
                                                        onChange={(e) => updateEditingCell(code, 'SYSTEM_YN', e.target.value)}>
                                                        <option value="Y">Y</option>
                                                        <option value="N">N</option>
                                                    </select>
                                                </td>
                                                <td className="bc-col-rel">
                                                    <input className="mgmt-input bc-table-input" value={getEditValue(code, 'RELATION_CD') || ''}
                                                        onChange={(e) => updateEditingCell(code, 'RELATION_CD', e.target.value)} />
                                                </td>
                                                <td className="bc-col-sort bc-cell-sort">
                                                    {code.SORT_SEQ}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* New Rows */}
                                    {newRows.map((row, idx) => (
                                        <tr key={`new-${idx}`} className="bc-new-row">
                                            <td className="bc-col-check bc-cell-center">
                                                <button onClick={() => setNewRows(newRows.filter((_, i) => i !== idx))} className="bc-delete-btn">
                                                    <X size={16} />
                                                </button>
                                            </td>
                                            <td className="bc-col-no bc-new-badge">NEW</td>
                                            <td className="bc-col-code">
                                                <input className="mgmt-input bc-table-input-code" placeholder="코드" value={row.CODE_CD || ''}
                                                    onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], CODE_CD: e.target.value }; setNewRows(r); }} />
                                            </td>
                                            <td className="bc-col-name">
                                                <input className="mgmt-input bc-table-input" placeholder="코드명" value={row.CODE_NM || ''}
                                                    title={row.CODE_NM || ''}
                                                    onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], CODE_NM: e.target.value }; setNewRows(r); }} />
                                            </td>
                                            <td className="bc-col-desc"><input className="mgmt-input bc-table-input" placeholder="코드설명" value={row.DESCRIPTION_TX || ''} title={row.DESCRIPTION_TX || ''} onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], DESCRIPTION_TX: e.target.value }; setNewRows(r); }} /></td>
                                            <td className="bc-col-yn bc-cell-center">
                                                <select className="mgmt-select bc-table-select" value={row.DEFAULT_YN || 'N'}
                                                    onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], DEFAULT_YN: e.target.value }; setNewRows(r); }}>
                                                    <option value="Y">Y</option><option value="N">N</option>
                                                </select>
                                            </td>
                                            <td className="bc-col-status bc-cell-center">
                                                <select className="mgmt-select bc-table-select" value={row.USE_YN || 'Y'}
                                                    onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], USE_YN: e.target.value }; setNewRows(r); }}>
                                                    <option value="Y">Y</option><option value="N">N</option>
                                                </select>
                                            </td>
                                            <td className="bc-col-system bc-cell-center">
                                                <select className="mgmt-select bc-table-select" value={row.SYSTEM_YN || 'N'}
                                                    onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], SYSTEM_YN: e.target.value }; setNewRows(r); }}>
                                                    <option value="Y">Y</option><option value="N">N</option>
                                                </select>
                                            </td>
                                            <td className="bc-col-rel"><input className="mgmt-input bc-table-input" value={row.RELATION_CD || ''} onChange={(e) => { const r = [...newRows]; r[idx] = { ...r[idx], RELATION_CD: e.target.value }; setNewRows(r); }} /></td>
                                            <td className="bc-col-sort bc-cell-sort">{row.SORT_SEQ}</td>
                                        </tr>
                                    ))}
                                    {filteredCodes.length === 0 && newRows.length === 0 && (
                                        <tr><td colSpan={13} className="bc-table-empty">조회된 데이터가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/* Status Bar */}
                    {selectedGroup && (
                        <div className="bc-status-bar">
                            <span className="bc-status-total">Total: <strong className="bc-status-total-val">{codes.length}</strong></span>
                            {Object.keys(editingCells).length > 0 && (
                                <span className="bc-status-edit">수정 중: <strong>{Object.keys(editingCells).length}</strong></span>
                            )}
                            {newRows.length > 0 && (
                                <span className="bc-status-new">신규 추가: <strong>{newRows.length}</strong></span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode; label: string; variant: 'primary' | 'success' | 'danger' | 'secondary'; onClick: () => void }> = ({ icon, label, variant, onClick }) => (
    <button className={`mgmt-toolbar-btn mgmt-btn-${variant}`} onClick={onClick}>
        {icon}
        {label}
    </button>
);

const YNBadge: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <button onClick={() => onChange(value === 'Y' ? 'N' : 'Y')}
        style={{
            padding: '2px 10px',
            borderRadius: '1rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: value === 'Y' ? 'var(--mgmt-primary-glow)' : 'rgba(0,0,0,0.05)',
            color: value === 'Y' ? 'var(--mgmt-primary)' : 'var(--text-muted)',
            transition: 'all 0.2s'
        }}>
        {value === 'Y' ? '사용' : '미사용'}
    </button>
);

export default BasicCodeContent;

