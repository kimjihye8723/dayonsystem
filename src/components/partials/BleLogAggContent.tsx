import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer, FileSpreadsheet, X, Activity } from 'lucide-react';
import axios from 'axios';
import '../../styles/partials/BleLogAggContent.css';

interface BleSummary {
    LOG_DT: string;
    VENDOR_NM: string;
    DEVICE_MAC: string;
    DEVICE_NM: string;
    DEVICE_RSSI: number;
    DEVICE_DISTANCE: number;
    FIRST_HH: string;
    LAST_HH: string;
    FIRST_IN_TIME: string;
    LAST_IN_TIME: string;
    TOTAL_OBSERVED: string;
    VENDOR_CD: string;
}

interface BleDetail {
    LOG_TIME: string;
    DEVICE_MAC: string;
    DEVICE_NM: string;
    DEVICE_RSSI: number;
    DEVICE_DISTANCE: number;
    FIRST_SEEN: string;
    LAST_SEEN: string;
    OBSERVED_TM: string;
}

interface Props {
    theme: 'light' | 'dark';
    onClose?: () => void;
}

const BleLogAggContent: React.FC<Props> = ({ theme, onClose }) => {
    const [summaryData, setSummaryData] = useState<BleSummary[]>([]);
    const [detailData, setDetailData] = useState<BleDetail[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [vendorGroups, setVendorGroups] = useState<string[]>([]);
    const [selectedGroup, setSelectedGroup] = useState('ALL');
    const [onlyUnknown, setOnlyUnknown] = useState(false);

    const fetchSummary = useCallback(async () => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 3600 * 24));
        if (diffDays > 7) {
            alert('측정일자 검색 기간은 7일 이내만 가능합니다.');
            return;
        }
        try {
            setLoading(true);
            const res = await axios.get('/api/ble-logs', {
                params: { startDate, endDate, vendorGroup: selectedGroup, onlyUnknown }
            });
            if (res.data.success) {
                setSummaryData(res.data.data);
                setSelectedIdx(null);
                setDetailData([]);
            }
        } catch (err) {
            console.error('Fetch ble logs summary error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedGroup, onlyUnknown]);

    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const res = await axios.get('/api/content-agg', { params: {} }); // reuse brand list logic
                if (res.data.success) setVendorGroups(res.data.brands);
            } catch (e) { console.error(e); }
        };
        fetchGroups();
    }, []);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const handleRowClick = async (idx: number, item: BleSummary) => {
        setSelectedIdx(idx);
        try {
            setDetailLoading(true);
            const res = await axios.get('/api/ble-logs/details', {
                params: {
                    date: item.LOG_DT,
                    mac: item.DEVICE_MAC,
                    vendorCd: item.VENDOR_CD
                }
            });
            if (res.data.success) {
                setDetailData(res.data.data);
            }
        } catch (err) {
            console.error('Fetch ble details error:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const formatDate = (val: string) => {
        if (!val || val.length !== 8) return val;
        return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
    };

    const formatTime = (val: string) => {
        if (!val || val.length !== 4) return val;
        return `${val.slice(0, 2)}:${val.slice(2, 4)}`;
    };

    const totalObsMinutes = summaryData.reduce((acc, cur) => {
        const parts = cur.TOTAL_OBSERVED?.split(':') || ['0','0','0'];
        return acc + parseInt(parts[0])*60 + parseInt(parts[1]) + parseInt(parts[2])/60;
    }, 0);

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card bc-toolbar-card" style={{ marginBottom: '1rem' }}>
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Activity size={20} color="var(--mgmt-primary)" />
                        <span className="vm-title-text">인원 계수측정 집계</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} />} label="새로고침(F2)" variant="secondary" onClick={fetchSummary} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchSummary} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={onClose} />
                    </div>
                </div>
            </div>

            {/* Filter Area */}
            <div className="mgmt-card perp-filter-bar" style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1.25rem', alignItems: 'center' }}>
                <div className="ble-filter-item">
                    <span className="mgmt-label">회사코드</span>
                    <input className="mgmt-input" defaultValue="JOOT AMS" readOnly style={{ width: '100px' }} />
                </div>
                <div className="ble-filter-item">
                    <span className="mgmt-label" style={{ color: 'red' }}>측정일자</span>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="date" className="mgmt-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span style={{ color: 'var(--text-main)' }}>~</span>
                        <input type="date" className="mgmt-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="ble-filter-item">
                    <span className="mgmt-label">점포그룹</span>
                    <select className="mgmt-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} style={{ width: '150px' }}>
                        <option value="ALL">전체</option>
                        {vendorGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
                <div className="ble-checkbox-group" onClick={() => setOnlyUnknown(!onlyUnknown)}>
                    <input type="checkbox" checked={onlyUnknown} readOnly />
                    <span className="ble-checkbox-label">Unknown장비만 보기</span>
                </div>
            </div>

            <div className="ble-layout-container">
                {/* Top Table: Summary */}
                <div className="mgmt-card ble-card-summary">
                    <div className="mgmt-table-wrapper vm-table-wrapper-no-pad">
                        <table className="mgmt-table ble-table">
                            <thead>
                                <tr>
                                    <th colSpan={11} className="group-header">측정정보</th>
                                </tr>
                                <tr>
                                    <th style={{ width: '90px' }}>측정일자</th>
                                    <th style={{ width: '150px' }}>점포명</th>
                                    <th style={{ width: '140px' }}>MAC주소</th>
                                    <th style={{ width: '100px' }}>장비명</th>
                                    <th style={{ width: '80px' }}>신호세기</th>
                                    <th style={{ width: '70px' }}>거리</th>
                                    <th style={{ width: '70px' }}>최초시간</th>
                                    <th style={{ width: '70px' }}>마지막시간</th>
                                    <th style={{ width: '100px' }}>최초인식</th>
                                    <th style={{ width: '100px' }}>마지막인식</th>
                                    <th style={{ width: '100px' }}>인식시간</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryData.map((item, idx) => (
                                    <tr 
                                        key={`${item.LOG_DT}-${item.DEVICE_MAC}-${idx}`} 
                                        className={`vm-row ${selectedIdx === idx ? 'ble-row-selected' : ''}`}
                                        onClick={() => handleRowClick(idx, item)}
                                    >
                                        <td className="ble-cell-center">{formatDate(item.LOG_DT)}</td>
                                        <td>{item.VENDOR_NM}</td>
                                        <td className="ble-cell-center" style={{ fontWeight: 600 }}>{item.DEVICE_MAC}</td>
                                        <td className="ble-cell-center">{item.DEVICE_NM}</td>
                                        <td className="ble-cell-right">{item.DEVICE_RSSI}</td>
                                        <td className="ble-cell-right">{item.DEVICE_DISTANCE}</td>
                                        <td className="ble-cell-center">{formatTime(item.FIRST_HH)}</td>
                                        <td className="ble-cell-center">{formatTime(item.LAST_HH)}</td>
                                        <td className="ble-cell-center">{item.FIRST_IN_TIME}</td>
                                        <td className="ble-cell-center">{item.LAST_IN_TIME}</td>
                                        <td className="ble-cell-center" style={{ color: 'var(--mgmt-primary)', fontWeight: 700 }}>{item.TOTAL_OBSERVED}</td>
                                    </tr>
                                ))}
                                {summaryData.length === 0 && !loading && (
                                    <tr><td colSpan={11} className="vm-cell-empty">조회된 데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                        {loading && <div className="mgmt-loading-overlay">로딩 중...</div>}
                    </div>
                    <div className="ble-footer">
                        <span>총 건수: <span className="ble-footer-val">{summaryData.length}</span></span>
                        <span>총 인식시간: <span className="ble-footer-val">{Math.floor(totalObsMinutes)}분</span></span>
                    </div>
                </div>

                {/* Bottom Table: Detail */}
                <div className="mgmt-card ble-card-detail">
                    <div className="mgmt-table-wrapper vm-table-wrapper-no-pad">
                        <table className="mgmt-table ble-table">
                            <thead>
                                <tr>
                                    <th colSpan={7} className="group-header">상세 측정정보 {selectedIdx !== null ? `[MAC: ${summaryData[selectedIdx].DEVICE_MAC}]` : ''}</th>
                                </tr>
                                <tr>
                                    <th style={{ width: '70px' }}>시간</th>
                                    <th style={{ width: '140px' }}>MAC주소</th>
                                    <th style={{ width: '100px' }}>장비명</th>
                                    <th style={{ width: '80px' }}>신호세기</th>
                                    <th style={{ width: '70px' }}>거리</th>
                                    <th style={{ width: '100px' }}>최초인식</th>
                                    <th style={{ width: '100px' }}>마지막인식</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detailData.map((item, idx) => (
                                    <tr key={idx} className="vm-row">
                                        <td className="ble-cell-center">{formatTime(item.LOG_TIME)}</td>
                                        <td className="ble-cell-center">{item.DEVICE_MAC}</td>
                                        <td className="ble-cell-center">{item.DEVICE_NM}</td>
                                        <td className="ble-cell-right">{item.DEVICE_RSSI}</td>
                                        <td className="ble-cell-right">{item.DEVICE_DISTANCE}</td>
                                        <td className="ble-cell-center">{item.FIRST_SEEN}</td>
                                        <td className="ble-cell-center">{item.LAST_SEEN}</td>
                                    </tr>
                                ))}
                                {detailData.length === 0 && !detailLoading && (
                                    <tr><td colSpan={7} className="vm-cell-empty">상단 목록에서 항목을 선택해 주세요.</td></tr>
                                )}
                            </tbody>
                        </table>
                        {detailLoading && <div className="mgmt-loading-overlay">상세 로딩 중...</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode; label: string; variant: 'primary' | 'success' | 'danger' | 'secondary'; onClick?: () => void }> = ({ icon, label, variant, onClick }) => (
    <button className={`mgmt-toolbar-btn mgmt-btn-${variant}`} onClick={onClick}>
        {icon}
        {label}
    </button>
);

export default BleLogAggContent;
