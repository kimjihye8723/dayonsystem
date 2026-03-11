import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, RefreshCw, Search, FileSpreadsheet, Upload, X, Landmark } from 'lucide-react';
import axios from 'axios';
import './VendorManagementContent.css';

interface Vendor {
    CORP_CD: string;
    VENDOR_CD: string;
    VENDOR_NM: string;
    VENDOR_SNAME?: string;
    VENDOR_SEC?: string;
    VENDOR_TYPE?: string;
    BIZ_NO?: string;
    CORP_NO?: string;
    BIZ_SEC?: string;
    BIZ_TYPE?: string;
    CEO_NM?: string;
    TEL_NO?: string;
    HP_NO?: string;
    FAX_NO?: string;
    EMAIL?: string;
    CEO_EMAIL?: string;
    BILL_EMAIL?: string;
    START_DT?: string;
    END_DT?: string;
    PAY_METHOD?: string;
    BANK_NM?: string;
    ACCOUNT_NO?: string;
    ACCOUNT_NM?: string;
    PAY_DAY?: string;
    BILL_TAX?: string;
    STOP_YN?: string;
    STORE_STATUS?: string;
    ADDR?: string;
    MAIN_VENDOR?: string;
    IS_STORE?: string;
    IS_ADVERTISER?: string;
    IS_PARTNER?: string;
    OPEN_TIME?: string;
    CLOSE_TIME?: string;
    BT_MODULE_YN?: string;
    REGION_SEC?: string;
    ROUND_TYPE?: string;
    REPORT_EMAIL?: string;
    DAILY_REPORT_YN?: string;
    AD_SEC?: string;
    AD_START_DT?: string;
    AD_AMOUNT?: number;
    REP_NAME?: string;
    REP_TEL?: string;
    HQ_NAME?: string;
    SALES_NAME?: string;
    UNPAID_SMS_YN?: string;
    UNPAID_SMS_DAY?: number;
    REMARK?: string;
}

interface Props {
    theme: 'light' | 'dark';
}

