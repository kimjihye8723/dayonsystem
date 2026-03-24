import React, { useState, useEffect, useCallback } from 'react';
import { Save, Trash2, RefreshCw, Plus, Search, Video } from 'lucide-react';
import axios from 'axios';
import './CCTVManagementContent.css';

interface Props {
    theme: 'light' | 'dark';
}

const CCTVManagementContent: React.FC<Props> = ({ theme }) => {
    const [cctvs, setCctvs] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [vendors, setVendors] = useState<{ VENDOR_CD: string, VENDOR_NM: string }[]>([]);

    const [searchCctv, setSearchCctv] = useState('');
    const [searchVendor, setSearchVendor] = useState('');

    const fetchCCTVs = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/cctvs', {
                params: {
                    cctvNm: searchCctv,
                    vendorNm: searchVendor
                }
            });
            if (res.data.success) {
                // 각 행에 유니크한 id 부여 (DataGrid나 테이블 관리용)
                const dataWithIds = res.data.cctvs.map((c: any) => ({
                    ...c,
                    id: c.idx || c.CONNECT_INFO
                }));
                setCctvs(dataWithIds);
            }
            setLoading(false);
        } catch (err) {
            console.error('Fetch CCTV error:', err);
            setLoading(false);
        }
    }, [searchCctv, searchVendor]);

    const fetchVendors = useCallback(async () => {
        try {
            const res = await axios.get('/api/vendors');
            if (res.data.success) {
                setVendors(res.data.vendors);
            }
        } catch (err) {
            console.error('Fetch vendors error:', err);
        }
    }, []);

    useEffect(() => {
        fetchVendors();
        fetchCCTVs();
    }, [fetchVendors, fetchCCTVs]);

    const handleRefresh = () => {
        setSearchCctv('');
        setSearchVendor('');
        fetchCCTVs();
    };

    const handleAddRow = () => {
        const tempId = `new-${Date.now()}`;
        const newCctv = {
            id: tempId, // UI용 유니크 ID
            idx: null,
            CONNECT_INFO: '',
            DEVICE_RTSP: '',
            SET_DT: new Date().toISOString().slice(0, 8).replace(/-/g, ''),
            USE_VENDOR: '',
            USE_YN: 'Y',
            REMARK: '',
            isNew: true
        };
        setCctvs([newCctv, ...cctvs]);
    };

    const handleCellChange = (index: number, field: string, value: any) => {
        const newCctvs = [...cctvs];
        newCctvs[index] = { ...newCctvs[index], [field]: value };
        setCctvs(newCctvs);
    };

    const toggleRowSelection = (id: any) => {
        if (id === null || id === undefined) return;
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            const res = await axios.post('/api/cctvs/save', { cctvs });
            if (res.data.success) {
                alert('저장되었습니다.');
                fetchCCTVs();
            }
        } catch (err: any) {
            alert('저장 실패: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`선택한 ${selectedIds.length}건을 삭제하시겠습니까?`)) return;

        try {
            setLoading(true);
            
            // 1. 아직 서버에 저장되지 않은(id가 'new-'로 시작) 항목들은 상태에서 바로 제거
            const persistentIds = selectedIds.filter(id => !String(id).startsWith('new'));

            if (persistentIds.length > 0) {
                // 서버에 저장된 항목들은 CONNECT_INFO를 기반으로 삭제 요청
                const connectInfos = cctvs
                    .filter(c => persistentIds.includes(c.id))
                    .map(c => c.CONNECT_INFO)
                    .filter(info => info); // 빈 값 제외

                if (connectInfos.length > 0) {
                    const response = await axios.delete('/api/cctvs', {
                        data: { connectInfos }
                    });
                    if (!response.data.success) {
                        throw new Error(response.data.message || '삭제 중 오류가 발생했습니다.');
                    }
                }
            }

            alert('삭제되었습니다.');
            setSelectedIds([]);
            fetchCCTVs(); 
            
        } catch (err: any) {
            alert('삭제 실패: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            <div className="mgmt-card dm-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Video size={20} color="var(--mgmt-primary)" />
                        <span className="dm-title-text">CCTV 관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회" variant="primary" onClick={fetchCCTVs} />
                        <ToolbarBtn icon={<Plus size={16} />} label="행추가" variant="success" onClick={handleAddRow} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제" variant="danger" onClick={handleDelete} />
                    </div>
                </div>
            </div>

            <div className="mgmt-card dm-filter-card">
                <div className="mgmt-form-group horizontal">
                    <span className="mgmt-label">접속 정보</span>
                    <input type="text" className="mgmt-input" value={searchCctv} onChange={(e) => setSearchCctv(e.target.value)} placeholder="검색어..." />
                </div>
                <div className="mgmt-form-group horizontal dm-filter-vendor">
                    <span className="mgmt-label">거래처</span>
                    <input type="text" className="mgmt-input" value={searchVendor} onChange={(e) => setSearchVendor(e.target.value)} placeholder="거래처명 검색..." />
                </div>
            </div>

            <div className="mgmt-card dm-main-card">
                <div className="dm-info-bar">
                    <div className="dm-total-count">총 {cctvs.length} 건</div>
                </div>

                <div className="mgmt-table-wrapper dm-table-wrapper">
                    <table className="mgmt-table">
                        <thead>
                            <tr>
                                <th className="dm-table-col-check">
                                    <input type="checkbox"
                                        checked={cctvs.length > 0 && selectedIds.length === cctvs.length}
                                        onChange={() => {
                                            if (selectedIds.length > 0) setSelectedIds([]);
                                            else setSelectedIds(cctvs.map((c, idx) => c.id || c.CONNECT_INFO || `row-${idx}`));
                                        }}
                                    />
                                </th>
                                <th style={{ width: '80px' }}>IDX</th>
                                <th style={{ width: '250px' }}>접속 정보 (URL)</th>
                                <th style={{ width: '350px' }}>RTSP 스트림 주소</th>
                                <th style={{ width: '120px' }}>설치일자</th>
                                <th style={{ width: '200px' }}>사용거래처</th>
                                <th className="dm-table-col-status">사용여부</th>
                                <th>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cctvs.map((c, index) => {
                                const rowId = c.id || c.CONNECT_INFO || `row-${index}`;
                                if (!c.id) c.id = rowId; // ID 보정

                                return (
                                    <tr key={rowId} className={selectedIds.includes(rowId) ? 'selected' : ''}>
                                        <td className="dm-table-cell-center">
                                            <input type="checkbox" 
                                                checked={selectedIds.includes(rowId)} 
                                                onChange={() => toggleRowSelection(rowId)} 
                                            />
                                        </td>
                                        <td className="dm-table-cell-center">{c.idx || 'New'}</td>
                                        <td><input className="mgmt-input dm-table-input" value={c.CONNECT_INFO || ''} onChange={(e) => handleCellChange(index, 'CONNECT_INFO', e.target.value)} /></td>
                                        <td><input className="mgmt-input dm-table-input" value={c.DEVICE_RTSP || ''} onChange={(e) => handleCellChange(index, 'DEVICE_RTSP', e.target.value)} /></td>
                                        <td><input className="mgmt-input dm-table-input" value={c.SET_DT || ''} onChange={(e) => handleCellChange(index, 'SET_DT', e.target.value)} /></td>
                                        <td>
                                            <select className="mgmt-input dm-table-select" value={c.USE_VENDOR || ''} onChange={(e) => handleCellChange(index, 'USE_VENDOR', e.target.value)}>
                                                <option value="">선택안함</option>
                                                {vendors.map(v => <option key={v.VENDOR_CD} value={v.VENDOR_CD}>{v.VENDOR_NM}</option>)}
                                            </select>
                                        </td>
                                        <td className="dm-table-cell-center">
                                            <input type="checkbox" checked={c.USE_YN === 'Y'} onChange={(e) => handleCellChange(index, 'USE_YN', e.target.checked ? 'Y' : 'N')} />
                                        </td>
                                        <td><input className="mgmt-input dm-table-input" value={c.REMARK || ''} onChange={(e) => handleCellChange(index, 'REMARK', e.target.value)} /></td>
                                    </tr>
                                );
                            })}
                            {cctvs.length === 0 && !loading && (
                                <tr><td colSpan={8} className="dm-table-empty">조회된 데이터가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
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

export default CCTVManagementContent;
