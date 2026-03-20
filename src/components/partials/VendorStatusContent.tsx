import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Printer, FileSpreadsheet, X, Landmark } from 'lucide-react';
import axios from 'axios';
import XLSX from 'xlsx-js-style';
import '../../styles/partials/VendorStatusContent.css';

interface VendorStatus {
    VENDOR_CD: string;
    VENDOR_NM: string;
    VENDOR_SHTNM: string;
    VENDOR_REP: string;
    VENDOR_SEC_NM: string;
    BUSINESS_NO: string;
    CORPORATE_NO: string;
    BUSINESS_SEC: string;
    BUSINESS_KND: string;
    PRESIDENT_NM: string;
    TEL_NO: string;
    HP_NO: string;
    FAX_NO: string;
    EMAIL: string;
    OPEN_DT: string;
    CLOSE_YN: string;
    DEAL_SEC_NM: string;
    START_DT: string;
    END_DT: string;
    ADDRESS_HDR: string;
    ADDRESS_DET: string;
    MAINTENANCE_SEC_NM: string;
    MAINTENANCE_AMT: number;
    MONTH_AMT: number;
    YEAR_AMT: number;
    MAINTENANCE_DAY: string;
    TAX_INVOICEYN: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const VendorStatusContent: React.FC<Props> = ({ theme }) => {
    const [vendors, setVendors] = useState<VendorStatus[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [vendorSec, setVendorSec] = useState('ALL');
    const [vendorNm, setVendorNm] = useState('');
    const [closeYn, setCloseYn] = useState('ALL');
    const [dealSec, setDealSec] = useState('ALL');

    const fetchVendorStatus = useCallback(async () => {
        try {
            setLoading(true);
            const params = { vendorSec, vendorNm, closeYn, dealSec };
            const res = await axios.get('/api/vendor-status', { params });
            if (res.data.success) {
                setVendors(res.data.vendors);
            }
        } catch (err) {
            console.error('Fetch vendor status error:', err);
        } finally {
            setLoading(false);
        }
    }, [vendorSec, vendorNm, closeYn, dealSec]);

    useEffect(() => {
        fetchVendorStatus();
    }, []);

    const handleRefresh = () => {
        setVendorSec('ALL');
        setVendorNm('');
        setCloseYn('ALL');
        setDealSec('ALL');
        setTimeout(fetchVendorStatus, 0);
    };

    const handleExcelDownload = () => {
        const headers = [
            '거래처명', '거래처약명', '대표거래처', '거래처구분',
            '사업자번호', '법인코드', '업태', '업종', '대표자명', '대표전화', '대표핸드폰', '팩스번호', 'EMAIL',
            '계산서', '거래중지여부', '거래상태', '거래시작일', '거래종료일', '주소기본', '주소상세',
            '유지보수구분', '금액', '월금액', '년간금액', '계약월일'
        ];

        const data = vendors.map(v => [
            v.VENDOR_NM, v.VENDOR_SHTNM, v.VENDOR_REP, v.VENDOR_SEC_NM,
            v.BUSINESS_NO, v.CORPORATE_NO, v.BUSINESS_SEC, v.BUSINESS_KND, v.PRESIDENT_NM, v.TEL_NO, v.HP_NO, v.FAX_NO, v.EMAIL,
            v.TAX_INVOICEYN === 'Y' ? '예' : '아니오', v.CLOSE_YN === 'Y' ? '중지' : '아니오', v.CLOSE_YN === 'Y' ? '중지' : '거래중',
            v.START_DT, v.END_DT, v.ADDRESS_HDR, v.ADDRESS_DET,
            v.DEAL_SEC_NM, v.MAINTENANCE_AMT, v.MONTH_AMT, v.YEAR_AMT, v.MAINTENANCE_DAY
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

        XLSX.utils.book_append_sheet(wb, ws, 'VendorStatus');
        XLSX.writeFile(wb, `Vendor_Status_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const formatDate = (str: string | null) => {
        if (!str || str.length < 8) return str || '';
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    };

    const formatAmt = (amt: number | null) => {
        if (amt === null || amt === undefined) return '';
        return amt.toLocaleString();
    };

    return (
        <div className="mgmt-container" data-theme={theme}>
            {/* Toolbar */}
            <div className="mgmt-card vs-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Landmark size={20} color="var(--mgmt-primary)" />
                        <span className="vs-title-text">거래처 현황</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={fetchVendorStatus} />
                        <ToolbarBtn icon={<Printer size={16} />} label="출력(F6)" variant="secondary" onClick={() => window.print()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={handleExcelDownload} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="danger" onClick={() => { }} />
                    </div>
                </div>
            </div>

            {/* Unified Filter Bar */}
            <div className="mgmt-card perm-filter-bar">
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">회사코드</span>
                    <div className="mgmt-btn-group">
                        <input type="text" className="mgmt-input perm-filter-input-small" value="JOOT AMS" readOnly style={{ background: 'var(--table-header)' }} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">거래처구분</span>
                    <select className="mgmt-select perm-filter-select-medium" value={vendorSec} onChange={(e) => setVendorSec(e.target.value)}>
                        <option value="ALL">전체</option>
                        <option value="0">본사</option>
                        <option value="1">광고주/대행사</option>
                        <option value="2">점포</option>
                        <option value="99">기타</option>
                    </select>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">거래처</span>
                    <div className="mgmt-btn-group">
                        <input className="mgmt-input perm-filter-search-input" placeholder="검색어..." value={vendorNm} onChange={(e) => setVendorNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchVendorStatus()} />
                        <button className="mgmt-toolbar-btn" style={{ padding: '0 8px' }}>...</button>
                    </div>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">거래중지</span>
                    <select className="mgmt-select" value={closeYn} onChange={(e) => setCloseYn(e.target.value)} style={{ width: '100px' }}>
                        <option value="ALL">전체</option>
                        <option value="N">거래중</option>
                        <option value="Y">중지</option>
                    </select>
                </div>
                <div className="perm-filter-item">
                    <span className="mgmt-label perm-filter-label">유지보수계약</span>
                    <select className="mgmt-select perm-filter-select-medium" value={dealSec} onChange={(e) => setDealSec(e.target.value)}>
                        <option value="ALL">전체</option>
                        <option value="01">년간계약</option>
                        <option value="02">월계약</option>
                        <option value="03">일단위</option>
                        <option value="04">시간단위</option>
                        <option value="99">기타</option>
                    </select>
                </div>
            </div>

            {/* Main Content */}
            <div className="mgmt-card vs-main-card">
                <div className="vs-info-bar">
                    <div className="vs-sub-title"></div>
                    <div className="vs-total-count">총 {vendors.length} 건</div>
                </div>

                <div className="vs-table-wrapper">
                    <table className="mgmt-table">
                        <thead>
                            {/* Group Headers */}
                            <tr>
                                {/* Basic Info A (Sticky) */}
                                <th className="vs-cell-center vs-sticky-col vs-col-no" style={{ zIndex: 12 }}>NO</th>
                                <th className="vs-col-vendor-nm vs-sticky-col" style={{ left: '40px' }}>거래처명</th>
                                <th className="vs-col-vendor-sht vs-sticky-col" style={{ left: '170px' }}>거래처약명</th>
                                <th className="vs-col-rep vs-sticky-col" style={{ left: '280px' }}>대표거래처</th>
                                <th className="vs-col-sec vs-sticky-col vs-group-sep" style={{ left: '380px' }}>거래처구분</th>

                                {/* Basic Info B */}
                                <th className="vs-col-bizno">사업자번호</th>
                                <th className="vs-col-corpno">법인코드</th>
                                <th className="vs-col-bizsec">업태</th>
                                <th className="vs-col-bizknd">업종</th>
                                <th className="vs-col-president">대표자명</th>
                                <th className="vs-col-tel">대표전화</th>
                                <th className="vs-col-hp">대표핸드폰</th>
                                <th className="vs-col-fax">팩스번호</th>
                                <th className="vs-col-email">EMAIL</th>

                                {/* Basic Info C */}
                                <th className="vs-col-tax">계산서</th>
                                <th className="vs-col-yn">거래중지여부</th>
                                <th className="vs-col-status">거래상태</th>
                                <th className="vs-col-date">거래시작일</th>
                                <th className="vs-col-date">거래종료일</th>
                                <th className="vs-col-addr-hdr">주소기본</th>
                                <th className="vs-col-addr-det">주소상세</th>

                                {/* Maintenance */}
                                <th className="vs-col-m-sec">구분</th>
                                <th className="vs-col-m-amt">금액</th>
                                <th className="vs-col-m-amt">월금액</th>
                                <th className="vs-col-m-amt">년간금액</th>
                                <th className="vs-col-m-day">계약월일</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map((v, idx) => (
                                <tr key={v.VENDOR_CD}>
                                    {/* A */}
                                    <td className="vs-cell-center vs-sticky-col vs-col-no">{idx + 1}</td>
                                    <td className="vs-cell-bold vs-sticky-col" style={{ left: '40px' }}>{v.VENDOR_NM}</td>
                                    <td className="vs-sticky-col" style={{ left: '170px' }}>{v.VENDOR_SHTNM}</td>
                                    <td className="vs-sticky-col" style={{ left: '280px' }}>{v.VENDOR_REP}</td>
                                    <td className="vs-cell-center vs-sticky-col vs-group-sep" style={{ left: '380px' }}>{v.VENDOR_SEC_NM}</td>

                                    {/* B */}
                                    <td className="vs-cell-center">{v.BUSINESS_NO}</td>
                                    <td className="vs-cell-center">{v.CORPORATE_NO}</td>
                                    <td>{v.BUSINESS_SEC}</td>
                                    <td>{v.BUSINESS_KND}</td>
                                    <td className="vs-cell-center">{v.PRESIDENT_NM}</td>
                                    <td className="vs-cell-center">{v.TEL_NO}</td>
                                    <td className="vs-cell-center">{v.HP_NO}</td>
                                    <td className="vs-cell-center">{v.FAX_NO}</td>
                                    <td>{v.EMAIL}</td>

                                    {/* C */}
                                    <td className="vs-cell-center">{v.TAX_INVOICEYN === 'Y' ? '예' : '아니오'}</td>
                                    <td className="vs-cell-center">{v.CLOSE_YN === 'Y' ? '중지' : '아니오'}</td>
                                    <td className="vs-cell-center">{v.CLOSE_YN === 'Y' ? '중지' : '거래중'}</td>
                                    <td className="vs-cell-center">{formatDate(v.START_DT)}</td>
                                    <td className="vs-cell-center">{formatDate(v.END_DT)}</td>
                                    <td>{v.ADDRESS_HDR}</td>
                                    <td>{v.ADDRESS_DET}</td>

                                    {/* Maint */}
                                    <td className="vs-cell-center">{v.DEAL_SEC_NM}</td>
                                    <td className="vs-amt-cell">{formatAmt(v.MAINTENANCE_AMT)}</td>
                                    <td className="vs-amt-cell">{formatAmt(v.MONTH_AMT)}</td>
                                    <td className="vs-amt-cell">{formatAmt(v.YEAR_AMT)}</td>
                                    <td className="vs-cell-center">{v.MAINTENANCE_DAY}</td>
                                </tr>
                            ))}
                            {vendors.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={30} className="vs-table-empty">조회된 데이터가 없습니다.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="vs-status-bar">
                    <span className="vs-status-text">Ready</span>
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

export default VendorStatusContent;
