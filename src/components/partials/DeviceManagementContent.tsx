import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Trash2, RefreshCw, Plus, Search, FileSpreadsheet, Download } from 'lucide-react';
import axios from 'axios';
import XLSX from 'xlsx-js-style';
import './DeviceManagementContent.css';

// TCM_VENDOR_DEVICE 테이블 기준 인터페이스
interface Device {
    DEVICE_ID: string;      // 장비 ID (PK)
    INPUT_DT?: string;      // 입고일자
    OUTPUT_DT?: string;     // 사용일자
    DISPOSE_DT?: string;    // 폐기일자
    USE_VENDOR?: string;    // 현재사용점포 (VENDOR_CD)
    USE_VENDOR_NM?: string; // 현재사용점포명 (JOIN)
    USE_YN: string;         // 사용가능여부 Y/N
    REMARK?: string;        // 비고
    REGISTDT?: string;      // 등록일시
    isNew?: boolean;        // 신규 행 여부
}

interface Props {
    theme: 'light' | 'dark';
}

const DeviceManagementContent: React.FC<Props> = ({ theme }) => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [vendors, setVendors] = useState<{ VENDOR_CD: string, VENDOR_NM: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
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
        fetchDevices();
    }, [fetchVendors, fetchDevices]);

    // Excel Download (Styled like the image)
    const handleDownloadTemplate = () => {
        const headers = ['장비ID', '입고일자', '사용일자', '폐기일자', '현재사용점포', '사용가능여부', '비고'];

        // 데이터 변환 (True/False 형식 포함)
        const excelData = devices.map(d => [
            d.DEVICE_ID || '',
            d.INPUT_DT ? `${d.INPUT_DT.slice(0, 4)}-${d.INPUT_DT.slice(4, 6)}-${d.INPUT_DT.slice(6, 8)}` : '',
            d.OUTPUT_DT ? `${d.OUTPUT_DT.slice(0, 4)}-${d.OUTPUT_DT.slice(4, 6)}-${d.OUTPUT_DT.slice(6, 8)}` : '',
            d.DISPOSE_DT ? `${d.DISPOSE_DT.slice(0, 4)}-${d.DISPOSE_DT.slice(4, 6)}-${d.DISPOSE_DT.slice(6, 8)}` : '',
            d.USE_VENDOR || '',
            d.USE_YN === 'Y' ? 'True' : 'False',
            d.REMARK || ''
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...excelData]);

        // 스타일 정의
        const headerStyle = {
            fill: { fgColor: { rgb: "D9D9D9" } },
            font: { bold: true, sz: 11 },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
                top: { style: "thin" },
                bottom: { style: "thin" },
                left: { style: "thin" },
                right: { style: "thin" }
            }
        };

        const cellStyle = {
            alignment: { vertical: "center" },
            border: {
                top: { style: "thin" },
                bottom: { style: "thin" },
                left: { style: "thin" },
                right: { style: "thin" }
            }
        };

        const centerStyle = {
            ...cellStyle,
            alignment: { horizontal: "center", vertical: "center" }
        };

        // 스타일 적용
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cell_ref]) ws[cell_ref] = { t: 's', v: '' };

                if (R === 0) {
                    ws[cell_ref].s = headerStyle;
                } else {
                    // 데이터 행 스타일
                    if (C === 5 || C === 1 || C === 2 || C === 3) { // 사용가능여부, 날짜들
                        ws[cell_ref].s = centerStyle;
                    } else {
                        ws[cell_ref].s = cellStyle;
                    }
                }
            }
        }

        // 컬럼 너비 설정
        ws['!cols'] = [
            { wch: 20 }, // 장비ID
            { wch: 15 }, // 입고일자
            { wch: 15 }, // 사용일자
            { wch: 15 }, // 폐기일자
            { wch: 20 }, // 현재사용점포
            { wch: 15 }, // 사용가능여부
            { wch: 30 }  // 비고
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Devices');
        XLSX.writeFile(wb, 'Device_Management_List.xlsx');
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

                // 헤더: ['장비ID', '입고일자', '사용일자', '폐기일자', '현재사용점포', '사용가능여부', '비고']
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

                    const formatDateExcel = (val: any) => {
                        if (!val) return '';
                        // 엑셀 날짜 형식(YYYY-MM-DD or YYYYMMDD)을 YYYYMMDD로 변환
                        return String(val).replace(/-/g, '').substring(0, 8);
                    };

                    return {
                        DEVICE_ID: String(rowData['장비ID'] || ''),
                        INPUT_DT: formatDateExcel(rowData['입고일자']),
                        OUTPUT_DT: formatDateExcel(rowData['사용일자']),
                        DISPOSE_DT: formatDateExcel(rowData['폐기일자']),
                        USE_VENDOR: String(rowData['현재사용점포'] || ''), // '거래처코드'는 이전 양식에 있었으므로 제거
                        USE_YN: formatUseYn(rowData['사용가능여부']),
                        REMARK: String(rowData['비고'] || ''),
                        isNew: true
                    };
                }).filter(d => d.DEVICE_ID);

                if (newDevicesFromExcel.length > 0) {
                    // 업로드 시 즉시 DB 저장 및 동기화
                    axios.post('/api/devices/save', newDevicesFromExcel)
                        .then(res => {
                            if (res.data.success) {
                                alert(`${newDevicesFromExcel.length}건의 데이터가 성공적으로 업로드 및 동기화 되었습니다.`);
                                fetchDevices();
                            }
                        })
                        .catch(err => {
                            console.error('Upload save error:', err);
                            alert('업로드 데이터 저장 중 오류가 발생했습니다.');
                        });
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
        const newDevice: Device = {
            DEVICE_ID: '',
            INPUT_DT: '',
            OUTPUT_DT: '',
            DISPOSE_DT: '',
            USE_VENDOR: '',
            USE_YN: 'Y',
            REMARK: '',
            isNew: true
        };
        setDevices([newDevice, ...devices]);
    };

    const handleRefresh = useCallback(() => {
        setStartDate('');
        setEndDate('');
        setSearchVendor('');

        fetchDevices({ startDate: '', endDate: '', vendorNm: '' });
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

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const pad = (n: number) => String(n).padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = pad(date.getHours());
        const mi = pad(date.getMinutes());
        return `${y}-${m}-${d} ${h}:${mi}`;
    };

    const handleCellChange = (index: number, field: keyof Device, value: any) => {
        const newDevices = [...devices];
        newDevices[index] = { ...newDevices[index], [field]: value };
        setDevices(newDevices);
    };

    // DEVICE_KEY 기준으로 선택 관리 (신규 행은 DEVICE_KEY 없으므로 선택 불가)
    const toggleRowSelection = (id: string) => {
        if (!id) return;
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
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
                    <input type="text" className="mgmt-input" placeholder="거래처명 검색..." style={{ maxWidth: '200px' }} value={searchVendor} onChange={(e) => setSearchVendor(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchDevices()} />
                </div>
            </div>

            {/* Main Content */}
            <div className="mgmt-card dm-main-card">
                <div className="dm-info-bar">
                    <span className="dm-info-text"></span>
                    <div className="dm-total-count">총 {devices.length} 건</div>
                </div>

                <div className="mgmt-table-wrapper dm-table-wrapper">
                    <table className="mgmt-table">
                        <thead>
                            <tr>
                                <th className="dm-table-col-check">
                                    <input type="checkbox"
                                        checked={selectedIds.length > 0 && selectedIds.length === devices.filter(d => d.DEVICE_ID).length}
                                        onChange={() => {
                                            if (selectedIds.length > 0) setSelectedIds([]);
                                            else setSelectedIds(devices.filter(d => d.DEVICE_ID).map(d => d.DEVICE_ID));
                                        }} />
                                </th>
                                <th className="dm-table-col-id">장비 ID</th>
                                <th className="dm-table-col-date">입고일자</th>
                                <th className="dm-table-col-date">사용일자</th>
                                <th className="dm-table-col-date">폐기일자</th>
                                <th className="dm-table-col-vendor">현재사용점포</th>
                                <th className="dm-table-col-status">사용가능여부</th>
                                <th className="dm-table-col-remark">비고</th>
                                <th className="dm-table-col-regdt">작성일자</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map((d, index) => (
                                <tr key={d.DEVICE_ID || `new-${index}`}
                                    className={selectedIds.includes(d.DEVICE_ID) ? 'selected' : ''}>
                                    <td className="dm-table-cell-center">
                                        <input type="checkbox"
                                            checked={selectedIds.includes(d.DEVICE_ID)}
                                            onChange={() => toggleRowSelection(d.DEVICE_ID)}
                                            disabled={!d.DEVICE_ID} />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.DEVICE_ID}
                                            onChange={(e) => handleCellChange(index, 'DEVICE_ID', e.target.value)}
                                            placeholder="장비 ID" />
                                    </td>
                                    <td>
                                        <input type="date" className="mgmt-input dm-table-input"
                                            value={formatDate(d.INPUT_DT || '')}
                                            onChange={(e) => handleCellChange(index, 'INPUT_DT', e.target.value.replace(/-/g, ''))} />
                                    </td>
                                    <td>
                                        <input type="date" className="mgmt-input dm-table-input"
                                            value={formatDate(d.OUTPUT_DT || '')}
                                            onChange={(e) => handleCellChange(index, 'OUTPUT_DT', e.target.value.replace(/-/g, ''))} />
                                    </td>
                                    <td>
                                        <input type="date" className="mgmt-input dm-table-input"
                                            value={formatDate(d.DISPOSE_DT || '')}
                                            onChange={(e) => handleCellChange(index, 'DISPOSE_DT', e.target.value.replace(/-/g, ''))} />
                                    </td>
                                    <td>
                                        <select className="mgmt-input dm-table-select"
                                            value={d.USE_VENDOR || ''}
                                            onChange={(e) => handleCellChange(index, 'USE_VENDOR', e.target.value)}>
                                            <option value="">선택안함</option>
                                            {vendors.map(v => (
                                                <option key={v.VENDOR_CD} value={v.VENDOR_CD}>
                                                    {v.VENDOR_NM}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="dm-table-cell-center">
                                        <input type="checkbox"
                                            checked={d.USE_YN === 'Y'}
                                            onChange={(e) => handleCellChange(index, 'USE_YN', e.target.checked ? 'Y' : 'N')} />
                                    </td>
                                    <td>
                                        <input className="mgmt-input dm-table-input"
                                            value={d.REMARK || ''}
                                            onChange={(e) => handleCellChange(index, 'REMARK', e.target.value)} />
                                    </td>
                                    <td className="dm-col-date">
                                        {formatDateTime(d.REGISTDT || '')}
                                    </td>
                                </tr>
                            ))}
                            {devices.length === 0 && !loading && (
                                <tr><td colSpan={11} className="dm-table-empty">조회된 데이터가 없습니다.</td></tr>
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
