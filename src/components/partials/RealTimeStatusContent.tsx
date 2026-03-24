import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

interface RealTimeStatusContentProps {
    theme: 'light' | 'dark';
}

interface Vendor {
    VENDOR_CD: string;
    VENDOR_NM: string;
}

interface RealtimeData {
    connect_yn: string;
    total_in: number;
    total_out: number;
    male_in: number;
    male_out: number;
    female_in: number;
    female_out: number;
    last_update?: string;
}

interface HourlyData {
    hour: string;
    totalIn: number;
    totalOut: number;
    maleIn: number;
    maleOut: number;
    femaleIn: number;
    femaleOut: number;
}

const RealTimeStatusContent: React.FC<RealTimeStatusContentProps> = ({ theme }) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendor, setSelectedVendor] = useState<string>('');
    const [loading, setLoading] = useState(false);
    
    const [realtime, setRealtime] = useState<RealtimeData>({
        connect_yn: 'N', total_in: 0, total_out: 0, male_in: 0, male_out: 0, female_in: 0, female_out: 0
    });
    const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);

    useEffect(() => {
        // Fetch vendors
        axios.get('/api/realtimestatus/vendors')
            .then(res => {
                if (res.data.success) {
                    setVendors(res.data.vendors);
                    if (res.data.vendors.length > 0) {
                        setSelectedVendor(res.data.vendors[0].VENDOR_CD);
                    }
                }
            })
            .catch(err => console.error("Error fetching vendors:", err));
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedVendor) return;
        setLoading(true);
        try {
            const res = await axios.get('/api/realtimestatus/data', {
                params: { vendorCd: selectedVendor }
            });
            if (res.data.success) {
                setRealtime(res.data.realtime);
                setHourlyData(res.data.hourly);
            }
        } catch (err) {
            console.error("Error fetching realtime data:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedVendor]);

    useEffect(() => {
        fetchData();
        
        // 30s Auto-refresh
        const intervalId = setInterval(() => {
            fetchData();
        }, 30000);

        return () => clearInterval(intervalId);
    }, [fetchData]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                fetchData();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fetchData]);

    // Derived Stay count
    const totalInNum = Number(realtime.total_in) || 0;
    const totalOutNum = Number(realtime.total_out) || 0;
    const stayCount = Math.max(0, totalInNum - totalOutNum);
    const stayPercentage = totalInNum > 0 ? Math.round((stayCount / totalInNum) * 100) : 0;

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            {/* Page Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
            }}>
                {/* Vendor Selector Area */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>거래처 선택</h3>
                    <select
                        value={selectedVendor}
                        onChange={e => setSelectedVendor(e.target.value)}
                        style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '0.25rem',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            width: '250px'
                        }}
                    >
                        {vendors.map(v => (
                            <option key={v.VENDOR_CD} value={v.VENDOR_CD}>{v.VENDOR_NM}</option>
                        ))}
                    </select>
                    
                    {/* Connection Status Badge */}
                    {selectedVendor && realtime.connect_yn === 'Y' && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.4rem 0.8rem',
                            backgroundColor: 'rgba(52, 211, 153, 0.1)',
                            border: '1px solid rgba(52, 211, 153, 0.3)',
                            borderRadius: '2rem',
                            color: '#34d399',
                            fontSize: '0.85rem',
                            fontWeight: 700
                        }}>
                            <CheckCircle2 size={16} />
                            CCTV 연결됨 (Active)
                        </div>
                    )}
                </div>

                <button
                    onClick={fetchData}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '0.5rem',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    {loading ? '갱신 중...' : '새로고침(F5)'}
                </button>
            </div>

            {/* Summary Cards */}
            <div className="summary-grid" style={{ marginBottom: '2.5rem' }}>
                {/* Total Card */}
                <div className="rt-card rt-sky">
                    <div className="rt-card-header">
                        <span className="rt-card-title">누적 전체 (Total In)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{realtime.total_in}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{realtime.total_in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{realtime.total_out}</span>
                        </div>
                    </div>
                </div>

                {/* Male Card */}
                <div className="rt-card rt-emerald">
                    <div className="rt-card-header">
                        <span className="rt-card-title">현 실시간 남성 (Male Stay)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{Math.max(0, Number(realtime.male_in) - Number(realtime.male_out))}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{realtime.male_in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{realtime.male_out}</span>
                        </div>
                    </div>
                </div>

                {/* Female Card */}
                <div className="rt-card rt-rose">
                    <div className="rt-card-header">
                        <span className="rt-card-title">현 실시간 여성 (Female Stay)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{Math.max(0, Number(realtime.female_in) - Number(realtime.female_out))}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{realtime.female_in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{realtime.female_out}</span>
                        </div>
                    </div>
                </div>

                {/* Stay Card (Special Design) */}
                <div className="rt-card rt-amber">
                    <div className="rt-card-header">
                        <span className="rt-card-title">현재 체류 현황</span>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            background: '#fbbf24',
                            borderRadius: '50%',
                            animation: 'pulse 1s infinite'
                        }}></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value" style={{ fontSize: '2.8rem' }}>{stayCount}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                        <div style={{
                            height: '4px',
                            background: 'rgba(251, 191, 36, 0.1)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${stayPercentage}%`,
                                height: '100%',
                                background: '#fbbf24',
                                borderRadius: '2px'
                            }}></div>
                        </div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                            입장객 대비 {stayPercentage}% 체류 중
                        </span>
                    </div>
                </div>
            </div>

            {/* Hourly Table - Full width now since video is gone */}
            <div style={{ width: '100%' }}>
                <div style={{
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <div style={{ width: '8px', height: '24px', background: 'var(--primary)', borderRadius: '4px' }}></div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>당일 시간대별 상세 통계</h3>
                </div>
                <div className="data-card" style={{ padding: 0, background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                    <table className="data-table" style={{ margin: 0, width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>시간대</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>전체 (입/퇴)</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>남성 (입/퇴)</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>여성 (입/퇴)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hourlyData.length > 0 ? hourlyData.map((data, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>{data.hour}시</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <span style={{ color: 'var(--text-main)' }}>{data.totalIn}</span>
                                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{data.totalOut}</span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <span style={{ color: '#34d399' }}>{data.maleIn}</span>
                                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{data.maleOut}</span>
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <span style={{ color: '#fb7185' }}>{data.femaleIn}</span>
                                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{data.femaleOut}</span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        해당일의 시간대별 데이터가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.1); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};

export default RealTimeStatusContent;
