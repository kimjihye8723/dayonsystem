import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer, FileSpreadsheet, X, History as HistoryIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import axios from 'axios';
import './AdPlayLogContent.css';

interface AdPlayLog {
    VENDOR_NM: string;
    DEVICE_ID: string;
    DEVICE_NM: string;
    VENDOR_OPEN_TIME: string;
    VENDOR_CLOSE_TIME: string;
    LOG_DT: string;
    LOG_TIME: string;
    CT_TIME: string;
    CT_TIMELOC: string;
    CT_OPENTIME: string;
    CT_CLOSETIME: string;
    IP_ADDRESS: string;
    CUR_PROGRAM: string;
    CUR_FILE: string;
}

interface Props {
    theme: 'light' | 'dark';
    onClose?: () => void;
}

const AdPlayLogContent: React.FC<Props> = ({ theme, onClose }) => {
    const [logs, setLogs] = useState<AdPlayLog[]>([]);
    const [loading, setLoading] = useState(false);

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 30;

    // Filters (Default to last 30 days to ensure data visibility)
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchVendor, setSearchVendor] = useState('');
    const [area1, setArea1] = useState('ALL');
    const [area2, setArea2] = useState('ALL');
    const [area3, setArea3] = useState('ALL');

    const fetchLogs = useCallback(async (targetPage: number = 1) => {
        try {
            setLoading(true);
            const params = {
                startDate,
                endDate,
                vendorNm: searchVendor,
                area1: area1 === 'ALL' ? '' : area1,
                area2: area2 === 'ALL' ? '' : area2,
                area3: area3 === 'ALL' ? '' : area3,
                page: targetPage,
                pageSize
            };
            const res = await axios.get('/api/ad-play-logs', { params });
            if (res.data.success) {
                setLogs(res.data.logs);
                setTotalPages(res.data.totalPages);
                setTotalCount(res.data.totalCount);
                setPage(res.data.currentPage);
            }
        } catch (err) {
            console.error('Fetch ad play logs error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, searchVendor, area1, area2, area3]);

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const handleSearch = () => {
        fetchLogs(1);
    };

    const handleRefresh = () => {
        const today = new Date().toISOString().split('T')[0];
        const prevMonth = new Date();
        prevMonth.setDate(prevMonth.getDate() - 30);

        setStartDate(prevMonth.toISOString().split('T')[0]);
        setEndDate(today);
        setSearchVendor('');
        setArea1('ALL');
        setArea2('ALL');
        setArea3('ALL');
        fetchLogs(1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            fetchLogs(newPage);
        }
    };

    // Format LOG_DT (YYYYMMDD -> YYYY-MM-DD)
    const formatDate = (val: string) => {
        if (!val || val.length !== 8) return val;
        return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
    };

    // Format LOG_TIME (HHMM or HHMMSS -> HH:MM:SS)
    const formatTime = (val: string) => {
        if (!val) return '';
        if (val.length === 4) return `${val.slice(0, 2)}:${val.slice(2, 4)}`;
        if (val.length >= 6) return `${val.slice(0, 2)}:${val.slice(2, 4)}:${val.slice(4, 6)}`;
        return val;
    };

    // Pagination helper: Generate page numbers to show
    const getPageNumbers = () => {
        const delta = 2;
        const range = [];
        for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
            range.push(i);
        }

        if (page - delta > 2) range.unshift('...');
        if (totalPages > 1) range.unshift(1);
        if (page + delta < totalPages - 1) range.push('...');
        if (totalPages > 1) range.push(totalPages);

        return range;
    };

    return (
        <div className="apc-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="apc-card apc-toolbar-card">
                <div className="apc-toolbar">
                    <div className="apc-title-area">
                        <HistoryIcon size={20} color="var(--mgmt-primary)" />
                        <span className="apc-title-text">광고송출 로그조회</span>
                    </div>
                    <div className="apc-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={handleSearch} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => alert('엑셀 다운로드 (전체 데이터 대비 페이징 데이터만 가능)')} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={onClose} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="apc-card apc-filter-card">
                <div className="apc-filter-item">
                    <span className="apc-label">회사코드</span>
                    <select className="mgmt-input apc-select">
                        <option value="JOOT AMS">JOOT AMS</option>
                    </select>
                </div>
                <div className="apc-filter-item">
                    <span className="apc-label" style={{ color: 'red' }}>광고일자</span>
                    <div className="apc-date-range">
                        <input type="date" className="mgmt-input apc-date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span>~</span>
                        <input type="date" className="mgmt-input apc-date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="apc-filter-item">
                    <span className="apc-label">점포</span>
                    <input type="text" className="mgmt-input apc-input" placeholder="점포명" value={searchVendor} onChange={e => setSearchVendor(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                </div>
                <div className="apc-filter-item">
                    <span className="apc-label">지역A</span>
                    <select className="mgmt-input apc-select" value={area1} onChange={e => setArea1(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="apc-filter-item">
                    <span className="apc-label">지역B</span>
                    <select className="mgmt-input apc-select" value={area2} onChange={e => setArea2(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="apc-filter-item">
                    <span className="apc-label">지역C</span>
                    <select className="mgmt-input apc-select" value={area3} onChange={e => setArea3(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
            </div>

            {/* Main Content */}
            <div className="apc-card apc-main-card">
                <div className="apc-info-bar">
                    <div className="apc-total-count">총 {totalCount.toLocaleString()} 건 (페이지 {page}/{totalPages})</div>
                </div>

                <div className="apc-table-wrapper">
                    <table className="apc-table">
                        <thead>
                            <tr>
                                <th colSpan={5} className="group-header">점포정보</th>
                                <th colSpan={3} className="group-header">로그정보</th>
                                <th colSpan={7} className="group-header">장비정보</th>
                            </tr>
                            <tr>
                                <th style={{ width: '120px' }}>점포</th>
                                <th style={{ width: '130px' }}>디바이스ID</th>
                                <th style={{ width: '150px' }}>디바이스명</th>
                                <th style={{ width: '80px' }}>오픈시간</th>
                                <th style={{ width: '80px' }}>종료시간</th>

                                <th style={{ width: '130px' }}>로그시간</th>
                                <th style={{ width: '100px' }}>로그일자</th>
                                <th style={{ width: '80px' }}>로그시간</th>

                                <th style={{ width: '150px' }}>장비 시간정보</th>
                                <th style={{ width: '180px' }}>장비 UTC정보</th>
                                <th style={{ width: '80px' }}>장비 온시간</th>
                                <th style={{ width: '80px' }}>장비 오프시간</th>
                                <th style={{ width: '120px' }}>장비IP주소</th>
                                <th style={{ width: '150px' }}>재생 프로그램</th>
                                <th style={{ width: '250px' }}>재생 파일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log, idx) => (
                                <tr key={`${log.DEVICE_ID}-${log.LOG_DT}-${log.LOG_TIME}-${idx}`}>
                                    <td className="apc-table-cell-center">{log.VENDOR_NM}</td>
                                    <td className="apc-table-cell-center">{log.DEVICE_ID}</td>
                                    <td>{log.DEVICE_NM}</td>
                                    <td className="apc-table-cell-center">{log.VENDOR_OPEN_TIME}</td>
                                    <td className="apc-table-cell-center">{log.VENDOR_CLOSE_TIME}</td>

                                    <td className="apc-table-cell-center">{formatDate(log.LOG_DT)} {formatTime(log.LOG_TIME)}</td>
                                    <td className="apc-table-cell-center">{formatDate(log.LOG_DT)}</td>
                                    <td className="apc-table-cell-center">{formatTime(log.LOG_TIME)}</td>

                                    <td className="apc-table-cell-center">{log.CT_TIME}</td>
                                    <td>{log.CT_TIMELOC}</td>
                                    <td className="apc-table-cell-center">{log.CT_OPENTIME}</td>
                                    <td className="apc-table-cell-center">{log.CT_CLOSETIME}</td>
                                    <td className="apc-table-cell-center">{log.IP_ADDRESS}</td>
                                    <td className="col-truncate" title={log.CUR_PROGRAM}>{log.CUR_PROGRAM}</td>
                                    <td className="col-truncate" title={log.CUR_FILE}>{log.CUR_FILE}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && !loading && (
                                <tr><td colSpan={15} className="apc-table-empty">조회된 데이터가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                    {loading && <div className="mgmt-loading-overlay">로딩 중...</div>}
                </div>

                {/* Pagination Controls */}
                {totalPages > 0 && (
                    <div className="apc-pagination">
                        <button className="apc-page-btn" onClick={() => handlePageChange(1)} disabled={page === 1}>
                            <ChevronsLeft size={16} />
                        </button>
                        <button className="apc-page-btn" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
                            <ChevronLeft size={16} />
                        </button>

                        <div className="apc-page-numbers" style={{ display: 'flex', gap: '0.25rem' }}>
                            {getPageNumbers().map((p, i) => (
                                p === '...' ? (
                                    <span key={`dots-${i}`} className="apc-page-info">...</span>
                                ) : (
                                    <button
                                        key={`page-${p}`}
                                        className={`apc-page-btn ${page === p ? 'active' : ''}`}
                                        onClick={() => handlePageChange(p as number)}
                                    >
                                        {p}
                                    </button>
                                )
                            ))}
                        </div>

                        <button className="apc-page-btn" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
                            <ChevronRight size={16} />
                        </button>
                        <button className="apc-page-btn" onClick={() => handlePageChange(totalPages)} disabled={page === totalPages}>
                            <ChevronsRight size={16} />
                        </button>
                    </div>
                )}
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

export default AdPlayLogContent;
