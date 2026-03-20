import React, { useState, useEffect, useCallback } from 'react';
import { Search, Printer, FileSpreadsheet, CalendarDays, FilePenLine, SquareX } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import '../../styles/partials/TodayAppliedScheduleContent.css';

interface TodaySchedule {
    VENDOR_CD: string;
    VENDOR_NM: string;
    OPEN_TIME: string;
    CLOSE_TIME: string;
    [key: string]: string; // SCH_00 ~ SCH_23
}

interface AdContent {
    CONTENTS_ID: string;
    TITLE: string;
}

interface Props {
    theme: 'light' | 'dark';
    onClose?: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

const TodayAppliedScheduleContent: React.FC<Props> = ({ theme, onClose }) => {
    const [schedules, setSchedules] = useState<TodaySchedule[]>([]);
    const [contents, setContents] = useState<AdContent[]>([]);
    const [loading, setLoading] = useState(false);
    const [vendorNm, setVendorNm] = useState('');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [schedRes, contRes] = await Promise.all([
                axios.get('/api/today-applied-schedules', { params: { vendorNm } }),
                axios.get('/api/ad-contents')
            ]);

            if (schedRes.data.success) {
                setSchedules(schedRes.data.schedules);
            }
            if (contRes.data.success) {
                setContents(contRes.data.contents);
            }
        } catch (err) {
            console.error('Fetch today schedule error:', err);
        } finally {
            setLoading(false);
        }
    }, [vendorNm]);

    useEffect(() => {
        fetchData();
    }, []);

    const handleRefresh = () => {
        setVendorNm('');
        setTimeout(fetchData, 0);
    };

    const getContentTitle = (id: string | null) => {
        if (!id) return '';
        const content = contents.find(c => c.CONTENTS_ID === id);
        return content ? content.TITLE : id;
    };

    const handleExcelDownload = () => {
        const headers = ['점포', '오픈시간', '종료시간', ...HOURS.map(h => `${h}시`)];
        const data = schedules.map(s => [
            s.VENDOR_NM,
            s.OPEN_TIME,
            s.CLOSE_TIME,
            ...HOURS.map(h => getContentTitle(s[`SCH_${h}`]))
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'TodaySchedule');
        XLSX.writeFile(wb, `Today_Schedule_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); handleRefresh(); }
            if (e.key === 'F3') { e.preventDefault(); fetchData(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh, fetchData]);

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card tas-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <CalendarDays size={20} color="var(--mgmt-primary)" />
                        <span className="tas-title-text">당일 적용 스케쥴</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<FilePenLine size={16} color="#d97706" />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} color="#3b82f6" />} label="조회(F3)" variant="primary" onClick={fetchData} />
                        <ToolbarBtn icon={<Printer size={16} color="#4b5563" />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} color="#10b981" />} label="엑셀(F7)" variant="success" onClick={handleExcelDownload} />
                        <ToolbarBtn icon={<SquareX size={16} color="#475569" />} label="창닫기" variant="danger" onClick={() => onClose?.()} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="mgmt-card tas-filter-bar">
                <div className="tas-filter-item">
                    <span className="tas-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input type="text" className="mgmt-input tas-filter-input-small" value="JOOT AMS" readOnly style={{ background: 'var(--table-header)' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="tas-filter-item">
                    <span className="tas-filter-label">점포</span>
                    <div className="mgmt-btn-group">
                        <input
                            className="mgmt-input tas-filter-search-input"
                            placeholder="점포명 검색..."
                            value={vendorNm}
                            onChange={(e) => setVendorNm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                        />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }} onClick={fetchData}>
                            <Search size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="mgmt-card tas-main-card">
                <div className="tas-info-bar">
                    <div className="tas-sub-title">현재 시점에 적용되는 광고 스케쥴 입니다.</div>
                    <div className="tas-total-count">총 {schedules.length} 건</div>
                </div>

                <div className="tas-table-wrapper">
                    <table className="tas-table">
                        <thead>
                            <tr>
                                <th className="tas-sticky-col tas-col-no" style={{ left: 0 }}>NO</th>
                                <th className="tas-sticky-col tas-col-vendor" style={{ left: '40px' }}>점포</th>
                                <th className="tas-col-time">오픈시간</th>
                                <th className="tas-col-time">종료시간</th>
                                {HOURS.map(h => <th key={h} className="tas-col-hour">{h}시</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.map((s, idx) => (
                                <tr key={s.VENDOR_CD}>
                                    <td className="tas-cell-center tas-sticky-col tas-col-no" style={{ left: 0 }}>{idx + 1}</td>
                                    <td className="tas-cell-bold tas-sticky-col tas-col-vendor" style={{ left: '40px' }}>{s.VENDOR_NM}</td>
                                    <td className="tas-cell-center">{s.OPEN_TIME || '-'}</td>
                                    <td className="tas-cell-center">{s.CLOSE_TIME || '-'}</td>
                                    {HOURS.map(h => (
                                        <td key={h} className="tas-col-hour" title={getContentTitle(s[`SCH_${h}`])}>
                                            {getContentTitle(s[`SCH_${h}`])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {schedules.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={28} className="tas-table-empty">조회된 데이터가 없습니다.</td>
                                </tr>
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

export default TodayAppliedScheduleContent;
