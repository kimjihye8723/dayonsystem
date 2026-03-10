import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Trash2, RefreshCw, Plus, Search, FileSpreadsheet, Download } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import './DeviceManagementContent.css';

// TCM_VENDOR_DEVICE 테이블 기준 인터페이스
interface Device {
    DEVICE_KEY: string;     // PK (기존 레코드), 신규 시 서버 자동 채번
    DEVICE_ID: string;      // 장비 ID
    VENDOR_CD: string;      // 거래처 코드
    VENDOR_NM?: string;     // 거래처명 (JOIN)
    DEVICE_NM: string;      // 장비명
    POSITION_NM: string;    // 설치위치
    USE_YN: string;         // 사용여부 Y/N
    REMARK?: string;        // 비고
    REGISTDT?: string;      // 등록일시
    isNew?: boolean;        // 신규 행 여부 (프론트 전용)
}

interface Props {
    theme: 'light' | 'dark';
}

const DeviceManagementContent: React.FC<Props> = ({ theme }) => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filters
    const [startDate, setStartDate] = useState(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, ''));
    const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    const [searchVendor, setSearchVendor] = useState('');

    const fetchDevices = useCallback(async (overrides?: { startDate?: string, endDate?: string, vendorNm?: string }) => {
        try {
            setLoading(true);
            const startTime = Date.now();
            const params = {
                startDate: overrides?.startDate ?? startDate,
                endDate: overrides?.endDate ?? endDate,
                vendorNm: overrides?.vendorNm ?? searchVendor
            };
            const res = await axios.get('/api/devices', { params });

            // Artificial delay (min 500ms)
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 500) await new Promise(r => setTimeout(r, 500 - elapsedTime));

            if (res.data.success) {
                setDevices(res.data.devices);
            }
        } catch (err) {
            console.error('Fetch devices error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, searchVendor]);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    // Excel Download Template
    const handleDownloadTemplate = async () => {
        try {
            const res = await axios.get('/api/device-template', {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Device_Upload_Template.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Download template error:', err);
            alert('템플릿 다운로드에 실패했습니다.');
        }
    };

    const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (data.length < 2) {
                    alert('데이터가 없습니다.');
                    return;
                }

                // 헤더: ['장비ID', '거래처코드', '장비명', '설치위치', '사용가능여부', '비고']
                const headers = data[0];
                const rows = data.slice(1);

                const newDevicesFromExcel: Device[] = rows.map(row => {
                    const rowData: any = {};
                    headers.forEach((header: string, i: number) => {
                        rowData[header] = row[i];
                    });

                    const formatUseYn = (val: any) => {
                        if (val === undefined || val === null) return 'Y';
                        const str = String(val).toUpperCase();
                        if (str === 'TRUE' || str === 'Y' || val === true) return 'Y';
                        return 'N';
                    };

                    // TCM_VENDOR_DEVICE 컬럼 기준으로 매핑
                    return {
                        DEVICE_KEY: '',   // 신규 → 서버 자동 채번
                        DEVICE_ID: String(rowData['장비ID'] || ''),
                        VENDOR_CD: String(rowData['거래처코드'] || ''),
                        DEVICE_NM: String(rowData['장비명'] || ''),
                        POSITION_NM: String(rowData['설치위치'] || ''),
                        USE_YN: formatUseYn(rowData['사용가능여부']),
                        REMARK: String(rowData['비고'] || ''),
                        isNew: true
                    };
                }).filter(d => d.DEVICE_ID);

                if (newDevicesFromExcel.length > 0) {
                    setDevices(prev => [...newDevicesFromExcel, ...prev]);
                    alert(`${newDevicesFromExcel.length}건이 로드되었습니다. '저장' 버튼을 눌러 확정해주세요.`);
                }
            } catch (err) {
                console.error('Excel upload error:', err);
                alert('엑셀 파일 처리 중 오류가 발생했습니다.');
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsBinaryString(file);
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleAddRow = () => {
        // 신규 행 추가 - DEVICE_KEY는 저장 시 서버에서 자동 채번
        const newDevice: Device = {
            DEVICE_KEY: '',
            DEVICE_ID: '',
            VENDOR_CD: '',
            DEVICE_NM: '',
            POSITION_NM: '',
            USE_YN: 'Y',
            REMARK: '',
            isNew: true
        };
        setDevices([newDevice, ...devices]);
    };

    const handleRefresh = useCallback(() => {
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        setStartDate(oneYearAgo);
        setEndDate(today);
        setSearchVendor('');

        fetchDevices({ startDate: oneYearAgo, endDate: today, vendorNm: '' });
    }, [fetchDevices]);

    const handleSave = async () => {
        // DEVICE_ID가 있는 행만 저장 (빈 신규행 제외)
        const toSave = devices.filter(d => d.DEVICE_ID);
        if (toSave.length === 0) return;

        try {
            // 서버는 배열을 직접 받음 (DEVICE_KEY 있으면 수정, 없으면 신규 채번 후 삽입)
            const res = await axios.post('/api/devices/save', toSave);
            if (res.data.success) {
                alert('저장되었습니다.');
                fetchDevices();
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '저장 실패');
        }
    };

    const handleDelete = async () => {
        if (selectedIds.length === 0) {
            alert('삭제할 행을 선택해주세요.');
            return;
        }
        if (!window.confirm(`선택한 ${selectedIds.length}건을 삭제하시겠습니까?`)) return;

        try {
            // DEVICE_KEY 배열로 삭제 요청
            const res = await axios.delete('/api/devices', { data: { deviceKeys: selectedIds } });
            if (res.data.success) {
                alert('삭제되었습니다.');
                setSelectedIds([]);
                fetchDevices();
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '삭제 실패');
        }
    };

    // Shortcut handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); handleRefresh(); }
            if (e.key === 'F3') { e.preventDefault(); fetchDevices(); }
            if (e.key === 'F7') { e.preventDefault(); handleDownloadTemplate(); }
            if (e.key === 'F4') { e.preventDefault(); handleSave(); }
            if (e.key === 'F5') { e.preventDefault(); handleAddRow(); }
            if (e.key === 'F8') { e.preventDefault(); handleDelete(); }
            if (e.key === 'F9') { e.preventDefault(); triggerFileUpload(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh, fetchDevices, handleSave, handleAddRow, handleDelete]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr || dateStr.length !== 8) return '';
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    };

    const handleCellChange = (index: number, field: keyof Device, value: any) => {
        const newDevices = [...devices];
        newDevices[index] = { ...newDevices[index], [field]: value };
        setDevices(newDevices);
    };

    // DEVICE_KEY 기준으로 선택 관리 (신규 행은 DEVICE_KEY 없으므로 선택 불가)
    const toggleRowSelection = (key: string) => {
        if (!key) return;
        if (selectedIds.includes(key)) {
            setSelectedIds(selectedIds.filter(i => i !== key));
        } else {
            setSelectedIds([...selectedIds, key]);
        }
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card dm-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <FileSpreadsheet size={20} color="var(--mgmt-primary)" />
                        <span className="dm-title-text">장비관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchDevices} />
                        <ToolbarBtn icon={<Download size={16} />} label="엑셀양식(F7)" variant="success" onClick={handleDownloadTemplate} />
                        <ToolbarBtn icon={<Plus size={16} />} label="행추가(F5)" variant="success" onClick={handleAddRow} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="업로드(F9)" variant="secondary" onClick={triggerFileUpload} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden-file-input" accept=".xlsx, .xls" onChange={handleExcelUpload} />
                </div>
            </div>

            {/* Filter Bar */}
            <div className="mgmt-card dm-filter-card">
                <div className="mgmt-form-group horizontal">
                    <span className="mgmt-label">입고일자</span>
                    <div className="dm-date-range">
                        <input type="date" className="mgmt-input dm-date-input" value={formatDate(startDate)} onChange={(e) => setStartDate(e.target.value.replace(/-/g, ''))} />
                        <span className="dm-date-separator">~</span>
                        <input type="date" className="mgmt-input dm-date-input" value={formatDate(endDate)} onChange={(e) => setEndDate(e.target.value.replace(/-/g, ''))} />
                    </div>
                </div>
                <div className="mgmt-form-group horizontal dm-filter-vendor">
                    <span className="mgmt-label">사용거래처</span>
                    <input type="text" className="mgmt-input" placeholder="거래처명 검색..." value={searchVendor} onChange={(e) => setSearchVendor(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchDevices()} />
                </div>
            </div>

            {/* Main Content */}
            <div className="mgmt-card dm-main-card">
                <div className="dm-info-bar">
                    <span className="dm-info-text">엑셀등으로 컬럼 위치를 맞추고 복사 한 뒤 Ctrl-Alt-V를 누르면 데이터 복사가 됩니다.</span>
                    <div className="dm-total-count">총 {devices.length} 건</div>
                </div>

                <div className="mgmt-table-wrapper dm-table-wrapper">
                    <table className="mgmt-table">
                        <thead>
                            <tr>
                                <th className="dm-table-col-check">
                                    {/* 전체 선택: DEVICE_KEY 있는 기존 레코드만 해당 */}
                                    <input type="checkbox"
                                        checked={selectedIds.length > 0 && selectedIds.length === devices.filter(d => d.DEVICE_KEY).length}
                                        onChange={() => {
                                            if (selectedIds.length > 0) setSelectedIds([]);
                                            else setSelectedIds(devices.filter(d => d.DEVICE_KEY).map(d => d.DEVICE_KEY));
                                        }} />
                                </th>
                                <th className="dm-table-col-id">장비 ID</th>
                                <th className="dm-table-col-vendor">거래처명</th>
                                <th>장비명</th>
                                <th>설치위치</th>
                                <th className="dm-table-col-status">사용여부</th>
                                <th>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map((d, index) => (
                                <tr key={d.DEVICE_KEY || `new-${index}`}
                                    className={selectedIds.includes(d.DEVICE_KEY) ? 'selected' : ''}
                                    onClick={() => toggleRowSelection(d.DEVICE_KEY)}>
                                    <td className="dm-table-cell-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            checked={selectedIds.includes(d.DEVICE_KEY)}
                                            onChange={() => toggleRowSelection(d.DEVICE_KEY)}
                                            disabled={!d.DEVICE_KEY} />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.DEVICE_ID}
                                            onChange={(e) => handleCellChange(index, 'DEVICE_ID', e.target.value)}
                                            placeholder="장비 ID 입력" />
                                    </td>
                                    <td>
                                        {/* 거래처명 표시 (JOIN), 수정 시 VENDOR_CD로 저장 */}
                                        <input className="mgmt-input dm-table-input"
                                            value={d.VENDOR_NM || d.VENDOR_CD || ''}
                                            onChange={(e) => handleCellChange(index, 'VENDOR_CD', e.target.value)}
                                            placeholder="거래처코드 입력" />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.DEVICE_NM}
                                            onChange={(e) => handleCellChange(index, 'DEVICE_NM', e.target.value)}
                                            placeholder="장비명" />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.POSITION_NM}
                                            onChange={(e) => handleCellChange(index, 'POSITION_NM', e.target.value)}
                                            placeholder="설치위치" />
                                    </td>
                                    <td className="dm-table-cell-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            checked={d.USE_YN === 'Y'}
                                            onChange={(e) => handleCellChange(index, 'USE_YN', e.target.checked ? 'Y' : 'N')} />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.REMARK || ''}
                                            onChange={(e) => handleCellChange(index, 'REMARK', e.target.value)} />
                                    </td>
                                </tr>
                            ))}
                            {devices.length === 0 && !loading && (
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

export default DeviceManagementContent;
