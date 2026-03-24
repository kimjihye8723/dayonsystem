import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, FileSpreadsheet, Printer, Save, Trash2, X, CloudUpload, FileVideo, Plus } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import '../../styles/partials/ContentsFileManagementContent.css';

interface FileDate {
    REG_DT: string;
    count: number;
    fileTitles: string;
}

interface ContentsFile {
    CORP_CD: string;
    REG_DT: string;
    FILE_KEY: string;
    FILE_NAME: string;
    FILE_TITLE: string;
    FTP_FILENAME: string;
    FILE_MD5: string;
    FILE_SIZE: number | null;
    FILE_TYP: string;
    USE_YN: string;
    REMARK: string;
    ASPECTRATIO_YN: string;
    SCREEN_WIDTH: number | null;
    SCREEN_HEIGHT: number | null;
    TEMP_USEYN: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const ContentsFileManagementContent: React.FC<Props> = ({ theme }) => {
    const [dates, setDates] = useState<FileDate[]>([]);
    const [files, setFiles] = useState<ContentsFile[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [fileSearch, setFileSearch] = useState('');
    const [editingFiles, setEditingFiles] = useState<Record<string, ContentsFile>>({});
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const fetchDates = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/contents-files/dates');
            if (res.data.success) {
                setDates(res.data.dates);
            }
        } catch (err) {
            console.error('Fetch dates error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFiles = useCallback(async (date: string | null = selectedDate) => {
        try {
            setLoading(true);
            const params = { regDt: date || 'ALL', fileTitle: fileSearch };
            const res = await axios.get('/api/contents-files', { params });
            if (res.data.success) {
                setFiles(res.data.files);
                setEditingFiles({});
                setSelectedRows(new Set());
            }
        } catch (err) {
            console.error('Fetch files error:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, fileSearch]);

    useEffect(() => {
        fetchDates();
        fetchFiles();
    }, [fetchDates]);

    const handleRefresh =() => {
        setFileSearch('');
        fetchDates();
        fetchFiles(selectedDate);
    };

    const handleSave = async () => {
        const editedList = Object.values(editingFiles);
        if (editedList.length === 0) {
            alert('저장할 변경 내용이 없습니다.');
            return;
        }

        try {
            const res = await axios.post('/api/contents-files/save', editedList);
            if (res.data.success) {
                alert('변경사항이 저장되었습니다.');
                setEditingFiles({});
                fetchFiles();
                fetchDates();
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('저장 실패했습니다.');
        }
    };

    const handleDelete = async () => {
        if (selectedRows.size === 0) {
            alert('삭제할 항목을 선택해주세요.');
            return;
        }

        if (!window.confirm(`선택한 ${selectedRows.size}개 항목을 삭제하시겠습니까?`)) return;

        try {
            const res = await axios.delete('/api/contents-files', {
                data: { fileKeys: Array.from(selectedRows) }
            });
            if (res.data.success) {
                alert('삭제되었습니다.');
                fetchFiles();
                fetchDates();
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('삭제 실패했습니다.');
        }
    };

    const handleAddRow = () => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const newFile: ContentsFile = {
            CORP_CD: '25001',
            REG_DT: today,
            FILE_KEY: `TEMP_${Date.now()}`,
            FILE_NAME: '',
            FILE_TITLE: '',
            FTP_FILENAME: '',
            FILE_MD5: '',
            FILE_SIZE: 0,
            FILE_TYP: '1',
            USE_YN: 'Y',
            REMARK: '',
            ASPECTRATIO_YN: 'N',
            SCREEN_WIDTH: 256,
            SCREEN_HEIGHT: 256,
            TEMP_USEYN: 'N',
        };
        setFiles(prev => [newFile, ...prev]);
        setEditingFiles(prev => ({
            ...prev,
            [newFile.FILE_KEY]: newFile
        }));
    };

    const handleExcelDownload = () => {
        const headers = ['파일명', '스크린넓이', '스크린높이', '파일제목', '파일사이즈', 'MD5', '사용유무'];
        const data = files.map(f => [
            f.FILE_NAME, f.SCREEN_WIDTH, f.SCREEN_HEIGHT, f.FILE_TITLE,
            f.FILE_SIZE, f.FILE_MD5, f.USE_YN
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'ContentsFiles');
        XLSX.writeFile(wb, `Contents_Files_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const updateEditingFile = (file: ContentsFile, field: string, value: any) => {
        setEditingFiles(prev => ({
            ...prev,
            [file.FILE_KEY]: { ...(prev[file.FILE_KEY] || file), [field]: value }
        }));
    };

    const getEditValue = (file: ContentsFile, field: keyof ContentsFile) => {
        return editingFiles[file.FILE_KEY] ? (editingFiles[file.FILE_KEY] as any)[field] : file[field];
    };

    const handleFileSelect = async (fileObj: ContentsFile, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            updateEditingFile(fileObj, 'FILE_NAME', file.name);
            updateEditingFile(fileObj, 'FILE_TITLE', file.name.replace(/\.[^/.]+$/, ""));
            updateEditingFile(fileObj, 'FILE_SIZE', file.size);
            updateEditingFile(fileObj, 'FILE_MD5', '업로드 중...');

            // TODO: 파일업로드 작업 미완 - 웹게시 환경 확정 시 수정 필요
            const formData = new FormData();
            formData.append('file', file);
            try {
                const res = await axios.post('/api/contents-files/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                if (res.data.success) {
                    updateEditingFile(fileObj, 'FILE_MD5', res.data.md5);
                    updateEditingFile(fileObj, 'FTP_FILENAME', res.data.filename);
                } else {
                    alert('파일 업로드 실패: ' + res.data.message);
                    updateEditingFile(fileObj, 'FILE_MD5', 'UPLOAD_FAILED');
                }
            } catch (err) {
                console.error(err);
                alert('파일 업로드를 처리하는 중 오류가 발생했습니다.');
                updateEditingFile(fileObj, 'FILE_MD5', 'UPLOAD_FAILED');
            }
        }
    };

    const handleDownload = async (f: ContentsFile) => {
        if (!f.FTP_FILENAME) {
            alert('저장된 파일(FTP_FILENAME) 정보가 없습니다.');
            return;
        }
        try {
            const res = await axios.get(`/api/contents-files/download?filename=${encodeURIComponent(f.FTP_FILENAME)}`, {
                responseType: 'blob'
            });
            
            if (res.data.type === 'application/json') {
                const text = await res.data.text();
                const data = JSON.parse(text);
                alert(data.message || '파일을 찾을 수 없습니다.');
                return;
            }

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', f.FILE_NAME || f.FTP_FILENAME);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            console.error(err);
            alert('해당 경로에서 파일을 찾을 수 없습니다.');
        }
    };

    const formatDate = (str: string) => {
        if (!str || str.length < 8) return str;
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    };

    const formatSize = (bytes: number | null) => {
        if (bytes === null) return '';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            {/* Toolbar Area */}
            <div className="mgmt-card cfm-toolbar-card" style={{ marginBottom: '1rem' }}>
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <FileVideo size={20} color="var(--mgmt-primary)" />
                        <span className="cfm-title-text">컨텐츠 파일 관리</span>
                    </div>

                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={() => fetchFiles()} />
                        <ToolbarBtn icon={<Plus size={16} />} label="추가(F5)" variant="primary" onClick={handleAddRow} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={handleExcelDownload} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                        <ToolbarBtn icon={<CloudUpload size={16} />} label="컨텐츠반영" variant="success" onClick={() => alert('컨텐츠가 반영되었습니다.')} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={() => {}} />
                    </div>
                </div>
            </div>

            {/* Unified Filter Bar */}
            <div className="mgmt-card perm-filter-bar">
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input className="mgmt-input perm-filter-input-small" defaultValue="JOOT AMS" readOnly style={{ background: 'var(--table-header)' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">등록일자</span>
                    <input type="date" className="mgmt-input" value={selectedDate ? formatDate(selectedDate).slice(0,10) : ''} readOnly style={{ width: '130px' }} />
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">파일명/제목</span>
                    <input 
                        className="mgmt-input perm-filter-search-input" 
                        placeholder="검색어 입력..." 
                        value={fileSearch} 
                        onChange={(e) => setFileSearch(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && fetchFiles()}
                    />
                </div>
                <div className="cfm-info-warning" style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--mgmt-warning)', fontWeight: 600 }}>
                    ※ 사용중인 컨텐츠 파일 용량 : 407.40MB (컨트롤러 용량 : 2GB)
                </div>
            </div>

            <div className="cfm-main-layout">
                {/* Left - Date List */}
                <div className="mgmt-card cfm-sidebar-card">
                    <div className="cfm-subgrid-header">파일 등록 현황</div>
                    <div className="mgmt-table-wrapper cfm-sidebar-table-wrapper">
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th>등록일자</th>
                                    <th>등록파일수</th>
                                    <th>파일리스트</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dates.map(d => (
                                    <tr key={d.REG_DT} 
                                        onClick={() => {
                                            const newDate = selectedDate === d.REG_DT ? null : d.REG_DT;
                                            setSelectedDate(newDate);
                                            fetchFiles(newDate);
                                        }}
                                        className={selectedDate === d.REG_DT ? 'selected' : ''}
                                    >
                                        <td className="cfm-cell-center">{formatDate(d.REG_DT)}</td>
                                        <td className="cfm-cell-center">{d.count}</td>
                                        <td className="cfm-cell-link" title={d.fileTitles}>{d.fileTitles?.slice(0, 15)}...</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right - File List */}
                <div className="mgmt-card cfm-detail-card">
                    <div className="cfm-detail-banner">
                        광고 컨텐츠 파일 등록 [리스트 자료를 더블 클릭 하면 다운로드 할 수 있습니다]
                    </div>
                    <div className="mgmt-table-wrapper cfm-table-wrapper">
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th className="cfm-col-check">
                                        <input type="checkbox" onChange={(e) => {
                                            if (e.target.checked) setSelectedRows(new Set(files.map(f => f.FILE_KEY)));
                                            else setSelectedRows(new Set());
                                        }} />
                                    </th>
                                    <th className="cfm-col-no">NO</th>
                                    <th className="cfm-col-filename">파일명</th>
                                    <th className="cfm-col-dim">스크린넓이</th>
                                    <th className="cfm-col-dim">스크린높이</th>
                                    <th className="cfm-col-title">파일제목</th>
                                    <th className="cfm-col-size">파일사이즈</th>
                                    <th className="cfm-col-md5">파일MD5</th>
                                    <th className="cfm-col-yn">사용유무</th>
                                    <th className="cfm-col-yn">종횡비유지</th>
                                    <th className="cfm-col-remark">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((f, idx) => (
                                    <tr 
                                        key={f.FILE_KEY} 
                                        className={selectedRows.has(f.FILE_KEY) ? 'selected' : ''}
                                        onDoubleClick={() => handleDownload(f)}
                                    >
                                        <td className="cfm-col-check">
                                            <input type="checkbox" checked={selectedRows.has(f.FILE_KEY)} onChange={() => {
                                                const next = new Set(selectedRows);
                                                if (next.has(f.FILE_KEY)) next.delete(f.FILE_KEY);
                                                else next.add(f.FILE_KEY);
                                                setSelectedRows(next);
                                            }} />
                                        </td>
                                        <td className="cfm-col-no">{idx + 1}</td>
                                        <td className="cfm-col-filename" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (e.detail === 1) {
                                                    // @ts-ignore
                                                    window.cfmClickTimeout = setTimeout(() => {
                                                        const el = document.getElementById(`file-input-${f.FILE_KEY}`);
                                                        if (el) el.click();
                                                    }, 250);
                                                } else if (e.detail === 2) {
                                                    // @ts-ignore
                                                    clearTimeout(window.cfmClickTimeout);
                                                    handleDownload(f);
                                                }
                                            }}
                                            title="클릭: 파일업로드 / 더블클릭: 다운로드"
                                        >
                                            <input 
                                                id={`file-input-${f.FILE_KEY}`}
                                                type="file" 
                                                accept="image/*,video/*"
                                                style={{ display: 'none' }}
                                                onChange={(e) => handleFileSelect(f, e)}
                                            />
                                            <input 
                                                className="cfm-table-input" 
                                                value={getEditValue(f, 'FILE_NAME') || ''} 
                                                readOnly 
                                                placeholder="클릭: 파일선택 / 더블클릭: 다운로드" 
                                                style={{ cursor: 'pointer', pointerEvents: 'none' }} 
                                            />
                                        </td>
                                        <td className="cfm-col-dim">
                                            <input className="cfm-table-input cfm-cell-center" type="number" value={getEditValue(f, 'SCREEN_WIDTH') || ''} onChange={(e) => updateEditingFile(f, 'SCREEN_WIDTH', parseInt(e.target.value))} />
                                        </td>
                                        <td className="cfm-col-dim">
                                            <input className="cfm-table-input cfm-cell-center" type="number" value={getEditValue(f, 'SCREEN_HEIGHT') || ''} onChange={(e) => updateEditingFile(f, 'SCREEN_HEIGHT', parseInt(e.target.value))} />
                                        </td>
                                        <td className="cfm-col-title">
                                            <input className="cfm-table-input" value={getEditValue(f, 'FILE_TITLE') || ''} onChange={(e) => updateEditingFile(f, 'FILE_TITLE', e.target.value)} />
                                        </td>
                                        <td className="cfm-col-size">{formatSize(f.FILE_SIZE)}</td>
                                        <td className="cfm-col-md5">{f.FILE_MD5}</td>
                                        <td className="cfm-col-yn">
                                            <input type="checkbox" checked={getEditValue(f, 'USE_YN') === 'Y'} onChange={(e) => updateEditingFile(f, 'USE_YN', e.target.checked ? 'Y' : 'N')} />
                                        </td>
                                        <td className="cfm-col-yn">
                                            <input type="checkbox" checked={getEditValue(f, 'ASPECTRATIO_YN') === 'Y'} onChange={(e) => updateEditingFile(f, 'ASPECTRATIO_YN', e.target.checked ? 'Y' : 'N')} />
                                        </td>
                                        <td className="cfm-col-remark">
                                            <input className="cfm-table-input" value={getEditValue(f, 'REMARK') || ''} onChange={(e) => updateEditingFile(f, 'REMARK', e.target.value)} />
                                        </td>
                                    </tr>
                                ))}
                                {files.length === 0 && !loading && (
                                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>가져올 데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="cfm-status-bar">
                        총 {files.length} 건
                    </div>
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

export default ContentsFileManagementContent;
