import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    RefreshCw, Search, FileSpreadsheet, Printer, Trash2, X,
    Calendar, Save, FileCheck
} from 'lucide-react';
import '../../styles/partials/AdScheduleSettingContent.css';

interface AdSchedule {
    SCHEDULE_KEY: string;
    REG_DT: string;
    SCHEDULE_SEC: string;
    START_DT: string;
    END_DT: string;
    USE_YN: string;
    VENDOR_COUNT: number;
    SCH_TYPE_NM?: string;
}

interface Vendor {
    CORP_CD: string;
    VENDOR_CD: string;
    VENDOR_NM: string;
    AREA_A?: string;
    AREA_B?: string;
}

interface AdContent {
    CONTENTS_ID: string;
    TITLE: string;
}

interface GridRow {
    DAY_SEC: string;
    DAY_NM: string;
    [key: string]: string; // SCH_00 ~ SCH_23
}

interface Props {
    theme: 'light' | 'dark';
}

const DAYS = [
    { id: '1', name: '월' },
    { id: '2', name: '화' },
    { id: '3', name: '수' },
    { id: '4', name: '목' },
    { id: '5', name: '금' },
    { id: '6', name: '토' },
    { id: '0', name: '일' }
];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

const AdScheduleSettingContent: React.FC<Props> = ({ theme }) => {
    const [schedules, setSchedules] = useState<AdSchedule[]>([]);
    const [selectedSchedule, setSelectedSchedule] = useState<AdSchedule | null>(null);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [displayedVendors, setDisplayedVendors] = useState<Vendor[]>([]);
    const [selectedVendorCodes, setSelectedVendorCodes] = useState<string[]>([]);
    const [contents, setContents] = useState<AdContent[]>([]);
    const [scheduleTemplates, setScheduleTemplates] = useState<any[]>([]);
    const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [gridData, setGridData] = useState<GridRow[]>(
        DAYS.map(day => {
            const row: any = { DAY_SEC: day.id, DAY_NM: day.name };
            HOURS.forEach(h => row[`SCH_${h}`] = '');
            return row;
        })
    );

    // Filters
    const [searchStartDate, setSearchStartDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    });
    const [searchEndDate, setSearchEndDate] = useState(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [searchVendorTerm, setSearchVendorTerm] = useState('');

    const fetchSchedules = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/ad-schedules', {
                params: {
                    startDate: searchStartDate,
                    endDate: searchEndDate,
                    vendorCd: searchVendorTerm // 점포코드 검색 지원
                }
            });
            setSchedules(res.data.schedules);
        } catch (e) {
            console.error('Fetch schedules error:', e);
        } finally {
            setLoading(false);
        }
    }, [searchStartDate, searchEndDate, searchVendorTerm]);

    const fetchVendors = useCallback(async () => {
        try {
            const res = await axios.get('/api/vendor-status');
            setVendors(res.data.vendors);
            setDisplayedVendors([]); // 초기에는 표시하지 않음
        } catch (e) {
            console.error('Fetch vendors error:', e);
        }
    }, []);

    const fetchContents = useCallback(async () => {
        try {
            const res = await axios.get('/api/ad-contents');
            setContents(res.data.contents);
        } catch (e) {
            console.error('Fetch contents error:', e);
        }
    }, []);

    const fetchTemplates = useCallback(async () => {
        try {
            const res = await axios.get('/api/ad-schedules/templates');
            setScheduleTemplates(res.data.templates);
        } catch (e) {
            console.error('Fetch templates error:', e);
        }
    }, []);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    useEffect(() => {
        fetchVendors();
        fetchContents();
        fetchTemplates();
    }, [fetchVendors, fetchContents, fetchTemplates]);

    const handleSave = async () => {
        if (selectedVendorCodes.length === 0) {
            alert('대상 점포를 최소 하나 이상 선택해야 합니다.');
            return;
        }
        try {
            setLoading(true);
            const res = await axios.post('/api/ad-schedules/save', {
                schedule: selectedSchedule || { REG_DT: searchStartDate },
                vendorCodes: selectedVendorCodes,
                gridData: gridData
            });
            if (res.data.success) {
                alert('스케쥴이 저장되었습니다.');
                fetchSchedules();
            }
        } catch (e) {
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                fetchSchedules();
            } else if (e.key === 'F3') {
                e.preventDefault();
                fetchSchedules();
            } else if (e.key === 'F4') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fetchSchedules, handleSave]);

    const handleDelete = () => {
        if (!selectedSchedule) return;
        if (window.confirm('선택한 스케쥴을 삭제하시겠습니까?')) {
            alert('삭제 기능은 현재 준비 중입니다.');
        }
    };

    const filteredSchedules = schedules;

    const handleScheduleSelect = async (sch: AdSchedule) => {
        setSelectedSchedule(sch);
        try {
            setLoading(true);
            const res = await axios.get('/api/ad-schedules/detail', {
                params: { scheduleKey: sch.SCHEDULE_KEY }
            });
            const details = res.data.details;

            const vCodes = Array.from(new Set(details.map((d: any) => d.VENDOR_CD))) as string[];
            setSelectedVendorCodes(vCodes);

            // "해당하는 점포만 나와야 해" 요구사항 반영: 선택한 스케쥴에 속한 점포만 표시
            const assignedVendors = vendors.filter(v => vCodes.includes(v.VENDOR_CD));
            setDisplayedVendors(assignedVendors);

            const newGrid = DAYS.map(day => {
                const dayData = details.find((d: any) => d.DAY_SEC === day.id) || {};
                const row: any = { DAY_SEC: day.id, DAY_NM: day.name };
                HOURS.forEach(h => row[`SCH_${h}`] = dayData[`SCH_${h}`] || '');
                return row;
            });
            setGridData(newGrid);
        } catch (e) {
            console.error('Fetch schedule detail error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkApply = async () => {
        if (!selectedTemplateKey) {
            alert('복사할 스케쥴 패턴을 선택하세요.');
            return;
        }
        try {
            setLoading(true);
            const res = await axios.get('/api/ad-schedules/detail', {
                params: { scheduleKey: selectedTemplateKey }
            });
            const details = res.data.details;
            const newGrid = DAYS.map(day => {
                const dayData = details.find((d: any) => d.DAY_SEC === day.id) || {};
                const row: any = { DAY_SEC: day.id, DAY_NM: day.name };
                HOURS.forEach(h => row[`SCH_${h}`] = dayData[`SCH_${h}`] || '');
                return row;
            });
            setGridData(newGrid);
            alert('스케쥴 패턴이 현재 그리드에 적용되었습니다.');
        } catch (e) {
            console.error('Bulk apply error:', e);
            alert('패턴 적용 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const getContentName = (key: string) => {
        const c = contents.find(item => item.CONTENTS_ID === key);
        return c ? c.TITLE : '';
    };

    const formatDate = (str: string) => {
        if (!str || str.length < 8) return str;
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    };

    return (
        <div className="AdScheduleSettingContent" data-theme={theme}>
            {/* Toolbar Area */}
            <div className="mgmt-card ass-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={20} color="var(--mgmt-primary)" />
                        <span className="ass-title-text" style={{ fontSize: '1.25rem', fontWeight: 900 }}>광고 스케쥴 설정</span>
                    </div>

                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={fetchSchedules} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchSchedules} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => { }} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<FileCheck size={16} />} label="컨텐츠반영" variant="success" onClick={() => alert('컨텐츠 반영 기능은 현재 준비 중입니다.')} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={() => { }} />
                    </div>
                </div>
            </div>

            {/* Filter Bar - Simplified as items moved to sidebar */}
            <div className="mgmt-card ass-toolbar-card" style={{ padding: '8px 12px', display: 'flex', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="mgmt-label">회사코드</span>
                    <input className="mgmt-input" defaultValue="JOOT AMS" readOnly style={{ width: '120px', background: 'var(--table-header)' }} />
                    <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="mgmt-label">광고기간</span>
                    <input type="date" className="mgmt-input" style={{ width: '130px' }} value={searchStartDate} onChange={(e) => setSearchStartDate(e.target.value)} />
                    <span style={{ color: 'var(--text-muted)' }}>~</span>
                    <input type="date" className="mgmt-input" style={{ width: '130px' }} value={searchEndDate} onChange={(e) => setSearchEndDate(e.target.value)} />
                </div>
            </div>

            <div className="ass-main-layout">
                {/* Left - Filters & Schedule List */}
                <div className="mgmt-card ass-sidebar-card">
                    <div className="ass-filter-group">
                        <div className="ass-filter-row">
                            <span className="ass-filter-label">회사코드</span>
                            <input className="mgmt-input" defaultValue="JOOT AMS" />
                            <button className="mgmt-toolbar-btn" style={{ padding: '0 4px' }}>...</button>
                        </div>
                        <div className="ass-filter-row">
                            <span className="ass-filter-label">등록일자</span>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flex: 1 }}>
                                <input type="date" className="mgmt-input" value={searchStartDate} onChange={(e) => setSearchStartDate(e.target.value)} />
                                <span style={{ fontSize: '10px' }}>~</span>
                                <select className="mgmt-select">
                                    <option value=""></option>
                                </select>
                            </div>
                        </div>
                        <div className="ass-filter-row">
                            <span className="ass-filter-label">점포</span>
                            <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                <input
                                    className="mgmt-input"
                                    value={searchVendorTerm}
                                    onChange={(e) => setSearchVendorTerm(e.target.value)}
                                    placeholder=""
                                    style={{ flex: 1 }}
                                />
                                <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }} onClick={fetchSchedules}>
                                    <Search size={14} color="#3b82f6" /> 조회
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="ass-subgrid-header">스케쥴 등록 현황</div>
                    <div className="mgmt-table-wrapper ass-table-wrapper">
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '25px' }}></th>
                                    <th style={{ width: '100px' }}>등록일자</th>
                                    <th>등록구분</th>
                                    <th style={{ width: '70px' }}>등록매장</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSchedules.map(s => (
                                    <tr
                                        key={s.SCHEDULE_KEY}
                                        className={selectedSchedule?.SCHEDULE_KEY === s.SCHEDULE_KEY ? 'selected' : ''}
                                        onClick={() => handleScheduleSelect(s)}
                                    >
                                        <td className="text-center" style={{ padding: '0', color: 'var(--primary)', fontSize: '10px' }}>
                                            {selectedSchedule?.SCHEDULE_KEY === s.SCHEDULE_KEY ? '▶' : ''}
                                        </td>
                                        <td className="text-center">{formatDate(s.REG_DT)}</td>
                                        <td className="text-center">{s.SCH_TYPE_NM || '개별매장'}</td>
                                        <td className="text-right" style={{ paddingRight: '10px' }}>{s.VENDOR_COUNT}</td>
                                    </tr>
                                ))}
                                {filteredSchedules.length === 0 && !loading && (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="ass-status-bar">총 {schedules.length} 건</div>
                </div>

                {/* Right - Detail Setting */}
                <div className="ass-detail-card">
                    {!selectedSchedule ? (
                        <div className="mgmt-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            좌측 목록에서 스케쥴을 선택해 주세요.
                        </div>
                    ) : (
                        <>
                            {/* Right Top - Vendor Selection */}
                            <div className="mgmt-card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', height: '220px' }}>
                                <div className="ass-subgrid-header" >대상 점포</div>

                                <div className="mgmt-table-wrapper ass-table-wrapper" style={{ flex: 1 }}>
                                    <table className="mgmt-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '40px' }} className="text-center">선택</th>
                                                <th>점포명</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedVendors.map(v => (
                                                <tr key={v.VENDOR_CD} className={selectedVendorCodes.includes(v.VENDOR_CD) ? 'selected' : ''}>
                                                    <td className="text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedVendorCodes.includes(v.VENDOR_CD)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedVendorCodes([...selectedVendorCodes, v.VENDOR_CD]);
                                                                else setSelectedVendorCodes(selectedVendorCodes.filter(c => c !== v.VENDOR_CD));
                                                            }}
                                                        />
                                                    </td>
                                                    <td>{v.VENDOR_NM}</td>
                                                </tr>
                                            ))}
                                            {displayedVendors.length === 0 && (
                                                <tr><td colSpan={2} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>할당된 점포가 없습니다.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Right Bottom - Grid Setup */}
                            <div className="ass-grid-container" style={{ marginTop: '0.75rem' }}>
                                <div className="ass-subgrid-header">컨텐츠 일괄 적용</div>

                                <div className="ass-bulk-bar" style={{ background: 'var(--table-header)', gap: '8px' }}>
                                    <span className="mgmt-label" style={{ fontSize: '13px', fontWeight: 700 }}>컨텐츠</span>
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <select
                                            className="mgmt-select"
                                            style={{ width: '300px', height: '30px' }}
                                            value={selectedTemplateKey}
                                            onChange={(e) => setSelectedTemplateKey(e.target.value)}
                                        >
                                            <option value="">패턴을 복사할 스케쥴 선택</option>
                                            {scheduleTemplates.map(t => (
                                                <option key={t.SCHEDULE_KEY} value={t.SCHEDULE_KEY}>
                                                    {t.REPRESENTATIVE_VENDOR_NM || '알수없음'} ({formatDate(t.REG_DT)})
                                                </option>
                                            ))}
                                        </select>
                                        <button className="mgmt-toolbar-btn" style={{ height: '30px', padding: '0 8px' }} onClick={() => alert('상세 선택 기능은 준비 중입니다.')}>...</button>
                                    </div>
                                    <button className="mgmt-toolbar-btn mgmt-btn-success" style={{ height: '30px', padding: '0 12px' }} onClick={handleBulkApply}>
                                        <FileCheck size={14} /> 일괄적용(A)
                                    </button>
                                </div>

                                <div className="ass-grid-tip">
                                    요일별 광고 설정을 하여야 합니다. (시간별 컨텐츠는 지정하지 않을 경우 처음 지정한 시간의 컨텐츠로 송출 됩니다)
                                </div>

                                <div className="ass-grid-scroll">
                                    <table className="ass-grid-table">
                                        <thead>
                                            <tr>
                                                <th className="ass-grid-sticky-col" style={{ top: 0, zIndex: 10, minWidth: '60px' }}>요일</th>
                                                {HOURS.map(h => <th key={h} style={{ minWidth: '100px' }}>{h}시</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gridData.map(row => (
                                                <tr key={row.DAY_SEC}>
                                                    <td className="ass-grid-sticky-col" style={{ background: 'var(--table-header)', textAlign: 'left', paddingLeft: '8px' }}>{row.DAY_NM}</td>
                                                    {HOURS.map(h => (
                                                        <td key={h}>
                                                            <select
                                                                className="ass-grid-select"
                                                                value={row[`SCH_${h}`]}
                                                                title={getContentName(row[`SCH_${h}`])}
                                                                onChange={(e) => {
                                                                    const newGrid = [...gridData];
                                                                    const r = newGrid.find(gr => gr.DAY_SEC === row.DAY_SEC);
                                                                    if (r) r[`SCH_${h}`] = e.target.value;
                                                                    setGridData(newGrid);
                                                                }}
                                                            >
                                                                <option value=""></option>
                                                                {contents.map(c => (
                                                                    <option key={c.CONTENTS_ID} value={c.CONTENTS_ID} title={c.TITLE}>{c.TITLE}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
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

export default AdScheduleSettingContent;
