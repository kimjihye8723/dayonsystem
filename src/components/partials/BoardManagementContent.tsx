import React, { useState, useEffect, useCallback } from 'react';
import { Save, Trash2, RefreshCw, Plus, Search } from 'lucide-react';
import axios from 'axios';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import '../../styles/partials/BoardManagementContent.css';

interface Board {
    CORP_CD: string;
    BOARD_NO: string;
    REG_DT: string;
    REG_USER: string;
    BOARD_SEC: string;
    TARGET_USERSEC: string;
    TARGET_YN: string;
    TOP_YN: string;
    START_DT: string | null;
    END_DT: string | null;
    TX_TITLE: string;
    TX_CONTENTS: string;
    POPUP_YN: string;
    USE_YN: string;
    REMARK?: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const BoardManagementContent: React.FC<Props> = ({ theme }) => {
    const [boards, setBoards] = useState<Board[]>([]);
    const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState(`${new Date().getFullYear()}0101`);
    const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, ''));
    const [searchTitle, setSearchTitle] = useState('');
    const [filterBoardSec, setFilterBoardSec] = useState('');

    const fetchBoards = useCallback(async (overrides?: { startDate?: string, endDate?: string, title?: string, boardSec?: string }) => {
        try {
            setLoading(true);
            const startTime = Date.now();
            const params = {
                startDate: overrides?.startDate ?? startDate,
                endDate: overrides?.endDate ?? endDate,
                title: overrides?.title ?? searchTitle,
                boardSec: overrides?.boardSec ?? filterBoardSec,
                _t: Date.now()
            };
            const res = await axios.get('/api/boards', { params });

            // Artificial delay (min 500ms)
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < 500) await new Promise(r => setTimeout(r, 500 - elapsedTime));

            if (res.data.success) {
                setBoards(res.data.boards);
            }
        } catch (err) {
            console.error('Fetch boards error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, searchTitle]);

    useEffect(() => {
        fetchBoards();
    }, [fetchBoards]);

    // Handle board selection
    const handleSelectBoard = useCallback(async (boardNo: string) => {
        // Clear current selection first to prevent lingering data
        setSelectedBoard(null);

        // Find in local boards first for immediate feedback (without content)
        const localBoard = boards.find(b => b.BOARD_NO === boardNo);
        if (localBoard) {
            setSelectedBoard({ ...localBoard, TX_CONTENTS: '' });
        }

        try {
            const res = await axios.get(`/api/boards/${boardNo}`);
            if (res.data.success) {
                // Update with full detail from server (including TX_CONTENTS)
                setSelectedBoard(res.data.board);
            }
        } catch (err) {
            console.error('Fetch detail error:', err);
        }
    }, [boards]);

    const handleAddNew = () => {
        const today = new Date().toISOString().slice(0, 10);
        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const newBoard: Board = {
            CORP_CD: '22002',
            BOARD_NO: '', // Will be generated on server
            REG_DT: today.replace(/-/g, ''),
            REG_USER: 'ADMIN',
            BOARD_SEC: '01',
            TARGET_USERSEC: 'ALL',
            TARGET_YN: 'N',
            TOP_YN: 'N',
            START_DT: today.replace(/-/g, ''),
            END_DT: nextMonth.replace(/-/g, ''),
            TX_TITLE: '',
            TX_CONTENTS: '',
            POPUP_YN: 'N',
            USE_YN: 'Y',
            REMARK: ''
        };
        setSelectedBoard(newBoard);
    };

    const handleSave = async () => {
        if (!selectedBoard) return;
        if (!selectedBoard.TX_TITLE) { alert('제목을 입력해주세요.'); return; }

        try {
            setSaving(true);
            const isUpdate = !!selectedBoard.BOARD_NO;
            const res = isUpdate
                ? await axios.put('/api/boards', selectedBoard)
                : await axios.post('/api/boards', selectedBoard);

            if (res.data.success) {
                alert(isUpdate ? '수정되었습니다.' : '등록되었습니다.');
                fetchBoards();
                if (!isUpdate && res.data.boardNo) {
                    handleSelectBoard(res.data.boardNo);
                }
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '저장 실패');
        } finally {
            setSaving(false);
        }
    };

    const handleRefresh = useCallback(() => {
        const firstDayOfYear = `${new Date().getFullYear()}0101`;
        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

        setStartDate(firstDayOfYear);
        setEndDate(nextMonth);
        setSearchTitle('');
        setFilterBoardSec('');

        fetchBoards({ startDate: firstDayOfYear, endDate: nextMonth, title: '', boardSec: '' });
    }, [fetchBoards]);

    const handleDelete = async () => {
        if (!selectedBoard || !selectedBoard.BOARD_NO) return;
        if (!window.confirm('정말 삭제하시겠습니까?')) return;

        try {
            const res = await axios.delete('/api/boards', { data: { boardNos: [selectedBoard.BOARD_NO] } });
            if (res.data.success) {
                alert('삭제되었습니다.');
                setSelectedBoard(null);
                fetchBoards();
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '삭제 실패');
        }
    };

    // Shortcut handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); handleRefresh(); }
            if (e.key === 'F3') { e.preventDefault(); fetchBoards(); }
            if (e.key === 'F4') { e.preventDefault(); handleSave(); }
            if (e.key === 'F5') { e.preventDefault(); handleAddNew(); }
            if (e.key === 'F8') { e.preventDefault(); handleDelete(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh, fetchBoards, handleSave, handleAddNew, handleDelete]);

    // Format date string YYYYMMDD to YYYY-MM-DD
    const formatDate = (dateStr: string | null) => {
        if (!dateStr || dateStr.length !== 8) return '';
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    };

    const handleBoardChange = (field: keyof Board, value: any) => {
        if (!selectedBoard) return;
        setSelectedBoard({ ...selectedBoard, [field]: value });
    };

    const handleDateChange = (field: 'START_DT' | 'END_DT', val: string) => {
        handleBoardChange(field, val.replace(/-/g, ''));
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card bm-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Search size={20} color="var(--mgmt-primary)" />
                        <span className="bm-title-text">게시판관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={() => fetchBoards()} />
                        <ToolbarBtn icon={<Plus size={16} />} label="신규(F5)" variant="success" onClick={handleAddNew} />
                        <ToolbarBtn icon={<Save size={16} className={saving ? 'animate-spin' : ''} />} label={saving ? '저장 중...' : '저장(F4)'} variant="primary" onClick={handleSave} disabled={saving} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="mgmt-card bm-filter-card">
                <div className="mgmt-form-group horizontal">
                    <span className="mgmt-label">게시구분</span>
                    <select className="mgmt-select bm-filter-select w-md"
                        value={filterBoardSec}
                        onChange={(e) => {
                            setFilterBoardSec(e.target.value);
                            fetchBoards({ boardSec: e.target.value });
                        }}>
                        <option value="">전체</option>
                        <option value="01">공지사항</option>
                        <option value="02">보도자료</option>
                        <option value="03">기타</option>
                    </select>
                </div>
                <div className="mgmt-form-group horizontal">
                    <span className="mgmt-label">등록일자</span>
                    <div className="bm-date-range">
                        <input type="date" value={formatDate(startDate)} onChange={(e) => setStartDate(e.target.value.replace(/-/g, ''))} className="mgmt-input bm-date-input" />
                        <span className="bm-date-separator">~</span>
                        <input type="date" value={formatDate(endDate)} onChange={(e) => setEndDate(e.target.value.replace(/-/g, ''))} className="mgmt-input bm-date-input" />
                    </div>
                </div>
                <div className="mgmt-form-group horizontal bm-filter-title">
                    <span className="mgmt-label">제목</span>
                    <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} placeholder="검색어 입력..." className="mgmt-input w-lg" onKeyDown={e => e.key === 'Enter' && fetchBoards()} />
                </div>
            </div>

            {/* Main Layout */}
            <div className="bm-main-wrapper">
                {/* Sidebar - List Area */}
                <div className="mgmt-card bm-sidebar-card">
                    <div className="vm-subgrid-header">게시판 목록</div>
                    <div className="bm-list-count-wrapper">
                        <div className="bm-list-count">{boards.length} 건</div>
                    </div>
                    <div className="bm-list-scroll">
                        {boards.map(b => (
                            <div
                                key={b.BOARD_NO}
                                className={`bm-list-item ${selectedBoard?.BOARD_NO === b.BOARD_NO ? 'selected' : ''}`}
                                onClick={() => handleSelectBoard(b.BOARD_NO)}
                            >
                                <div className="bm-list-item-top">
                                    <span className="bm-list-item-id">#{b.BOARD_NO || 'New'}</span>
                                    <span className="bm-list-item-date">{formatDate(b.REG_DT?.toString().slice(0, 8))}</span>
                                </div>
                                <div className="bm-list-item-title">{b.TX_TITLE || '(제목 없음)'}</div>
                                <div className="bm-list-item-user">작성자: {b.REG_USER}</div>
                            </div>
                        ))}
                        {boards.length === 0 && !loading && (
                            <div className="bm-empty-state">조회된 데이터가 없습니다.</div>
                        )}
                    </div>
                </div>

                {/* Right - Detail & Editor */}
                <div className="mgmt-card bm-detail-card">
                    {!selectedBoard ? (
                        <div className="bm-detail-empty">
                            <Search size={64} strokeWidth={1} className="bm-detail-icon" />
                            <p className="bm-detail-text">게시글을 선택하거나 신규 버튼을 클릭하세요.</p>
                        </div>
                    ) : (
                        <>
                            <div className="mgmt-grid bm-detail-form">
                                <div className="mgmt-form-group mgmt-col-span-9">
                                    <label className="mgmt-label required">제목</label>
                                    <input className="mgmt-input bm-title-input w-xl"
                                        value={selectedBoard.TX_TITLE}
                                        onChange={(e) => handleBoardChange('TX_TITLE', e.target.value)} />
                                </div>

                                <div className="mgmt-form-group mgmt-col-span-3">
                                    <label className="mgmt-label">게시구분</label>
                                    <select className="mgmt-select w-md" value={selectedBoard.BOARD_SEC} onChange={(e) => handleBoardChange('BOARD_SEC', e.target.value)}>
                                        <option value="01">공지사항</option>
                                        <option value="02">보도자료</option>
                                        <option value="03">기타</option>
                                    </select>
                                </div>

                                <div className="mgmt-form-group mgmt-col-span-6">
                                    <label className="mgmt-label">게시기간</label>
                                    <div className="bm-date-range">
                                        <input type="date" className="mgmt-input w-md"
                                            value={formatDate(selectedBoard.START_DT)}
                                            onChange={(e) => handleDateChange('START_DT', e.target.value)} />
                                        <span className="bm-date-separator">~</span>
                                        <input type="date" className="mgmt-input w-md"
                                            value={formatDate(selectedBoard.END_DT)}
                                            onChange={(e) => handleDateChange('END_DT', e.target.value)} />
                                    </div>
                                </div>

                                <div className="mgmt-form-group mgmt-col-span-3">
                                    <label className="mgmt-label">사용여부</label>
                                    <select className="mgmt-select w-sm" value={selectedBoard.USE_YN} onChange={(e) => handleBoardChange('USE_YN', e.target.value)}>
                                        <option value="Y">사용</option>
                                        <option value="N">미사용</option>
                                    </select>
                                </div>

                                <div className="mgmt-form-group mgmt-col-span-3 bm-checkbox-group">
                                    <div className="bm-checkbox-wrapper">
                                        <label className="bm-checkbox-label">
                                            <input type="checkbox" checked={selectedBoard.TOP_YN === 'Y'}
                                                onChange={(e) => handleBoardChange('TOP_YN', e.target.checked ? 'Y' : 'N')} className="bm-checkbox-input" />
                                            상단고정
                                        </label>
                                        <label className="bm-checkbox-label">
                                            <input type="checkbox" checked={selectedBoard.POPUP_YN === 'Y'}
                                                onChange={(e) => handleBoardChange('POPUP_YN', e.target.checked ? 'Y' : 'N')} className="bm-checkbox-input" />
                                            팝업노출
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="bm-editor-container">
                                <CKEditor
                                    key={selectedBoard.BOARD_NO || 'new'}
                                    editor={ClassicEditor}
                                    data={selectedBoard.TX_CONTENTS}
                                    config={{
                                        toolbar: [
                                            'heading', '|',
                                            'bold', 'italic', 'link', 'bulletedList', 'numberedList', 'blockQuote', '|',
                                            'insertTable', 'imageUpload', 'mediaEmbed', '|',
                                            'undo', 'redo'
                                        ],
                                        image: {
                                            toolbar: [
                                                'imageStyle:inline',
                                                'imageStyle:block',
                                                'imageStyle:side',
                                                '|',
                                                'toggleImageCaption',
                                                'imageTextAlternative'
                                            ]
                                        },
                                        language: 'ko',
                                        placeholder: '내용을 입력하세요...',
                                        // Base64 upload adapter is often built-in to classic build, 
                                        // but we ensure it's used by not specifying a dedicated uploadUrl
                                    }}
                                    onReady={(editor: any) => {
                                        // Simple Base64 Upload Adapter Implementation for Classic Build
                                        const uploadAdapter = (loader: any) => {
                                            return {
                                                upload: () => {
                                                    return loader.file.then((file: any) => new Promise((resolve, reject) => {
                                                        const reader = new FileReader();
                                                        reader.onload = () => resolve({ default: reader.result });
                                                        reader.onerror = (err) => reject(err);
                                                        reader.readAsDataURL(file);
                                                    }));
                                                }
                                            };
                                        };
                                        editor.plugins.get('FileRepository').createUploadAdapter = uploadAdapter;
                                    }}
                                    onChange={(_: any, editor: any) => {
                                        const data = editor.getData();
                                        handleBoardChange('TX_CONTENTS', data);
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Status Bar */}
            <div className="mgmt-card bm-status-bar">
                <span className="bm-status-brand"></span>
                {selectedBoard && (
                    <div className="bm-status-info">
                        <span>게시글번호: <strong>{selectedBoard.BOARD_NO || '신규'}</strong></span>
                        {selectedBoard.REG_USER && <span>작성자: <strong>{selectedBoard.REG_USER}</strong></span>}
                    </div>
                )}
            </div>
        </div>
    );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode; label: string; variant: 'primary' | 'success' | 'danger' | 'secondary'; onClick: () => void; disabled?: boolean }> = ({ icon, label, variant, onClick, disabled }) => (
    <button className={`mgmt-toolbar-btn mgmt-btn-${variant}`} onClick={onClick} disabled={disabled} style={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {icon}
        {label}
    </button>
);

export default BoardManagementContent;
