import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, FileSpreadsheet, Printer, X, Monitor } from 'lucide-react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import './UserLoginInfoContent.css';

interface LoginInfo {
    LOGIN_KEY: string;
    USER_ID: string;
    USER_NM: string;
    LOGIN_SEC: string;
    CORP_CD: string;
    LOGIN_TM: string;
    LOGOUT_TM?: string;
    HDD_SN?: string;
    PC_NAME?: string;
    MAC_ADDR?: string;
    IP_ADDR?: string;
    LOGIN_YN: string;
    LOGIN_FAIL: string;
    PROGRAM_VER?: string;
    REMARK?: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const UserLoginInfoContent: React.FC<Props> = ({ theme }) => {
    const [loginLines, setLoginLines] = useState<LoginInfo[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Filters
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [loginYn, setLoginYn] = useState('ALL');

    const fetchLoginInfo = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                startDate: startDate.replace(/-/g, ''),
                endDate: endDate.replace(/-/g, ''),
                loginYn
            };
            const res = await axios.get('/api/login-info', { params });
            if (res.data.success) {
                setLoginLines(res.data.loginInfo);
            }
        } catch (err) {
            console.error('Fetch login info error:', err);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, loginYn]);

    useEffect(() => {
        fetchLoginInfo();
    }, [fetchLoginInfo]);

    const handleRefresh = () => {
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate(new Date().toISOString().split('T')[0]);
        setLoginYn('ALL');
        fetchLoginInfo();
    };

    const handleExcelDownload = () => {
        const headers = ['사용자ID', '사용자명', '로그인구분', '로그인일시', '로그아웃일시', '하드시리얼', 'PC명', '맥정보', 'IP주소', '로그인여부', '로그인실패여부', '프로그램버전', '비고'];
        const data = loginLines.map(l => [
            l.USER_ID,
            l.USER_NM,
            l.LOGIN_SEC === 'P' ? 'PC접속' : l.LOGIN_SEC,
            formatDateTime(l.LOGIN_TM),
            formatDateTime(l.LOGOUT_TM || ''),
            l.HDD_SN || '',
            l.PC_NAME || '',
            l.MAC_ADDR || '',
            l.IP_ADDR || '',
            l.LOGIN_YN,
            l.LOGIN_FAIL,
            l.PROGRAM_VER || '',
            l.REMARK || ''
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'LoginInfo');
        XLSX.writeFile(wb, `Login_History_${startDate}_${endDate}.xlsx`);
    };

    const formatDateTime = (str: string) => {
        if (!str || str.length < 14) return str;
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)} ${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}`;
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card dm-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Monitor size={20} color="var(--mgmt-primary)" />
                        <span className="dm-title-text">사용자 로그인 정보</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchLoginInfo} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={handleExcelDownload} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={() => {}} />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="mgmt-card perm-filter-bar">
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input type="text" className="mgmt-input perm-filter-input-small" value="JOOT AMS" readOnly style={{ background: 'var(--table-header)' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">로그인일자</span>
                    <div className="mgmt-btn-group" style={{ gap: '5px' }}>
                        <input type="date" className="mgmt-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '130px' }} />
                        <span style={{ color: 'var(--text-main)' }}>~</span>
                        <input type="date" className="mgmt-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '130px' }} />
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">로그인여부</span>
                    <select className="mgmt-select perm-filter-select-medium" value={loginYn} onChange={(e) => setLoginYn(e.target.value)}>
                        <option value="ALL">전체</option>
                        <option value="Y">성공</option>
                        <option value="N">실패</option>
                    </select>
                </div>
            </div>

            {/* Main Table */}
            <div className="mgmt-card dm-main-card">
                <div className="dm-info-bar">
                    <div className="dm-tabs">
                    </div>
                    <div className="dm-total-count">총 {loginLines.length} 건</div>
                </div>

                <div className="mgmt-table-wrapper dm-table-wrapper">
                    <table className="mgmt-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}></th>
                                <th>사용자ID</th>
                                <th>사용자명</th>
                                <th>로그인구분</th>
                                <th>로그인회사</th>
                                <th>로그인일시</th>
                                <th>로그아웃일시</th>
                                <th>하드시리얼</th>
                                <th>PC명</th>
                                <th>맥정보</th>
                                <th>IP주소</th>
                                <th>로그인여부</th>
                                <th>로그인실패여부</th>
                                <th>프로그램버전</th>
                                <th>비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loginLines.map((line, idx) => (
                                <tr key={line.LOGIN_KEY || idx}>
                                    <td className="dm-table-cell-center">{idx + 1}</td>
                                    <td>{line.USER_ID}</td>
                                    <td>{line.USER_NM}</td>
                                    <td>{line.LOGIN_SEC === 'P' ? 'PC접속' : line.LOGIN_SEC}</td>
                                    <td>{line.CORP_CD}</td>
                                    <td className="dm-table-cell-center">{formatDateTime(line.LOGIN_TM)}</td>
                                    <td className="dm-table-cell-center">{formatDateTime(line.LOGOUT_TM || '')}</td>
                                    <td>{line.HDD_SN}</td>
                                    <td>{line.PC_NAME}</td>
                                    <td>{line.MAC_ADDR}</td>
                                    <td>{line.IP_ADDR}</td>
                                    <td className="dm-table-cell-center">{line.LOGIN_YN}</td>
                                    <td className="dm-table-cell-center">{line.LOGIN_FAIL}</td>
                                    <td className="dm-table-cell-center">{line.PROGRAM_VER}</td>
                                    <td>{line.REMARK}</td>
                                </tr>
                            ))}
                            {loginLines.length === 0 && !loading && (
                                <tr><td colSpan={15} className="dm-table-empty">조회된 데이터가 없습니다.</td></tr>
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

export default UserLoginInfoContent;
