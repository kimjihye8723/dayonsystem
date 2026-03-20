import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, RefreshCw, Search, FileSpreadsheet, Landmark } from 'lucide-react';
import axios from 'axios';
import '../../styles/partials/VendorManagementContent.css';

interface Vendor {
    CORP_CD: string;
    VENDOR_CD: string;
    VENDOR_NM: string;
    VENDOR_SNAME?: string;
    VENDOR_SEC?: string;
    VENDOR_TYP?: string;
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
    const [regions2, setRegions2] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
    const [regions3, setRegions3] = useState<{ CODE_CD: string, CODE_NM: string }[]>([]);
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
    const [formData, setFormData] = useState<any>({});
    const [vendorDevices, setVendorDevices] = useState<any[]>([]);
    const [vendorManagers, setVendorManagers] = useState<any[]>([]);

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
            const [catRes, typeRes, adRes, storeRes, regionRes, region2Res, region3Res, payRes, roundRes, billRes, paydayRes] = await Promise.all([
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래처구분' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래처유형' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '광고계약구분' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '거래상태' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '지역1' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '지역2' } }),
                axios.get('/api/basic-codes/by-name', { params: { groupNm: '지역3' } }),
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
            if (region2Res.data.success) setRegions2(region2Res.data.codes);
            if (region3Res.data.success) setRegions3(region3Res.data.codes);
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

    const handleVendorClick = async (v: any) => {
        setSelectedVendor(v);
        // Map any split fields if necessary, or just use DB fields directly
        setFormData(v);

        try {
            const [devRes, mgrRes] = await Promise.all([
                axios.get('/api/vendors/devices', { params: { vendorCd: v.VENDOR_CD } }),
                axios.get('/api/vendors/managers', { params: { vendorCd: v.VENDOR_CD } })
            ]);
            if (devRes.data.success) setVendorDevices(devRes.data.devices);
            else setVendorDevices([]);

            if (mgrRes.data.success) setVendorManagers(mgrRes.data.managers);
            else setVendorManagers([]);
        } catch (err) {
            console.error('Error fetching sub data:', err);
            setVendorDevices([]);
            setVendorManagers([]);
        }
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
            BLE_USEYN: 'N',
            DAILYREPORT_YN: 'N',
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

        setFormData((prev: any) => ({
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
                        <ToolbarBtn icon={<Save size={16} />} label="저장(F4)" variant="primary" onClick={handleSave} />
                        <ToolbarBtn icon={<Trash2 size={16} />} label="삭제(F8)" variant="danger" onClick={handleDelete} />
                    </div>
                </div>
            </div>

            <div className="vm-main-layout">
                {/* Left Sidebar */}
                <div className="mgmt-card vm-left-sidebar">
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

                    <div className="vm-subgrid-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>거래처목록</span>
                        <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-main)' }}>총 {vendors.length} 건</span>
                    </div>
                    <div className="mgmt-table-wrapper vm-table-wrapper-no-pad" style={{ maxHeight: '500px', overflowY: 'auto' }}>
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
                                            <td>{getCodeName(vendorCategories, v.VENDOR_SEC) || '-'}</td>
                                            <td>{v.VENDOR_NM}</td>
                                            <td>{getCodeName(vendorTypes, v.VENDOR_TYP) || '-'}</td>
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
                    <div className="mgmt-grid" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger required">거래처코드</label>
                            <input type="text" name="VENDOR_CD" className="mgmt-input w-sm" value={formData.VENDOR_CD || ''} onChange={handleInputChange} disabled={!!selectedVendor} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger required">거래처명</label>
                            <input type="text" name="VENDOR_NM" className="mgmt-input w-lg" value={formData.VENDOR_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">대표거래처</label>
                            <div className="vm-flex-row w-lg">
                                <input type="text" className="mgmt-input vm-input-flex" value={vendors.find((v: any) => v.VENDOR_CD === formData.VENDOR_REP)?.VENDOR_NM || formData.VENDOR_REP || ''} readOnly placeholder="선택" />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger">거래처구분</label>
                            <select name="VENDOR_SEC" className="mgmt-select w-sm" value={formData.VENDOR_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {vendorCategories.map(cat => (
                                    <option key={cat.CODE_CD} value={cat.CODE_CD}>{cat.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">거래처약명</label>
                            <input type="text" name="VENDOR_SHTNM" className="mgmt-input w-md" value={formData.VENDOR_SHTNM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label vm-label-primary">거래처 조회 팝업 기준</label>
                            <div className="vm-check-group" style={{ marginTop: '0.4rem' }}>
                                <label className="vm-checkbox-item">
                                    <input type="radio" name="VENDOR_SEC" value="2" checked={formData.VENDOR_SEC === '2'} onChange={handleInputChange} /> 점포
                                </label>
                                <label className="vm-checkbox-item">
                                    <input type="radio" name="VENDOR_SEC" value="1" checked={formData.VENDOR_SEC === '1'} onChange={handleInputChange} /> 광고주
                                </label>
                                <label className="vm-checkbox-item">
                                    <input type="radio" name="VENDOR_SEC" value="99" checked={formData.VENDOR_SEC === '99'} onChange={handleInputChange} /> 협력업체
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger required">사업자번호</label>
                            <input type="text" name="BUSINESS_NO" className="mgmt-input w-md" value={formData.BUSINESS_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">법인번호</label>
                            <div className="vm-flex-row w-md">
                                <input type="text" name="CORPORATE_NO" className="mgmt-input vm-input-flex" value={formData.CORPORATE_NO || ''} onChange={handleInputChange} />
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label vm-label-primary">영업시간지정</label>
                            <div className="vm-report-flex">
                                <input type="text" name="OPEN_TIME" className="mgmt-input vm-input-time" value={formData.OPEN_TIME || '00:00'} onChange={handleInputChange} />
                                <span className="vm-time-separator">~</span>
                                <input type="text" name="CLOSE_TIME" className="mgmt-input vm-input-time" value={formData.CLOSE_TIME || '00:00'} onChange={handleInputChange} />
                                <label className="vm-checkbox-item vm-checkbox-ml vm-label-primary">
                                    <input type="checkbox" name="BLE_USEYN" checked={formData.BLE_USEYN === 'Y'} onChange={handleInputChange} /> 블루투스 모듈 사용여부(인원계수)
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">업태</label>
                            <input type="text" name="BUSINESS_SEC" className="mgmt-input w-md" value={formData.BUSINESS_SEC || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">업종</label>
                            <input type="text" name="BUSINESS_KND" className="mgmt-input w-md" value={formData.BUSINESS_KND || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label vm-label-primary">지역구분지정</label>
                            <div className="vm-flex-row">
                                <select name="ADDR_AREA1" className="mgmt-select vm-input-flex" value={formData.ADDR_AREA1 || ''} onChange={handleInputChange}>
                                    <option value=""></option>
                                    {regions.map(r => (
                                        <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                    ))}
                                </select>
                                <select name="ADDR_AREA2" className="mgmt-select vm-input-flex" value={formData.ADDR_AREA2 || ''} onChange={handleInputChange}>
                                    <option value=""></option>
                                    {regions2.map(r => (
                                        <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                    ))}
                                </select>
                                <select name="ADDR_AREA3" className="mgmt-select vm-input-flex" value={formData.ADDR_AREA3 || ''} onChange={handleInputChange}>
                                    <option value=""></option>
                                    {regions3.map(r => (
                                        <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">대표자</label>
                            <input type="text" name="PRESIDENT_NM" className="mgmt-input w-md" value={formData.PRESIDENT_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">거래처유형</label>
                            <select name="VENDOR_TYP" className="mgmt-select w-md" value={formData.VENDOR_TYP || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {vendorTypes.map(t => (
                                    <option key={t.CODE_CD} value={t.CODE_CD}>{t.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label vm-label-primary">금액 소수점 관리 방법</label>
                            <select name="DECIMAL_SEC" className="mgmt-select w-md" value={formData.DECIMAL_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {roundTypes.map(r => (
                                    <option key={r.CODE_CD} value={r.CODE_CD}>{r.CODE_NM}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">전화번호</label>
                            <input type="text" name="TEL_NO" className="mgmt-input w-md" value={formData.TEL_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">핸드폰번호</label>
                            <input type="text" name="HP_NO" className="mgmt-input w-md" value={formData.HP_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">리포트 EMAIL 발송주소</label>
                            <div className="vm-report-flex">
                                <input type="text" name="MAINTENANCE_EMAIL" className="mgmt-input vm-input-flex" value={formData.MAINTENANCE_EMAIL || ''} onChange={handleInputChange} />
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="DAILYREPORT_YN" checked={formData.DAILYREPORT_YN === 'Y'} onChange={handleInputChange} /> 데일리 리포트 처리 여부
                                </label>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">팩스번호</label>
                            <input type="text" name="FAX_NO" className="mgmt-input w-md" value={formData.FAX_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">대표 E-MAIL</label>
                            <input type="email" name="EMAIL" className="mgmt-input w-lg" value={formData.EMAIL || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">광고계약구분</label>
                            <select name="DEAL_SEC" className="mgmt-select" value={formData.DEAL_SEC || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {adContractSecs.map(a => (
                                    <option key={a.CODE_CD} value={a.CODE_CD}>{a.CODE_NM}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger">거래개시일</label>
                            <input type="date" name="OPEN_DT" className="mgmt-input w-md" 
                                value={formData.OPEN_DT ? (formData.OPEN_DT.includes('-') ? formData.OPEN_DT : (formData.OPEN_DT.length >= 8 ? `${formData.OPEN_DT.slice(0,4)}-${formData.OPEN_DT.slice(4,6)}-${formData.OPEN_DT.slice(6,8)}` : '')) : ''} 
                                onChange={(e) => setFormData((prev: any) => ({ ...prev, OPEN_DT: e.target.value.replace(/-/g, '') }))} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">거래종료일</label>
                            <input type="date" name="END_DT" className="mgmt-input w-md" 
                                value={formData.END_DT ? (formData.END_DT.includes('-') ? formData.END_DT : (formData.END_DT.length >= 8 ? `${formData.END_DT.slice(0,4)}-${formData.END_DT.slice(4,6)}-${formData.END_DT.slice(6,8)}` : '')) : ''} 
                                onChange={(e) => setFormData((prev: any) => ({ ...prev, END_DT: e.target.value.replace(/-/g, '') }))} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">광고 계약일자</label>
                            <input type="date" name="PROPERTY_01" className="mgmt-input w-md" 
                                value={formData.PROPERTY_01 ? (formData.PROPERTY_01.includes('-') ? formData.PROPERTY_01 : (formData.PROPERTY_01.length >= 8 ? `${formData.PROPERTY_01.slice(0,4)}-${formData.PROPERTY_01.slice(4,6)}-${formData.PROPERTY_01.slice(6,8)}` : '')) : ''} 
                                onChange={(e) => setFormData((prev: any) => ({ ...prev, PROPERTY_01: e.target.value.replace(/-/g, '') }))} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">결제방법</label>
                            <select name="PAYMENT_TYP" className="mgmt-select" value={formData.PAYMENT_TYP || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {payMethods.map(p => (
                                    <option key={p.CODE_CD} value={p.CODE_CD}>{p.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">결제은행</label>
                            <div className="vm-flex-row">
                                <input type="text" name="PAYMENT_BANK" className="mgmt-input vm-input-flex" value={formData.PAYMENT_BANK || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">광고 계약금액</label>
                            <input type="number" name="MAINTENANCE_AMT" className="mgmt-input" value={formData.MAINTENANCE_AMT || 0} onChange={handleInputChange} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">계좌번호</label>
                            <input type="text" name="ACCOUNT_NO" className="mgmt-input w-md" value={formData.ACCOUNT_NO || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">예금주명</label>
                            <input type="text" name="PAYMENT_NM" className="mgmt-input w-md" value={formData.PAYMENT_NM || ''} onChange={handleInputChange} />
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6" />

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">결제예정일자</label>
                            <select name="PAYMENT_DT" className="mgmt-select w-sm" value={formData.PAYMENT_DT || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {payDays.map(pd => (
                                    <option key={pd.CODE_CD} value={pd.CODE_CD}>{pd.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-primary">계산서</label>
                            <select name="BILL_TYP" className="mgmt-select w-md" value={formData.BILL_TYP || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {billTaxes.map(bt => (
                                    <option key={bt.CODE_CD} value={bt.CODE_CD}>{bt.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6">
                            <label className="mgmt-label">계산서이메일</label>
                            <input type="text" name="TAX_EMAIL" className="mgmt-input w-lg" value={formData.TAX_EMAIL || ''} onChange={handleInputChange} />
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label vm-label-danger">거래중지여부</label>
                            <select name="CLOSE_YN" className="mgmt-select w-sm" value={formData.CLOSE_YN || 'N'} onChange={handleInputChange}>
                                <option value="Y">예</option>
                                <option value="N">아니오</option>
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">거래상태</label>
                            <select name="DEAL_TYP" className="mgmt-select w-md" value={formData.DEAL_TYP || ''} onChange={handleInputChange}>
                                <option value=""></option>
                                {storeStatuses.map(s => (
                                    <option key={s.CODE_CD} value={s.CODE_CD}>{s.CODE_NM}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-6" />

                        <div className="mgmt-form-group mgmt-col-span-8">
                            <label className="mgmt-label vm-label-primary">주소</label>
                            <div className="vm-flex-row">
                                <input type="text" name="ADDRESS_HDR" className="mgmt-input vm-input-flex" value={formData.ADDRESS_HDR || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                                <input type="text" name="ADDRESS_DET" className="mgmt-input vm-input-flex" placeholder="상세주소를 입력하세요" value={formData.ADDRESS_DET || ''} onChange={handleInputChange} style={{ marginLeft: '4px' }} />
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <div className="vm-check-group" style={{ marginTop: '1.5rem' }}>
                                <label className="vm-checkbox-item">
                                    <input type="checkbox" name="SMS_ALERTYN" checked={formData.SMS_ALERTYN === 'Y'} onChange={handleInputChange} /> 문자 발송
                                </label>
                                <input type="number" name="SMS_ALERTDAY" className="mgmt-input" style={{ width: '60px', marginLeft: '8px' }} value={formData.SMS_ALERTDAY || 0} onChange={handleInputChange} />
                                <span className="vm-time-separator" style={{ fontSize: '0.75rem', marginLeft: '4px' }}>일 이후</span>
                            </div>
                        </div>

                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">업체담당자</label>
                            <div className="vm-flex-row w-md">
                                <input type="text" name="REP_NAME" className="mgmt-input vm-input-flex" value={formData.REP_NAME || ''} onChange={handleInputChange} />
                                <button className="mgmt-btn-secondary vm-btn-ellipsis">...</button>
                            </div>
                        </div>
                        <div className="mgmt-form-group mgmt-col-span-3">
                            <label className="mgmt-label">담당자전화</label>
                            <input type="text" name="REP_TEL" className="mgmt-input w-md" value={formData.REP_TEL || ''} onChange={handleInputChange} />
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
                                <input type="text" name="SALES_VENDOR" className="mgmt-input vm-input-flex" value={formData.SALES_VENDOR || ''} onChange={handleInputChange} />
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
                            <div className="mgmt-table-wrapper vm-subgrid-table-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
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
                                        {vendorDevices.length > 0 ? (
                                            vendorDevices.map((d, i) => (
                                                <tr key={i}>
                                                    <td>{d.DEVICE_ID}</td>
                                                    <td>{d.DEVICE_NM || '-'}</td>
                                                    <td>{d.DEVICE_LOC || '-'}</td>
                                                    <td>{d.USE_YN}</td>
                                                    <td>{d.REMARK || ''}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="vm-cell-empty">조회된 자료가 없습니다.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="vm-subgrid-box vm-subgrid-box-small">
                            <div className="vm-subgrid-header">관리담당자 리스트</div>
                            <div className="mgmt-table-wrapper vm-subgrid-table-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
                                <table className="mgmt-table">
                                    <thead>
                                        <tr>
                                            <th>담당자ID</th>
                                            <th>담당자명</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vendorManagers.length > 0 ? (
                                            vendorManagers.map((m, i) => (
                                                <tr key={i}>
                                                    <td>{m.USER_ID}</td>
                                                    <td>{m.USER_NM}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="vm-cell-empty">조회된 자료가 없습니다.</td>
                                            </tr>
                                        )}
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
