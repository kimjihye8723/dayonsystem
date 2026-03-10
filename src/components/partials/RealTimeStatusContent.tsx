import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import WebRTCPlayer from './WebRTCPlayer';

interface RealTimeStatusContentProps {
    theme: 'light' | 'dark';
}

const RealTimeStatusContent: React.FC<RealTimeStatusContentProps> = ({ theme: _theme }) => {
    // Mock data for counters
    const counters = {
        total: { in: 158, out: 142 },
        male: { in: 82, out: 75 },
        female: { in: 76, out: 67 }
    };

    const [loading, setLoading] = useState(false);

    const handleRefresh = useCallback(async () => {
        setLoading(true);
        // Simulate refresh
        await new Promise(r => setTimeout(r, 500));
        
        setLoading(false);
        console.log("Real-time data refreshed");
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                handleRefresh();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleRefresh]);

    // Mock data for hourly table
    const hourlyData = [
        { hour: '11:00 ~ 12:00', totalIn: 24, totalOut: 18, maleIn: 12, maleOut: 10, femaleIn: 12, femaleOut: 8 },
        { hour: '10:00 ~ 11:00', totalIn: 32, totalOut: 28, maleIn: 18, maleOut: 14, femaleIn: 14, femaleOut: 14 },
        { hour: '09:00 ~ 10:00', totalIn: 18, totalOut: 12, maleIn: 10, maleOut: 6, femaleIn: 8, femaleOut: 6 },
        { hour: '08:00 ~ 09:00', totalIn: 12, totalOut: 5, maleIn: 7, maleOut: 2, femaleIn: 5, femaleOut: 3 },
    ];

    // Construct WebRTC gateway URL
    // Provided sample URL format: https://cctv.mysmartgate.kr/stream/cctv/channel/2001/webrtc
    const gatewayBaseUrl = import.meta.env.VITE_WEBRTC_GATEWAY_URL || 'https://cctv.mysmartgate.kr';
    const channel = import.meta.env.VITE_WEBRTC_CHANNEL || '2001';

    // Construct the final URL to match the sample exactly
    const WEBRTC_STREAM_URL = gatewayBaseUrl.endsWith('/webrtc')
        ? gatewayBaseUrl
        : `${gatewayBaseUrl.replace(/\/$/, '')}/stream/cctv/channel/${channel}/webrtc`;

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            {/* Page Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '1rem'
            }}>
                <button 
                    onClick={handleRefresh}
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
                    새로고침(F2)
                </button>
            </div>

            {/* Summary Cards */}
            <div className="summary-grid" style={{ marginBottom: '2.5rem' }}>
                {/* Total Card */}
                <div className="rt-card rt-sky">
                    <div className="rt-card-header">
                        <span className="rt-card-title">누적 전체 (Total)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{counters.total.in + counters.total.out}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{counters.total.in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{counters.total.out}</span>
                        </div>
                    </div>
                </div>

                {/* Male Card */}
                <div className="rt-card rt-emerald">
                    <div className="rt-card-header">
                        <span className="rt-card-title">누적 남성 (Male)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{counters.male.in + counters.male.out}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{counters.male.in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{counters.male.out}</span>
                        </div>
                    </div>
                </div>

                {/* Female Card */}
                <div className="rt-card rt-rose">
                    <div className="rt-card-header">
                        <span className="rt-card-title">누적 여성 (Female)</span>
                        <div className="rt-card-icon"><Activity size={18} /></div>
                    </div>
                    <div className="rt-value-display">
                        <span className="rt-main-value">{counters.female.in + counters.female.out}</span>
                        <span className="rt-unit">명</span>
                    </div>
                    <div className="rt-grid-mini">
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">입장</span>
                            <span className="rt-mini-value">{counters.female.in}</span>
                        </div>
                        <div className="rt-mini-item">
                            <span className="rt-mini-label">퇴장</span>
                            <span className="rt-mini-value" style={{ opacity: 0.7 }}>{counters.female.out}</span>
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
                        <span className="rt-main-value" style={{ fontSize: '2.8rem' }}>{counters.total.in - counters.total.out}</span>
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
                                width: `${((counters.total.in - counters.total.out) / counters.total.in) * 100}%`,
                                height: '100%',
                                background: '#fbbf24',
                                borderRadius: '2px'
                            }}></div>
                        </div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                            입장객 대비 {Math.round(((counters.total.in - counters.total.out) / counters.total.in) * 100)}% 체류 중
                        </span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                {/* Video Stream Area */}
                <div style={{ flex: '0 0 auto' }}>
                    <div style={{
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <div style={{ width: '8px', height: '24px', background: 'var(--primary)', borderRadius: '4px' }}></div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>실시간 영상 스트림</h3>
                        <span style={{
                            background: '#ef4444',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%', animation: 'pulse 1s infinite' }}></span> LIVE
                        </span>
                    </div>
                    <div style={{
                        width: '600px',
                        height: '337px',
                        background: '#000',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                        border: '1px solid var(--glass-border)',
                        position: 'relative',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                    }}>
                        <WebRTCPlayer streamUrl={WEBRTC_STREAM_URL} />
                        <div style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            color: 'white',
                            fontSize: '0.75rem',
                            background: 'rgba(0,0,0,0.5)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            zIndex: 10
                        }}>
                            도안더리브시그니처 정문 입구
                        </div>
                    </div>
                </div>

                {/* Hourly Table */}
                <div style={{ flex: '1 1 500px' }}>
                    <div style={{
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}>
                        <div style={{ width: '8px', height: '24px', background: 'var(--primary)', borderRadius: '4px' }}></div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>시간대별 상세 통계</h3>
                    </div>
                    <div className="data-card" style={{ padding: 0, background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '1rem' }}>시간대</th>
                                    <th style={{ padding: '1rem', textAlign: 'center' }}>전체 (입/퇴)</th>
                                    <th style={{ padding: '1rem', textAlign: 'center' }}>남성 (입/퇴)</th>
                                    <th style={{ padding: '1rem', textAlign: 'center' }}>여성 (입/퇴)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hourlyData.map((data, idx) => (
                                    <tr key={idx}>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{data.hour}</td>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
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
