import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, FileSpreadsheet, Printer, Save, Trash2, X, CloudUpload, Film, Plus } from 'lucide-react';
import axios from 'axios';
import '../../styles/partials/AdContentRegistrationContent.css';

interface AdContent {
    CONTENTS_ID: string;
    REG_DT: string;
    ADVERTISER: string;
    VENDOR_CD?: string;
    TITLE: string;
    FILE_COUNT: number;
    USE_YN: string;
}

interface AdContentFile {
    FILE_KEY: string;
    FILE_NAME: string;
    FILE_TITLE: string;
    USE_YN: string;
    PLAY_SEQ: number;
    DELAY_TIME: number;
    EFFECT_IN: string;
    EFFECT_OUT: string;
    FILE_SIZE: number;
    FILE_MD5: string;
    REMARK: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const AdContentRegistrationContent: React.FC<Props> = ({ theme }) => {
    const [contents, setContents] = useState<AdContent[]>([]);
    const [files, setFiles] = useState<AdContentFile[]>([]);
    const [effects, setEffects] = useState<{CODE_CD: string, CODE_NM: string}[]>([]);
    const [selectedContent, setSelectedContent] = useState<AdContent | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Filters
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [advertiserSearch, setAdvertiserSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeFiles, setActiveFiles] = useState<any[]>([]);
    const [selectedModalFileKeys, setSelectedModalFileKeys] = useState<Set<string>>(new Set());
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    // Vendor Search Modal
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
    const [vendorModalTarget, setVendorModalTarget] = useState<'filter' | 'detail' | null>(null);
    const [vendorList, setVendorList] = useState<any[]>([]);
    const [vendorSearchKeyword, setVendorSearchKeyword] = useState('');

    const fetchContents = useCallback(async (overrideAdvertiser?: string) => {
        try {
            setLoading(true);
            const adv = typeof overrideAdvertiser === 'string' ? overrideAdvertiser : advertiserSearch;
            const res = await axios.get('/api/ad-contents', {
                params: { startDate, endDate, advertiser: adv }
            });
            if (res.data.success) {
                setContents(res.data.contents);
            }
        } catch (err) {
            console.error('Fetch contents error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, advertiserSearch]);

    const fetchFiles = useCallback(async (content: AdContent) => {
        try {
            setLoading(true);
            const res = await axios.get('/api/ad-contents/files', {
                params: { contentsId: content.CONTENTS_ID }
            });
            if (res.data.success) {
                setFiles(res.data.files);
                setSelectedContent(content);
            }
        } catch (err) {
            console.error('Fetch files error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchEffects = useCallback(async () => {
        try {
            const res = await axios.get('/api/common/codes/PR040');
            if (res.data.success) {
                setEffects(res.data.codes);
            }
        } catch (err) {
            console.error('Fetch effects error:', err);
        }
    }, []);

    useEffect(() => {
        fetchContents();
        fetchEffects();
    }, [fetchContents, fetchEffects]);

    const handleRefresh = () => {
        setAdvertiserSearch('');
        fetchContents('');
        if (selectedContent) fetchFiles(selectedContent);
    };

    const formatDate = (str: string) => {
        if (!str || str.length < 8) return str;
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleFileChange = (fileKey: string, field: keyof AdContentFile, value: any) => {
        setFiles(prev => prev.map(f => f.FILE_KEY === fileKey ? { ...f, [field]: value } : f));
    };

    const handleSave = async () => {
        if (!selectedContent) {
            alert('저장할 컨텐츠를 선택해주세요.');
            return;
        }
        try {
            setLoading(true);
            const res = await axios.post('/api/ad-contents/save', {
                content: selectedContent,
                files: files
            });
            if (res.data.success) {
                alert('정상적으로 저장되었습니다.');
                fetchContents();
                fetchFiles(selectedContent);
            }
        } catch (err: any) {
            console.error('Save error:', err);
            alert('저장 실패: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleAddContent = () => {
        const newTempId = `TEMP_${Date.now()}`;
        const newContent: AdContent = {
            CONTENTS_ID: newTempId,
            REG_DT: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            ADVERTISER: '',
            TITLE: '새 광고 콘텐츠',
            FILE_COUNT: 0,
            USE_YN: 'Y'
        };
        setContents([newContent, ...contents]);
        setSelectedContent(newContent);
        setFiles([]); 
    };

    const handleDeleteContent = async () => {
        if (!selectedContent) {
            alert('삭제할 광고 컨텐츠를 선택해주세요.');
            return;
        }
        if (selectedContent.CONTENTS_ID.startsWith('TEMP_')) {
            setContents(contents.filter(c => c.CONTENTS_ID !== selectedContent.CONTENTS_ID));
            setSelectedContent(null);
            setFiles([]);
            return;
        }

        if (!window.confirm('해당 광고 컨텐츠와 포함된 모든 설정 정보가 완전히 삭제됩니다. 진행하시겠습니까?')) return;
        try {
            setLoading(true);
            const res = await axios.delete('/api/ad-contents', { data: { contentIds: [selectedContent.CONTENTS_ID] } });
            if (res.data.success) {
                alert('삭제되었습니다.');
                setSelectedContent(null);
                setFiles([]);
                fetchContents();
            }
        } catch (err: any) {
            console.error('Delete error:', err);
            alert('삭제 실패: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const openFileModal = async () => {
        if (!selectedContent) {
            alert('먼저 광고 컨텐츠를 좌측에서 선택하거나 새로 추가해주세요.');
            return;
        }
        try {
            setLoading(true);
            const res = await axios.get('/api/ad-contents/active-files');
            if (res.data.success) {
                setActiveFiles(res.data.files);
                setSelectedModalFileKeys(new Set());
                setIsModalOpen(true);
            }
        } catch (err) {
            console.error('Fetch active files error:', err);
            alert('선택할 파일 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const confirmFileSelection = () => {
        if (selectedModalFileKeys.size === 0) {
            alert('파일을 하나 이상 선택해주세요.');
            return;
        }
        
        const filesToAdd = activeFiles.filter(f => selectedModalFileKeys.has(f.FILE_KEY));
        const newAdContentFiles: AdContentFile[] = filesToAdd.map((f, idx) => ({
            FILE_KEY: f.FILE_KEY,
            FILE_NAME: f.FILE_NAME,
            FILE_TITLE: f.FILE_TITLE,
            USE_YN: 'Y',
            PLAY_SEQ: files.length + idx + 1,
            DELAY_TIME: 10,
            EFFECT_IN: '',
            EFFECT_OUT: '',
            FILE_SIZE: f.FILE_SIZE,
            FILE_MD5: f.FILE_MD5,
            REMARK: f.REMARK || ''
        }));
        
        const safeMerged = [...files];
        newAdContentFiles.forEach(newFile => {
            if (!safeMerged.find(existing => existing.FILE_KEY === newFile.FILE_KEY)) {
                safeMerged.push(newFile);
            }
        });

        setFiles(safeMerged);
        setIsModalOpen(false);
    };

    const openVendorModal = async (target: 'filter' | 'detail') => {
        setVendorModalTarget(target);
        setVendorSearchKeyword('');
        try {
            setLoading(true);
            const [vendorRes, codeRes] = await Promise.all([
                axios.get('/api/vendors'),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래처구분' } })
            ]);
            if (vendorRes.data.success && codeRes.data.success) {
                const validCodes = codeRes.data.codes
                    .filter((c: any) => c.CODE_NM.includes('광고주') || c.CODE_NM.includes('대행사'))
                    .map((c: any) => c.CODE_CD);
                
                const filtered = vendorRes.data.vendors.filter((v: any) => {
                    if (validCodes.length > 0) return validCodes.includes(v.VENDOR_SEC);
                    return v.VENDOR_NM.includes('광고주') || v.VENDOR_NM.includes('대행사');
                });
                setVendorList(filtered);
                setIsVendorModalOpen(true);
            }
        } catch(err) {
            console.error(err);
            alert('거래처 정보를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectVendor = (v: any) => {
        if (vendorModalTarget === 'filter') {
            setAdvertiserSearch(v.VENDOR_NM);
        } else if (vendorModalTarget === 'detail') {
            setSelectedContent(prev => prev ? { ...prev, ADVERTISER: v.VENDOR_NM } : null);
        }
        setIsVendorModalOpen(false);
    };

    return (
        <div className="mgmt-container AdContentRegistrationContent" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card arc-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Film size={20} color="var(--mgmt-primary)" />
                        <span className="arc-title-text">광고 컨텐츠 등록</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchContents} />
                        <ToolbarBtn icon={<Plus size={16} />} label="추가(F5)" variant="primary" onClick={handleAddContent} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => {}} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<CloudUpload size={16} />} label="컨텐츠반영" variant="success" onClick={() => {}} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDeleteContent} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={() => {}} />
                    </div>
                </div>
            </div>

            {/* Unified Filter Bar */}
            <div className="mgmt-card perm-filter-bar" style={{ marginBottom: '1rem' }}>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input className="mgmt-input perm-filter-input-small" defaultValue="JOOT AMS" readOnly style={{ background: 'var(--table-header)' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">등록일자</span>
                    <div className="mgmt-btn-group" style={{ gap: '5px' }}>
                        <input type="date" className="mgmt-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '130px' }} />
                        <span style={{ color: 'var(--text-main)' }}>~</span>
                        <input type="date" className="mgmt-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '130px' }} />
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">광고주</span>
                    <div className="mgmt-btn-group">
                        <input className="mgmt-input perm-filter-search-input" placeholder="광고주 검색..." value={advertiserSearch} onChange={(e) => setAdvertiserSearch(e.target.value)} style={{ width: '150px' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }} onClick={() => openVendorModal('filter')}>...</button>
                    </div>
                </div>
            </div>

            <div className="arc-main-layout">
                {/* Left - Content Summary List */}
                <div className="mgmt-card arc-sidebar-card">
                    <div className="mgmt-table-wrapper" style={{ flex: 1 }}>
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '100px' }}>등록일자</th>
                                    <th style={{ width: '100px' }}>광고주</th>
                                    <th>제목</th>
                                    <th style={{ width: '60px' }}>파일수</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contents.map(c => (
                                    <tr 
                                        key={c.CONTENTS_ID} 
                                        onClick={() => fetchFiles(c)}
                                        className={selectedContent?.CONTENTS_ID === c.CONTENTS_ID ? 'selected' : ''}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td className="text-center">{formatDate(c.REG_DT)}</td>
                                        <td className="text-center">{c.ADVERTISER}</td>
                                        <td>{c.TITLE}</td>
                                        <td className="text-right" style={{ paddingRight: '10px' }}>{c.FILE_COUNT}</td>
                                    </tr>
                                ))}
                                {contents.length === 0 && !loading && (
                                    <tr><td colSpan={4} className="text-center" style={{ padding: '40px' }}>데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right - Content File Detail List */}
                <div className="mgmt-card arc-detail-card" style={{ flex: 1.5 }}>
                    <div className="arc-detail-filter-bar">
                        <div className="perm-filter-item">
                            <span className="mgmt-label perm-filter-label" style={{ color: 'var(--mgmt-danger)' }}>회사코드</span>
                            <div className="mgmt-btn-group">
                                <input className="mgmt-input" defaultValue="JOOT AMS" readOnly style={{ width: '80px', background: 'var(--table-header)' }} />
                                <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                            </div>
                        </div>
                        <div className="perm-filter-item">
                            <span className="mgmt-label perm-filter-label" style={{ color: 'var(--mgmt-danger)' }}>등록일자</span>
                            <input type="text" className="mgmt-input" value={selectedContent ? formatDate(selectedContent.REG_DT) : '2025-12-30'} readOnly style={{ width: '100px' }} />
                        </div>
                        <div className="perm-filter-item">
                            <span className="mgmt-label perm-filter-label" style={{ color: 'var(--mgmt-danger)' }}>광고주</span>
                            <div className="mgmt-btn-group">
                                <input className="mgmt-input" value={selectedContent?.ADVERTISER || ''} readOnly style={{ width: '100px' }} />
                                <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }} onClick={() => openVendorModal('detail')}>...</button>
                            </div>
                        </div>
                        <div className="perm-filter-item">
                            <span className="mgmt-label perm-filter-label">제목</span>
                            <input 
                                className="mgmt-input" 
                                value={selectedContent?.TITLE || ''} 
                                onChange={(e) => setSelectedContent(prev => prev ? { ...prev, TITLE: e.target.value } : null)}
                                style={{ width: '140px' }} 
                            />
                        </div>
                        <div className="perm-filter-item" style={{ marginLeft: 'auto' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedContent?.USE_YN === 'Y'} 
                                    onChange={(e) => setSelectedContent(prev => prev ? { ...prev, USE_YN: e.target.checked ? 'Y' : 'N' } : null)}
                                /> 사용여부
                            </label>
                        </div>
                    </div>

                    <div className="arc-detail-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>광고 컨텐츠 파일 구성 {selectedContent && `- ${selectedContent.TITLE}`}</span>
                        {selectedContent && (
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button className="mgmt-toolbar-btn mgmt-btn-primary" style={{ padding: '2px 8px', fontSize: '0.8rem', height: '24px' }} onClick={openFileModal}>
                                    <Plus size={14} /> 등록 파일 불러오기
                                </button>
                                <button className="mgmt-toolbar-btn mgmt-btn-danger" style={{ padding: '2px 8px', fontSize: '0.8rem', height: '24px' }} onClick={() => {
                                    if (selectedRows.size === 0) { alert('제외할 항목을 체크해주세요.'); return; }
                                    setFiles(prev => prev.filter(f => !selectedRows.has(f.FILE_KEY)));
                                    setSelectedRows(new Set());
                                }}>
                                    <Trash2 size={14} /> 리스트 제외
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mgmt-table-wrapper">
                        <table className="mgmt-table" style={{ minWidth: '1200px' }}>
                            <thead>
                                <tr>
                                    <th className="cfm-col-check">
                                        <input type="checkbox" onChange={(e) => {
                                            if (e.target.checked) setSelectedRows(new Set(files.map(f => f.FILE_KEY)));
                                            else setSelectedRows(new Set());
                                        }} />
                                    </th>
                                    <th style={{ width: '40px' }}>NO</th>
                                    <th style={{ width: '100px' }}>파일명</th>
                                    <th style={{ width: '200px' }}>파일제목</th>
                                    <th style={{ width: '60px' }}>사용유무</th>
                                    <th style={{ width: '60px' }}>재생순서</th>
                                    <th style={{ width: '120px' }}>딜레이타임(이미지)</th>
                                    <th style={{ width: '80px' }}>효과(IN)</th>
                                    <th style={{ width: '80px' }}>효과(OUT)</th>
                                    <th style={{ width: '80px' }}>파일사이즈</th>
                                    <th style={{ width: '200px' }}>파일MD5</th>
                                    <th style={{ width: '150px' }}>비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((f, idx) => (
                                    <tr key={f.FILE_KEY} className={selectedRows.has(f.FILE_KEY) ? 'selected' : ''}>
                                        <td className="cfm-col-check">
                                            <input type="checkbox" checked={selectedRows.has(f.FILE_KEY)} onChange={() => {
                                                const next = new Set(selectedRows);
                                                if (next.has(f.FILE_KEY)) next.delete(f.FILE_KEY);
                                                else next.add(f.FILE_KEY);
                                                setSelectedRows(next);
                                            }} />
                                        </td>
                                        <td className="text-center">{idx + 1}</td>
                                        <td>
                                            <input 
                                                className="mgmt-input table-inner-input" 
                                                value={f.FILE_NAME || ''} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'FILE_NAME', e.target.value)}
                                            />
                                        </td>
                                        <td title={f.FILE_TITLE || ''}>
                                            <div className="ellipsis-cell" style={{ maxWidth: '200px' }}>{f.FILE_TITLE}</div>
                                        </td>
                                        <td className="text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={f.USE_YN === 'Y'} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'USE_YN', e.target.checked ? 'Y' : 'N')}
                                            />
                                        </td>
                                        <td className="text-center">
                                            <input 
                                                type="number" 
                                                className="mgmt-input table-inner-input text-center" 
                                                value={f.PLAY_SEQ || 0} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'PLAY_SEQ', parseInt(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="text-center">
                                            <input 
                                                type="number" 
                                                className="mgmt-input table-inner-input text-center" 
                                                value={f.DELAY_TIME || 0} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'DELAY_TIME', parseInt(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="text-center">
                                            <select 
                                                className="mgmt-input table-inner-input" 
                                                value={f.EFFECT_IN || ''} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'EFFECT_IN', e.target.value)}
                                            >
                                                <option value="">선택</option>
                                                {effects.map(eff => <option key={eff.CODE_CD} value={eff.CODE_CD}>{eff.CODE_NM}</option>)}
                                            </select>
                                        </td>
                                        <td className="text-center">
                                            <select 
                                                className="mgmt-input table-inner-input" 
                                                value={f.EFFECT_OUT || ''} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'EFFECT_OUT', e.target.value)}
                                            >
                                                <option value="">선택</option>
                                                {effects.map(eff => <option key={eff.CODE_CD} value={eff.CODE_CD}>{eff.CODE_NM}</option>)}
                                            </select>
                                        </td>
                                        <td className="text-right">{formatSize(f.FILE_SIZE)}</td>
                                        <td className="text-center" title={f.FILE_MD5 || ''}>
                                            <div className="ellipsis-cell" style={{ maxWidth: '200px', fontSize: '11px' }}>{f.FILE_MD5}</div>
                                        </td>
                                        <td>
                                            <input 
                                                className="mgmt-input table-inner-input" 
                                                value={f.REMARK || ''} 
                                                onChange={(e) => handleFileChange(f.FILE_KEY, 'REMARK', e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {files.length === 0 && !loading && (
                                    <tr><td colSpan={11} className="text-center" style={{ padding: '100px', color: 'var(--text-muted)' }}>데이터가 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* File Selection Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="mgmt-card" style={{ width: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', backgroundColor: theme === 'dark' ? '#1e1e2d' : '#ffffff', boxShadow: '0px 10px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--mgmt-glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>사용 가능한 원본 파일 선택</h3>
                            <button className="mgmt-toolbar-btn" onClick={() => setIsModalOpen(false)}><X size={16} /></button>
                        </div>
                        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            <div className="mgmt-table-wrapper" style={{ flex: 1 }}>
                                <table className="mgmt-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px' }} className="text-center">
                                                <input type="checkbox" onChange={(e) => {
                                                    if (e.target.checked) setSelectedModalFileKeys(new Set(activeFiles.map(f => f.FILE_KEY)));
                                                    else setSelectedModalFileKeys(new Set());
                                                }} />
                                            </th>
                                            <th style={{ width: '200px' }}>파일명</th>
                                            <th>파일제목</th>
                                            <th style={{ width: '100px' }}>파일사이즈</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeFiles.map(f => (
                                            <tr key={f.FILE_KEY} onClick={() => {
                                                const next = new Set(selectedModalFileKeys);
                                                if (next.has(f.FILE_KEY)) next.delete(f.FILE_KEY);
                                                else next.add(f.FILE_KEY);
                                                setSelectedModalFileKeys(next);
                                            }} className={selectedModalFileKeys.has(f.FILE_KEY) ? 'selected' : ''} style={{ cursor: 'pointer' }}>
                                                <td className="text-center">
                                                    <input type="checkbox" checked={selectedModalFileKeys.has(f.FILE_KEY)} readOnly />
                                                </td>
                                                <td><div className="ellipsis-cell" style={{ maxWidth: '200px' }}>{f.FILE_NAME}</div></td>
                                                <td><div className="ellipsis-cell" style={{ maxWidth: '300px' }}>{f.FILE_TITLE}</div></td>
                                                <td className="text-right">{formatSize(f.FILE_SIZE)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderTop: '1px solid var(--mgmt-glass-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button className="mgmt-toolbar-btn mgmt-btn-secondary" onClick={() => setIsModalOpen(false)}>취소</button>
                            <button className="mgmt-toolbar-btn mgmt-btn-primary" onClick={confirmFileSelection}>적용하기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vendor Selection Modal */}
            {isVendorModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="mgmt-card" style={{ width: '500px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', backgroundColor: theme === 'dark' ? '#1e1e2d' : '#ffffff', boxShadow: '0px 10px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--mgmt-glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>광고주/대행사 선택</h3>
                            <button className="mgmt-toolbar-btn" onClick={() => setIsVendorModalOpen(false)}><X size={16} /></button>
                        </div>
                        <div style={{ padding: '0.5rem 1rem', display: 'flex', gap: '5px' }}>
                            <input className="mgmt-input" placeholder="거래처명 또는 코드 검색..." value={vendorSearchKeyword} onChange={e => setVendorSearchKeyword(e.target.value)} style={{ flex: 1 }} />
                        </div>
                        <div style={{ flex: 1, padding: '0 1rem 1rem 1rem', overflowY: 'auto' }}>
                            <div className="mgmt-table-wrapper">
                                <table className="mgmt-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '100px' }}>거래처코드</th>
                                            <th>거래처명</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vendorList.filter(v => (v.VENDOR_NM || '').includes(vendorSearchKeyword) || (v.VENDOR_CD || '').includes(vendorSearchKeyword)).map(v => (
                                            <tr key={v.VENDOR_CD} onClick={() => handleSelectVendor(v)} style={{ cursor: 'pointer' }} className="hover-highlight">
                                                <td className="text-center">{v.VENDOR_CD}</td>
                                                <td>{v.VENDOR_NM}</td>
                                            </tr>
                                        ))}
                                        {vendorList.length === 0 && (
                                            <tr><td colSpan={2} className="text-center" style={{ padding: '20px' }}>검색된 거래처가 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode; label: string; variant: 'primary' | 'success' | 'danger' | 'secondary'; onClick: () => void }> = ({ icon, label, variant, onClick }) => (
    <button className={`mgmt-toolbar-btn mgmt-btn-${variant}`} onClick={onClick}>
        {icon}
        {label}
    </button>
);

export default AdContentRegistrationContent;
