import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer, FileSpreadsheet, X, Monitor } from 'lucide-react';
import axios from 'axios';
import '../../styles/partials/StoreStatusContent.css';

interface StoreStatus {
    VENDOR_CD: string;
    VENDOR_NM: string;
    OPEN_TIME: string;
    CLOSE_TIME: string;
    ADDR_AREA1: string;
    ADDR_AREA2: string;
    ADDR_AREA3: string;
    DEVICE_ID: string;
    STATUS: 'ON' | 'OFF';
    LAST_CONN_DT: string;
    PGM_NM: string;
    FILE_NM: string;
    START_TM: string;
    END_TM: string;
    PLAY_TIME: string;
    CT_FILE: string;
}

interface Props {
    theme: 'light' | 'dark';
    onClose?: () => void;
}

const StoreStatusContent: React.FC<Props> = ({ theme, onClose }) => {
    const [statusList, setStatusList] = useState<StoreStatus[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [companyCode, setCompanyCode] = useState('JOOT AMS');
    const [searchVendor, setSearchVendor] = useState('');
    const [area1, setArea1] = useState('ALL');
    const [area2, setArea2] = useState('ALL');
    const [area3, setArea3] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    const fetchStatus = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/store-status', {
                params: { vendorNm: searchVendor }
            });
            if (res.data.success) {
                setStatusList(res.data.status);
            }
        } catch (err) {
            console.error('Fetch store status error:', err);
        } finally {
            setLoading(false);
        }
    }, [searchVendor]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleRefresh = () => {
        setSearchVendor('');
        setArea1('ALL');
        setArea2('ALL');
        setArea3('ALL');
        setStatusFilter('ALL');
        fetchStatus();
    };

    // Shortcut handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); handleRefresh(); }
            if (e.key === 'F3') { e.preventDefault(); fetchStatus(); }
            if (e.key === 'F7') { e.preventDefault(); alert('엑셀 다운로드 기능 준비 중입니다.'); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fetchStatus]);

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const pad = (n: number) => String(n).padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = date.getHours();
        const ampm = h >= 12 ? '오후' : '오전';
        const h12 = h % 12 || 12;
        const mi = pad(date.getMinutes());
        const s = pad(date.getSeconds());
        
        return `${y}-${m}-${d} ${ampm} ${h12}:${mi}:${s}`;
    };

    return (
        <div className="ssc-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="ssc-card ssc-toolbar-card">
                <div className="ssc-toolbar">
                    <div className="ssc-title-area">
                        <Monitor size={20} color="var(--mgmt-primary)" />
                        <span className="ssc-title-text">점포 상태 확인</span>
                    </div>
                    <div className="ssc-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchStatus} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => alert('엑셀 다운로드')} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={onClose} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="ssc-card ssc-filter-card">
                <div className="ssc-filter-item">
                    <span className="ssc-label">회사코드</span>
                    <select className="mgmt-input ssc-select" value={companyCode} onChange={e => setCompanyCode(e.target.value)}>
                        <option value="JOOT AMS">JOOT AMS</option>
                    </select>
                </div>
                <div className="ssc-filter-item">
                    <span className="ssc-label">점포</span>
                    <input type="text" className="mgmt-input ssc-input" placeholder="점포명/코드" value={searchVendor} onChange={e => setSearchVendor(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchStatus()} />
                </div>
                <div className="ssc-filter-item">
                    <span className="ssc-label">지역A</span>
                    <select className="mgmt-input ssc-select" value={area1} onChange={e => setArea1(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="ssc-filter-item">
                    <span className="ssc-label">지역B</span>
                    <select className="mgmt-input ssc-select" value={area2} onChange={e => setArea2(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="ssc-filter-item">
                    <span className="ssc-label">지역C</span>
                    <select className="mgmt-input ssc-select" value={area3} onChange={e => setArea3(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="ssc-filter-item">
                    <span className="ssc-label">ON/OFF</span>
                    <select className="mgmt-input ssc-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="ALL">전체</option>
                        <option value="ON">ON</option>
                        <option value="OFF">OFF</option>
                    </select>
                </div>
            </div>

            {/* Main Content */}
            <div className="ssc-card ssc-main-card">
                <div className="ssc-info-bar">
                    <div className="ssc-total-count">총 {statusList.length} 건</div>
                </div>

                <div className="ssc-table-wrapper">
                    <table className="ssc-table">
                        <thead>
                            <tr>
                                <th>점포</th>
                                <th>오픈시간</th>
                                <th>종료시간</th>
                                <th>상태</th>
                                <th>마지막접속일시</th>
                                <th style={{ width: '140px' }}>광고 프로그램</th>
                                <th style={{ width: '180px' }}>광고 파일</th>
                                <th>최초시간</th>
                                <th>마지막시간</th>
                                <th>금일 송출시간</th>
                                <th style={{ width: '180px' }}>CT저장파일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {statusList.map((item, idx) => (
                                <tr key={`${item.VENDOR_CD}-${item.DEVICE_ID}-${idx}`}>
                                    <td className="ssc-table-cell-center">{item.VENDOR_NM}</td>
                                    <td className="ssc-table-cell-center">{item.OPEN_TIME}</td>
                                    <td className="ssc-table-cell-center">{item.CLOSE_TIME}</td>
                                    <td className={`ssc-table-cell-center ${item.STATUS === 'ON' ? 'status-on' : 'status-off'}`}>
                                        {item.STATUS}
                                    </td>
                                    <td className="ssc-table-cell-center">{formatDateTime(item.LAST_CONN_DT)}</td>
                                    <td className="col-truncate col-program" title={item.PGM_NM}>{item.PGM_NM}</td>
                                    <td className="col-truncate col-file" title={item.FILE_NM}>{item.FILE_NM}</td>
                                    <td className="ssc-table-cell-center">{item.START_TM}</td>
                                    <td className="ssc-table-cell-center">{item.END_TM}</td>
                                    <td className="ssc-table-cell-center">{item.PLAY_TIME}</td>
                                    <td className="col-truncate col-ctfile" title={item.CT_FILE}>{item.CT_FILE}</td>
                                </tr>
                            ))}
                            {statusList.length === 0 && !loading && (
                                <tr><td colSpan={11} className="ssc-table-empty">조회된 데이터가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
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

export default StoreStatusContent;
