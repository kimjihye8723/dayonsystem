import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer, FileSpreadsheet, X, BarChart3 } from 'lucide-react';
import axios from 'axios';
import './ContentAggContent.css';

interface ContentAggData {
    LOG_DT: string;
    CONTENTS_KEY: string;
    CONTENTS_NM: string;
    ADVERTISER_NM: string;
    [key: string]: any; // For dynamic brand counts
}

interface Props {
    theme: 'light' | 'dark';
    onClose?: () => void;
}

const ContentAggContent: React.FC<Props> = ({ theme, onClose }) => {
    const [data, setData] = useState<ContentAggData[]>([]);
    const [brands, setBrands] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchAdvertiser, setSearchAdvertiser] = useState('');
    const [searchContent, setSearchContent] = useState('');
    const [area1, setArea1] = useState('ALL');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                startDate,
                endDate,
                advertiser: searchAdvertiser,
                content: searchContent,
                area1: area1 === 'ALL' ? '' : area1
            };
            const res = await axios.get('/api/content-agg', { params });
            if (res.data.success) {
                setData(res.data.data);
                setBrands(res.data.brands);
            }
        } catch (err) {
            console.error('Fetch content agg error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, searchAdvertiser, searchContent, area1]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = () => {
        const today = new Date().toISOString().split('T')[0];
        const prevMonth = new Date();
        prevMonth.setDate(prevMonth.getDate() - 30);
        
        setStartDate(prevMonth.toISOString().split('T')[0]);
        setEndDate(today);
        setSearchAdvertiser('');
        setSearchContent('');
        setArea1('ALL');
        fetchData();
    };

    // Format LOG_DT (YYYYMMDD -> YYYY-MM-DD)
    const formatDate = (val: string) => {
        if (!val || val.length !== 8) return val;
        return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
    };

    return (
        <div className="cac-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="cac-card cac-toolbar-card">
                <div className="cac-toolbar">
                    <div className="cac-title-area">
                        <BarChart3 size={20} color="var(--mgmt-primary)" />
                        <span className="cac-title-text">컨텐츠별 집계조회</span>
                    </div>
                    <div className="cac-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchData} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => alert('엑셀 다운로드')} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={onClose} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="cac-card cac-filter-card">
                <div className="cac-filter-item">
                    <span className="cac-label">회사코드</span>
                    <select className="mgmt-input cac-select">
                        <option value="JOOT AMS">JOOT AMS</option>
                    </select>
                </div>
                <div className="cac-filter-item">
                    <span className="cac-label" style={{ color: 'red' }}>광고일자</span>
                    <div className="cac-date-range">
                        <input type="date" className="mgmt-input cac-date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span>~</span>
                        <input type="date" className="mgmt-input cac-date-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="cac-filter-item">
                    <span className="cac-label">점포그룹</span>
                    <select className="mgmt-input cac-select" value={area1} onChange={e => setArea1(e.target.value)}>
                        <option value="ALL">전체</option>
                    </select>
                </div>
                <div className="cac-filter-item">
                    <span className="cac-label">광고주</span>
                    <input type="text" className="mgmt-input cac-input" placeholder="광고주명" value={searchAdvertiser} onChange={e => setSearchAdvertiser(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchData()} />
                </div>
                <div className="cac-filter-item">
                    <span className="cac-label">컨텐츠</span>
                    <input type="text" className="mgmt-input cac-input" placeholder="컨텐츠명" value={searchContent} onChange={e => setSearchContent(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchData()} />
                </div>
            </div>

            {/* Main Content */}
            <div className="cac-card cac-main-card">
                <div className="cac-info-bar">
                    <div className="cac-total-count">총 {data.length} 건</div>
                </div>

                <div className="cac-table-wrapper">
                    <table className="cac-table">
                        <thead>
                            <tr>
                                <th colSpan={4} className="group-header">광고정보</th>
                                <th colSpan={brands.length} className="group-header">점포그룹</th>
                            </tr>
                            <tr>
                                <th style={{ width: '100px' }}>광고일자</th>
                                <th style={{ width: '150px' }}>컨텐츠키</th>
                                <th style={{ width: '200px' }}>컨텐츠명</th>
                                <th style={{ width: '120px' }}>광고주</th>
                                
                                {brands.map(brand => (
                                    <th key={brand} style={{ minWidth: '100px' }}>{brand}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={`${row.LOG_DT}-${row.CONTENTS_KEY}-${idx}`}>
                                    <td className="cac-table-cell-center">{formatDate(row.LOG_DT)}</td>
                                    <td className="cac-table-cell-center">{row.CONTENTS_KEY}</td>
                                    <td>{row.CONTENTS_NM}</td>
                                    <td className="cac-table-cell-center">{row.ADVERTISER_NM}</td>
                                    
                                    {brands.map(brand => (
                                        <td key={brand} className="cac-table-cell-right col-num">
                                            {row[brand]?.toLocaleString() || 0}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {data.length === 0 && !loading && (
                                <tr><td colSpan={4 + brands.length} className="cac-table-empty">조회된 데이터가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                    {loading && <div className="mgmt-loading-overlay">로딩 중...</div>}
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

export default ContentAggContent;