const VendorManagementContent: React.FC<Props> = ({ theme: _theme }) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
    const [loading, setLoading] = useState(false);
    const [vendorCategories, setVendorCategories] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [vendorTypes, setVendorTypes] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [adContractSecs, setAdContractSecs] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [storeStatuses, setStoreStatuses] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [regions, setRegions] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [payMethods, setPayMethods] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [payDays, setPayDays] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [billTaxes, setBillTaxes] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [roundTypes, setRoundTypes] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);

    // Filters
    const [filterName, setFilterName] = useState('');
    const [filterBizNo, setFilterBizNo] = useState('');
    const [filterUseYn, setFilterUseYn] = useState('ALL');
    const [filterVendorSec, setFilterVendorSec] = useState('');
    const [filterVendorType, setFilterVendorType] = useState('');
    const [filterAdSec, setFilterAdSec] = useState('');

    // Detail Form State
    const [formData, setFormData] = useState<Partial<Vendor>>({});

    const fetchVendors = useCallback(async (overrides?: any) => {
        try {
            setLoading(true);
            const startTime = Date.now();
            const params = {
                vendorNm: overrides?.vendorNm ?? filterName,
                bizNo: overrides?.bizNo ?? filterBizNo,
                useYn: overrides?.useYn ?? filterUseYn,
                vendorSec: overrides?.vendorSec ?? filterVendorSec,
                vendorType: overrides?.vendorType ?? filterVendorType,
                adSec: overrides?.adSec ?? filterAdSec
            };
            const res = await axios.get('/api/vendors', { params });

            const elapsed = Date.now() - startTime;
            if (elapsed < 500) await new Promise(r => setTimeout(r, 500 - elapsed));

            if (res.data.success) {
                setVendors(res.data.vendors);
            }
        } catch (err) {
            console.error('Fetch vendors error:', err);
        } finally {
            setLoading(false);
        }
    }, [filterName, filterBizNo, filterUseYn, filterVendorSec, filterVendorType, filterAdSec]);

    const fetchCategories = useCallback(async () => {
        try {
            const [catRes, typeRes, adRes, storeRes, regionRes, payRes, roundRes, billRes, paydayRes] = await Promise.all([
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래처구분' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래처유형' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '광고계약구분' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래상태' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '지역1' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '결제방법' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '소수점관리' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '계산서(부가세)' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '결제예정일자' } })
            ]);

            if (catRes.data.success) setVendorCategories(catRes.data.codes);
            if (typeRes.data.success) setVendorTypes(typeRes.data.codes);
            if (adRes.data.success) setAdContractSecs(adRes.data.codes);
            if (storeRes.data.success) setStoreStatuses(storeRes.data.codes);
            if (regionRes.data.success) setRegions(regionRes.data.codes);
            if (payRes.data.success) setPayMethods(payRes.data.codes);
            if (roundRes.data.success) setRoundTypes(roundRes.data.codes);
            if (billRes.data.success) setBillTaxes(billRes.data.codes);
            if (paydayRes.data.success) setPayDays(paydayRes.data.codes);
        } catch (err) {
            console.error('Fetch categories error:', err);
        }
    }, []);

    useEffect(() => {
        fetchVendors();
        fetchCategories();
    }, [fetchVendors, fetchCategories]);

    const handleRefresh = useCallback(() => {
        setFilterName('');
        setFilterBizNo('');
        setFilterUseYn('ALL');
        setFilterVendorSec('');
        setFilterVendorType('');
        setFilterAdSec('');
        fetchVendors({ vendorNm: '', bizNo: '', useYn: 'ALL', vendorSec: '', vendorType: '', adSec: '' });
    }, [fetchVendors]);

    const handleVendorClick = (v: Vendor) => {
        setSelectedVendor(v);
        setFormData(v);
    };

    const getCodeName = (codes: { CODE_CD: string, CODE_NM: string }[], code?: string) => {
        if (!code) return '';
        const match = codes.find(c => c.CODE_CD === code);
        return match ? match.CODE_NM : code;
    };

    const handleAddNew = () => {
        setSelectedVendor(null);
        setFormData({
            VENDOR_CD: '',
            VENDOR_NM: '',
            STOP_YN: 'N',
            CORP_CD: '25001'
        });
    };

    const handleSave = async () => {
        if (!formData.VENDOR_CD || !formData.VENDOR_NM) {
            alert('거래처코드와 거래처명은 필수입니다.');
            return;
        }

        try {
            setLoading(true);
            const res = await axios.post('/api/vendors/save', formData);
            if (res.data.success) {
                alert(res.data.message);
                fetchVendors();
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedVendor) return;
        if (!window.confirm(`[${selectedVendor.VENDOR_NM}] 거래처를 삭제하시겠습니까?`)) return;

        try {
            setLoading(true);
            const res = await axios.delete('/api/vendors', { data: { vendorCds: [selectedVendor.VENDOR_CD] } });
            if (res.data.success) {
                alert('삭제되었습니다.');
                setSelectedVendor(null);
                setFormData({});
                fetchVendors();
            }
        } catch (err: any) {
            alert(err.response?.data?.message || '삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') { e.preventDefault(); handleRefresh(); }
            if (e.key === 'F3') { e.preventDefault(); fetchVendors(); }
            if (e.key === 'F4') { e.preventDefault(); handleSave(); }
            if (e.key === 'F8') { e.preventDefault(); handleDelete(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh, fetchVendors, handleSave, handleDelete]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const checked = (e.target as HTMLInputElement).checked;

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (checked ? 'Y' : 'N') : value
        }));
    };

    return (
        <div className="mgmt-container">
            {/* Toolbar */}
            <div className="mgmt-card vm-toolbar-card">
                <div className="mgmt-toolbar">
                    <div className="vm-title-area">
                        <Landmark size={20} color="var(--mgmt-primary)" />
                        <span className="vm-title-text">거래처관리</span>
                    </div>
                    <div className="mgmt-btn-group">
                        <ToolbarBtn icon={<Plus size={16} />} label="추가작업(A)" variant="success" onClick={handleAddNew} />
                        <ToolbarBtn icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />} label="새로고침(F2)" variant="secondary" onClick={handleRefresh} />
                        <ToolbarBtn icon={<Search size={16} />} label="조회(F3)" variant="primary" onClick={() => fetchVendors()} />
                        <ToolbarBtn icon={<FileSpreadsheet size={16} />} label="엑셀(F7)" variant="success" onClick={() => { }} />
                        <ToolbarBtn icon={<Upload size={16} />} label="업로드" variant="secondary" onClick={() => { }} />
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                        <ToolbarBtn icon={<X size={16} />} label="창닫기" variant="secondary" onClick={() => { }} />
                    </div>
                </div>
            </div>

            <div className="vm-main-layout">
                {/* Left Sidebar */}
                <div className="mgmt-card vm-left-sidebar">
                    <div className="vm-section-header" style={{ padding: '1rem 1rem 0 1rem', borderBottom: 'none', marginBottom: 0 }}>
                        <div className="vm-section-bar" />
                        <span className="vm-section-title">조회 조건</span>
                    </div>
                    <div className="vm-sidebar-filters">
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">회사코드</span>
                            <input type="text" className="mgmt-input" value="JOOT AMS" readOnly />
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">대표거래처</span>
                            <div className="vm-flex-row">
                                <input type="text" className="mgmt-input" readOnly />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">거래처구분</span>
                            <select className="mgmt-select" value={filterVendorSec} onChange={e => setFilterVendorSec(e.target.value)}>
                                <option value="">전체</option>
                                {vendorCategories.map(cat => (
                                    <option key={cat.CODE_CD} value={cat.CODE_CD}>{cat.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">거래처유형</span>
                            <select className="mgmt-select" value={filterVendorType} onChange={e => setFilterVendorType(e.target.value)}>
                                <option value="">전체</option>
                                {vendorTypes.map(t => (
                                    <option key={t.CODE_CD} value={t.CODE_CD}>{t.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">거래중지여부</span>
                            <select className="mgmt-select" value={filterUseYn} onChange={e => setFilterUseYn(e.target.value)}>
                                <option value="ALL">전체</option>
                                <option value="Y">예</option>
                                <option value="N">아니오</option>
                            </select>
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">광고계약구분</span>
                            <select className="mgmt-select" value={filterAdSec} onChange={(e) => setFilterAdSec(e.target.value)}>
                                <option value="">전체</option>
                                {adContractSecs.map(a => (
                                    <option key={a.CODE_CD} value={a.CODE_CD}>{a.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group">
                            <span className="mgmt-label">거래처명/코드</span>
                            <input type="text" className="mgmt-input" placeholder="검색어 입력" value={filterName} onChange={e => setFilterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchVendors()} />
                        </div>
                    </div>

                    <div className="vm-list-header-premium">거래처목록</div>
                    <div className="mgmt-table-wrapper vm-table-wrapper-no-pad">
                        <table className="mgmt-table">
                            <thead>
                                <tr>
                                    <th>거래처구분</th>
                                    <th>거래처명</th>
                                    <th>거래처유형</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vendors.length > 0 ? (
                                    vendors.map(v => (
                                        <tr
                                            key={v.VENDOR_CD}
                                            className={`vm-row ${selectedVendor?.VENDOR_CD === v.VENDOR_CD ? 'selected' : ''}`}
                                            onClick={() => handleVendorClick(v)}
                                        >
                                            <td className="vm-cell-center">{getCodeName(vendorCategories, v.VENDOR_SEC) || '본사'}</td>
                                            <td>{v.VENDOR_NM}</td>
                                            <td className="vm-cell-center">{getCodeName(vendorTypes, v.VENDOR_TYPE) || '본사'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="vm-cell-empty">데이터가 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Content */}
                <div className="mgmt-card vm-right-content vm-right-content-scroll">
                    <div className="vm-section-header">
                        <div className="vm-section-bar" />
                        <span className="vm-section-title">거래처 정보 등록</span>
                    </div>
                    <div className="mgmt-grid">
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label required">거래처코드</label>
                            <input type="text" name="VENDOR_CD" className="mgmt-input" value={formData.VENDOR_CD || ''} onChange={handleInputChange} disabled={!!selectedVendor} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label required">거래처명</label>
                            <input type="text" name="VENDOR_NM" className="mgmt-input" value={formData.VENDOR_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">대표거래처</label>
                            <div className="vm-flex-row">
                                <input type="text" name="MAIN_VENDOR" className="mgmt-input vm-input-flex" value={formData.MAIN_VENDOR || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">거래처구분</label>
                            <select name="VENDOR_SEC" className="mgmt-select" value={formData.VENDOR_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {vendorCategories.map(cat => (
                                    <option key={cat.CODE_CD} value={cat.CODE_CD}>{cat.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">거래처약명</label>
                            <input type="text" name="VENDOR_SNAME" className="mgmt-input" value={formData.VENDOR_SNAME || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <div className="vm-check-group" style={{ marginTop: '1.5rem' }}>
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="IS_STORE" checked={formData.IS_STORE === 'Y'} onChange={handleInputChange} /> 점포
                                </label>
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="IS_ADVERTISER" checked={formData.IS_ADVERTISER === 'Y'} onChange={handleInputChange} /> 광고주
                                </label>
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="IS_PARTNER" checked={formData.IS_PARTNER === 'Y'} onChange={handleInputChange} /> 협력업체
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label required">사업자번호</label>
                            <input type="text" name="BIZ_NO" className="mgmt-input" value={formData.BIZ_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">법인번호</label>
                            <div className="vm-flex-row">
                                <input type="text" name="CORP_NO_1" className="mgmt-input vm-input-corp" />
                                <span className="vm-time-separator">-</span>
                                <input type="text" name="CORP_NO_2" className="mgmt-input vm-input-flex" />
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">영업시간지정</label>
                            <div className="vm-report-flex">
                                <input type="text" name="OPEN_TIME" className="mgmt-input vm-input-time" value={formData.OPEN_TIME || '00:00'} onChange={handleInputChange} />
                                <span className="vm-time-separator">~</span>
                                <input type="text" name="CLOSE_TIME" className="mgmt-input vm-input-time" value={formData.CLOSE_TIME || '00:00'} onChange={handleInputChange} />
                                <label className="vm-checkbox-item vm-checkbox-ml">
                                    <input type="checkbox" name="BT_MODULE_YN" checked={formData.BT_MODULE_YN === 'Y'} onChange={handleInputChange} /> 블루투스 모듈
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">업태</label>
                            <input type="text" name="BIZ_SEC" className="mgmt-input" value={formData.BIZ_SEC || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">업종</label>
                            <input type="text" name="BIZ_TYPE" className="mgmt-input" value={formData.BIZ_TYPE || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">지역구분지정</label>
                            <select name="REGION_SEC" className="mgmt-select" value={formData.REGION_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {regions.map(r => (
                                    <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">대표자</label>
                            <input type="text" name="CEO_NM" className="mgmt-input" value={formData.CEO_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">거래처유형</label>
                            <select name="VENDOR_TYPE" className="mgmt-select" value={formData.VENDOR_TYPE || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {vendorTypes.map(t => (
                                    <option key={t.CODE_CD} value={t.CODE_CD}>{t.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">금액 소수점 관리 방법</label>
                            <select name="ROUND_TYPE" className="mgmt-select" value={formData.ROUND_TYPE || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {roundTypes.map(r => (
                                    <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">전화번호</label>
                            <input type="text" name="TEL_NO" className="mgmt-input" value={formData.TEL_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">핸드폰번호</label>
                            <input type="text" name="HP_NO" className="mgmt-input" value={formData.HP_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">리포트 EMAIL 발송주소</label>
                            <div className="vm-report-flex">
                                <input type="text" name="REPORT_EMAIL" className="mgmt-input vm-input-flex" value={formData.REPORT_EMAIL || ''} onChange={handleInputChange} />
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="DAILY_REPORT_YN" checked={formData.DAILY_REPORT_YN === 'Y'} onChange={handleInputChange} /> 데일리 리포트
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">팩스번호</label>
                            <input type="text" name="FAX_NO" className="mgmt-input" value={formData.FAX_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">대표 E-MAIL</label>
                            <input type="email" name="CEO_EMAIL" className="mgmt-input" value={formData.CEO_EMAIL || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">광고계약구분</label>
                            <select name="AD_SEC" className="mgmt-select" value={formData.AD_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {adContractSecs.map(a => (
                                    <option key={a.CODE_CD} value={a.CODE_CD}>{a.CODE_NM}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-primary">거래개시일</label>
                            <input type="text" name="START_DT" className="mgmt-input" value={formData.START_DT || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">거래종료일</label>
                            <input type="text" name="END_DT" className="mgmt-input" value={formData.END_DT || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">광고 계약일자</label>
                            <input type="text" name="AD_START_DT" className="mgmt-input" value={formData.AD_START_DT || ''} onChange={handleInputChange} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">결제방법</label>
                            <select name="PAY_METHOD" className="mgmt-select" value={formData.PAY_METHOD || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {payMethods.map(p => (
                                    <option key={p.CODE_CD} value={p.CODE_CD}>{p.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">결제은행</label>
                            <div className="vm-flex-row">
                                <input type="text" name="BANK_NM" className="mgmt-input vm-input-flex" value={formData.BANK_NM || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">광고 계약금액</label>
                            <input type="number" name="AD_AMOUNT" className="mgmt-input" value={formData.AD_AMOUNT || 0} onChange={handleInputChange} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">계사번호</label>
                            <input type="text" name="ACCOUNT_NO" className="mgmt-input" value={formData.ACCOUNT_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">예금주명</label>
                            <input type="text" name="ACCOUNT_NM" className="mgmt-input" value={formData.ACCOUNT_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5" />

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">결제예정일자</label>
                            <select name="PAY_DAY" className="mgmt-select" value={formData.PAY_DAY || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {payDays.map(pd => (
                                    <option key={pd.CODE_CD} value={pd.CODE_CD}>{pd.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label vm-label-primary">계산서</label>
                            <select name="BILL_TAX" className="mgmt-select" value={formData.BILL_TAX || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {billTaxes.map(bt => (
                                    <option key={bt.CODE_CD} value={bt.CODE_CD}>{bt.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5">
                            <label className="mgmt-label">계산서이메일</label>
                            <input type="text" name="BILL_EMAIL" className="mgmt-input" value={formData.BILL_EMAIL || ''} onChange={handleInputChange} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger">거래중지여부</label>
                            <select name="STOP_YN" className="mgmt-select" value={formData.STOP_YN || 'N'} onChange={handleInputChange}>
                                <option value="Y">예</option>
                                <option value="N">아니오</option>
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <label className="mgmt-label">거래상태</label>
                            <select name="STORE_STATUS" className="mgmt-select" value={formData.STORE_STATUS || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {storeStatuses.map(s => (
                                    <option key={s.CODE_CD} value={s.CODE_CD}>{s.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-5" />

                        <div className="mgmt-form-group mgmt-col-span-8">
                            <label className="mgmt-label vm-label-primary">주소</label>
                            <div className="vm-flex-row">
                                <input type="text" name="ADDR" className="mgmt-input vm-input-flex" value={formData.ADDR || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-4">
                            <div className="vm-check-group" style={{ marginTop: '1.5rem' }}>
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="UNPAID_SMS_YN" checked={formData.UNPAID_SMS_YN === 'Y'} onChange={handleInputChange} /> 문자 발송
                                </label>
                                <input type="number" name="UNPAID_SMS_DAY" className="mgmt-input" style={{ width: '60px', marginLeft: '8px' }} value={formData.UNPAID_SMS_DAY || 0} onChange={handleInputChange} />
                                <span className="vm-time-separator" style={{ fontSize: '0.75rem', marginLeft: '4px' }}>일 이후</span>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">업체담당자</label>
                            <div className="vm-flex-row">
                                <input type="text" name="REP_NAME" className="mgmt-input vm-input-flex" value={formData.REP_NAME || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">담당자전화</label>
                            <input type="text" name="REP_TEL" className="mgmt-input" value={formData.REP_TEL || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">본사담당자</label>
                            <div className="vm-flex-row">
                                <input type="text" name="HQ_NAME" className="mgmt-input vm-input-flex" value={formData.HQ_NAME || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">영업담당자</label>
                            <div className="vm-flex-row">
                                <input type="text" name="SALES_NAME" className="mgmt-input vm-input-flex" value={formData.SALES_NAME || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-full-width">
                            <label className="mgmt-label">비고</label>
                            <textarea name="REMARK" className="mgmt-input vm-textarea-desc" value={formData.REMARK || ''} onChange={handleInputChange}></textarea>
                        </div>
                    </div>

                    {/* Subgrids */}
                    <div className="vm-subgrids-section">
                        <div className="vm-subgrid-box">
                            <div className="vm-subgrid-header">점포별 디바이스 정보</div>
                            <div className="mgmt-table-wrapper vm-subgrid-table-wrapper">
                                <table className="mgmt-table">
                                    <thead>
                                        <tr>
                                            <th>장비ID</th>
                                            <th>장비식별명</th>
                                            <th>장비위치</th>
                                            <th>사용여부</th>
                                            <th>비고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={5} className="vm-cell-empty">조회된 자료가 없습니다.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="vm-subgrid-box vm-subgrid-box-small">
                            <div className="vm-subgrid-header">관리담당자 리스트</div>
                            <div className="mgmt-table-wrapper vm-subgrid-table-wrapper">
                                <table className="mgmt-table">
                                    <thead>
                                        <tr>
                                            <th>담당자ID</th>
                                            <th>담당자명</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td colSpan={2} className="vm-cell-empty">조회된 자료가 없습니다.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="vm-status-bar-premium mgmt-card">
                <span className="vm-status-brand"></span>
                <div className="vm-status-stats">
                    <span>Total: <strong>{vendors.length}</strong></span>
                    <span>Selected: <strong className="vm-status-selected">{selectedVendor ? selectedVendor.VENDOR_NM : 'None'}</strong></span>
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

export default VendorManagementContent;
