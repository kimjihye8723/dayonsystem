import { Search, Printer, BarChart3, TrendingUp, UserPlus, UserMinus, Users, RefreshCw } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import Chart from 'react-apexcharts';
import axios from 'axios';

interface TodayContentProps {
    theme?: 'light' | 'dark';
}

const TodayContent: React.FC<TodayContentProps> = ({ theme = 'dark' }) => {
    const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [vendors, setVendors] = useState<{ VENDOR_CD: string, VENDOR_NM: string }[]>([]);
    const [selectedVendor, setSelectedVendor] = useState<string>('(전체조회)');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    
    const [hourlyData, setHourlyData] = useState<any[]>([]);
    const [dailyTotals, setDailyTotals] = useState({ totalIn: 0, totalOut: 0, maleIn: 0, maleOut: 0, femaleIn: 0, femaleOut: 0 });

    // Get color based on theme
    const textColor = theme === 'light' ? '#64748b' : '#94a3b8';

    const fetchVendors = useCallback(async () => {
        try {
            const res = await axios.get('/api/realtimestatus/vendors');
            if (res.data.success) {
                setVendors(res.data.vendors);
            }
        } catch (err) {
            console.error("Error fetching vendors:", err);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/realtimestatus/data', {
                params: {
                    vendorCd: selectedVendor,
                    date: selectedDate
                }
            });
            if (res.data.success) {
                setHourlyData(res.data.hourly);
                if (res.data.dailyTotals) {
                    setDailyTotals(res.data.dailyTotals);
                }
            }
        } catch (err) {
            console.error("Error fetching today data:", err);
        } finally {
            setLoading(false);
        }
    }, [selectedVendor, selectedDate]);

    useEffect(() => {
        fetchVendors();
    }, [fetchVendors]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleRefresh = () => fetchData();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F5' || e.key === 'F2') {
                e.preventDefault();
                handleRefresh();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fetchData]);

    const handleExport = (format: string) => {
        setIsExportMenuOpen(false);
        const headers = ['시간', '입장', '퇴장', '잔류', '합계'];
        const rows = hourlyData.map(d => [
            `${d.hour}:00`, 
            d.totalIn.toString(), 
            d.totalOut.toString(), 
            (Number(d.totalIn) - Number(d.totalOut)).toString(), 
            (Number(d.totalIn) + Number(d.totalOut)).toString()
        ]);

        const now = new Date();
        const dateStr = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}`;
        const companyName = selectedVendor === '(전체조회)' ? "전체거래처" : vendors.find(v => v.VENDOR_CD === selectedVendor)?.VENDOR_NM || "거래처";
        let fileName = `고데이터_${companyName}_투데이통계_${dateStr}`;
        let content = '';
        let mimeType = 'text/plain';

        switch (format) {
            case 'csv':
                content = [headers, ...rows].map(r => r.join(',')).join('\n');
                fileName += '.csv';
                mimeType = 'text/csv';
                break;
            case 'tsv':
                content = [headers, ...rows].map(r => r.join('\t')).join('\n');
                fileName += '.tsv';
                break;
            case 'xml':
                content = `<?xml version="1.0" encoding="UTF-8"?>\n<data>\n${hourlyData.map(d =>
                    `  <row>\n    <time>${d.hour}:00</time>\n    <in>${d.totalIn}</in>\n    <out>${d.totalOut}</out>\n    <stay>${Number(d.totalIn) - Number(d.totalOut)}</stay>\n    <total>${Number(d.totalIn) + Number(d.totalOut)}</total>\n  </row>`
                ).join('\n')}\n</data>`;
                fileName += '.xml';
                mimeType = 'application/xml';
                break;
            case 'html':
                content = `<html><body><table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(td => `<td>${td}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
                fileName += '.html';
                mimeType = 'text/html';
                break;
            case 'excel':
            case 'pivot':
                content = `\ufeff<table border="1"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(td => `<td>${td}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
                fileName += '.xlsx';
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                break;
            case 'pdf':
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    const tableHtml = `
                        <html>
                            <head>
                                <title>통계 보고서</title>
                                <style>
                                    body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; color: ${theme === 'light' ? '#333' : '#f1f5f9'}; background: ${theme === 'light' ? '#fff' : '#0f172a'}; }
                                    .header { margin-bottom: 20px; border-bottom: 2px solid ${theme === 'light' ? '#333' : '#334155'}; padding-bottom: 10px; }
                                    .company { font-size: 24px; font-weight: bold; }
                                    .title { font-size: 18px; color: ${theme === 'light' ? '#666' : '#94a3b8'}; margin-top: 5px; }
                                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                                    th, td { border: 1px solid ${theme === 'light' ? '#ddd' : '#1e293b'}; padding: 10px; text-align: center; }
                                    th { background-color: ${theme === 'light' ? '#f5f5f5' : '#1e293b'}; font-weight: bold; }
                                    .date { text-align: right; font-size: 12px; color: #999; margin-top: 10px; }
                                </style>
                            </head>
                            <body>
                                <div class="header">
                                    <div class="company">${companyName}</div>
                                    <div class="title">투데이 통계 리포트 (${selectedDate})</div>
                                </div>
                                <table>
                                    <thead>
                                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                                    </thead>
                                    <tbody>
                                        ${rows.map(r => `<tr>${r.map(td => `<td>${td}</td>`).join('')}</tr>`).join('')}
                                    </tbody>
                                </table>
                                <div class="date">출력일시: ${new Date().toLocaleString()}</div>
                                <script>
                                    window.onload = function() {
                                        window.print();
                                        window.onafterprint = function() { window.close(); };
                                    };
                                </script>
                            </body>
                        </html>
                    `;
                    printWindow.document.write(tableHtml);
                    printWindow.document.close();
                }
                return;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // dailyTotals comes pre-computed from backend: SUM(hourly stats) + real-time current values
    const stayCount = Math.max(0, dailyTotals.totalIn - dailyTotals.totalOut);

    const chartOptions: ApexCharts.ApexOptions = {
        chart: {
            id: 'hourly-traffic',
            toolbar: { show: false },
            zoom: { enabled: false },
            background: 'transparent',
            foreColor: textColor,
            animations: {
                enabled: true,
                speed: 800,
            },
            dropShadow: {
                enabled: chartType === 'line',
                top: 10,
                left: 0,
                blur: 8,
                color: '#000',
                opacity: 0.35
            }
        },
        theme: { mode: theme },
        stroke: {
            curve: 'smooth',
            width: chartType === 'line' ? 4 : 0,
            lineCap: 'round'
        },
        colors: ['#38bdf8', '#fb7185', '#34d399', '#fbbf24'],
        xaxis: {
            categories: hourlyData.map(d => `${d.hour}시`),
            axisBorder: { show: false },
            axisTicks: { show: false },
            labels: {
                style: { colors: textColor, fontSize: '11px' }
            }
        },
        yaxis: {
            labels: {
                show: true,
                formatter: (val) => val.toFixed(0),
                style: { colors: textColor, fontSize: '11px' }
            },
            axisBorder: { show: false },
            title: {
                text: '(명)',
                style: { color: textColor, fontWeight: 500, fontSize: '12px' }
            }
        },
        grid: {
            borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(203, 213, 225, 0.05)',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
            padding: { top: 10, right: 20, bottom: 0, left: 10 }
        },
        fill: {
            type: chartType === 'line' ? 'gradient' : 'solid',
            gradient: {
                shade: theme,
                type: 'vertical',
                shadeIntensity: 0.5,
                inverseColors: true,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [0, 100]
            }
        },
        plotOptions: {
            bar: {
                columnWidth: '60%',
                borderRadius: 5,
                borderRadiusApplication: 'around',
                dataLabels: {
                    position: 'top',
                },
            }
        },
        dataLabels: {
            enabled: chartType === 'bar',
            offsetY: -22,
            style: {
                fontSize: '11px',
                fontWeight: 600,
                colors: [theme === 'light' ? '#334155' : '#cbd5e1']
            }
        },
        markers: {
            size: chartType === 'line' ? 5 : 0,
            colors: [theme === 'light' ? '#ffffff' : '#1e293b'],
            strokeColors: ['#38bdf8', '#fb7185', '#34d399', '#fbbf24'],
            strokeWidth: 3,
            hover: {
                size: 8,
                sizeOffset: 3
            }
        },
        tooltip: {
            theme: theme,
            shared: true,
            intersect: false,
            y: {
                formatter: (val) => `${val} 명`
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -10,
            labels: {
                colors: textColor
            }
        }
    };

    const chartSeries = [
        {
            name: '입장',
            data: hourlyData.map(d => d.totalIn)
        },
        {
            name: '퇴장',
            data: hourlyData.map(d => d.totalOut)
        },
        {
            name: '잔류',
            data: hourlyData.map(d => Number(d.totalIn) - Number(d.totalOut))
        },
        {
            name: '합계',
            data: hourlyData.map(d => Number(d.totalIn) + Number(d.totalOut))
        }
    ];

    return (
        <div className="animate-fade-in">
            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="filter-group">
                    <select 
                        className="filter-input" 
                        style={{ width: '200px' }}
                        value={selectedVendor}
                        onChange={(e) => setSelectedVendor(e.target.value)}
                    >
                        <option>(전체조회)</option>
                        {vendors.map(v => (
                            <option key={v.VENDOR_CD} value={v.VENDOR_CD}>{v.VENDOR_NM}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <input 
                        type="date" 
                        className="filter-input" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                </div>
                
                <div className="filter-group">
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }} onClick={handleRefresh}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? '갱신 중...' : '새로고침(F5)'}
                    </button>
                </div>
                <div className="filter-group">
                    <button className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', gap: '0.5rem', fontSize: '0.875rem' }} onClick={handleRefresh}>
                        <Search size={16} /> 조회
                    </button>
                </div>
                <div className="filter-group">
                    <div className="export-container">
                        <button
                            className="btn"
                            style={{ background: '#3b82f6', color: 'white', padding: '0.5rem 1.25rem', gap: '0.5rem', fontSize: '0.875rem' }}
                            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        >
                            <Printer size={16} /> 출력
                        </button>
                        {isExportMenuOpen && (
                            <div className="export-dropdown animate-fade-in" style={{ animationDuration: '0.2s' }}>
                                <div className="export-item" onClick={() => handleExport('excel')}>Excel파일저장</div>
                                <div className="export-item" onClick={() => handleExport('csv')}>CSV저장</div>
                                <div className="export-item" onClick={() => handleExport('tsv')}>TSV저장</div>
                                <div className="export-item" onClick={() => handleExport('xml')}>XML저장</div>
                                <div className="export-item" onClick={() => handleExport('html')}>HTML저장</div>
                                <div className="export-divider"></div>
                                <div className="export-item" onClick={() => handleExport('pivot')}>PivotExcel파일저장</div>
                                <div className="export-item" onClick={() => handleExport('pdf')}>PDF 미리보기</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary Grid - 4 Large Cards */}
            <div className="summary-grid">
                <div className="summary-card card-sky">
                    <div className="card-icon"><UserPlus size={24} /></div>
                    <div>
                        <div className="title">누적 입장</div>
                        <div className="main-val">{dailyTotals.totalIn.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">오늘 누적 수치</div>
                </div>

                <div className="summary-card card-rose">
                    <div className="card-icon"><UserMinus size={24} /></div>
                    <div>
                        <div className="title">누적 퇴장</div>
                        <div className="main-val">{dailyTotals.totalOut.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">오늘 누적 수치</div>
                </div>

                <div className="summary-card card-emerald">
                    <div className="card-icon"><Users size={24} /></div>
                    <div>
                        <div className="title">현재 잔류</div>
                        <div className="main-val">{stayCount.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">In - Out 현황</div>
                </div>

                <div className="summary-card card-amber">
                    <div className="card-icon"><BarChart3 size={24} /></div>
                    <div>
                        <div className="title">교통량 합계</div>
                        <div className="main-val">{(dailyTotals.totalIn + dailyTotals.totalOut).toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">In + Out 합계</div>
                </div>
            </div>

            {/* Chart & Detail Section */}
            <div className="data-card" style={{
                border: '1px solid var(--card-border)',
                background: 'var(--bg-card)',
                boxShadow: theme === 'dark' ? '0 20px 40px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            display: 'flex',
                            background: 'var(--input-bg)',
                            padding: '0.25rem',
                            borderRadius: '0.5rem',
                            gap: '0.25rem',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <button
                                className={`btn ${chartType === 'bar' ? 'btn-primary' : ''}`}
                                style={{ padding: '0.4rem 1.2rem', fontSize: '0.875rem', fontWeight: 600, background: chartType === 'bar' ? '' : 'transparent' }}
                                onClick={() => setChartType('bar')}
                            >
                                <BarChart3 size={14} style={{ marginRight: '6px' }} /> 막대그래프
                            </button>
                            <button
                                className={`btn ${chartType === 'line' ? 'btn-primary' : ''}`}
                                style={{ padding: '0.4rem 1.2rem', fontSize: '0.875rem', fontWeight: 600, background: chartType === 'line' ? '' : 'transparent' }}
                                onClick={() => setChartType('line')}
                            >
                                <TrendingUp size={14} style={{ marginRight: '6px' }} /> 라인그래프
                            </button>
                        </div>
                    </div>
                    <button className="btn" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)', padding: '0.5rem 1.25rem', fontSize: '0.875rem', border: '1px solid var(--glass-border)' }}>
                        엑셀다운로드
                    </button>
                </div>

                <div className="chart-scroll-wrapper">
                    <div className="chart-area-inner">
                        <Chart
                            options={chartOptions}
                            series={chartSeries}
                            type={chartType}
                            height="100%"
                            width="100%"
                        />
                    </div>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <table className="data-table">
                        <thead>
                            <tr style={{ background: 'var(--table-header)' }}>
                                <th>순번</th>
                                <th>시간</th>
                                <th>입장</th>
                                <th>퇴장</th>
                                <th>잔류(현원)</th>
                                <th>교통량(합계)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hourlyData.map((data, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{index + 1}</td>
                                    <td style={{ color: 'var(--text-main)', fontWeight: 600, textAlign: 'center' }}>{data.hour}시</td>
                                    <td style={{ color: '#38bdf8', fontWeight: 600, textAlign: 'center' }}>{data.totalIn}</td>
                                    <td style={{ color: '#fb7185', fontWeight: 600, textAlign: 'center' }}>{data.totalOut}</td>
                                    <td style={{ color: '#34d399', fontWeight: 600, textAlign: 'center' }}>{Number(data.totalIn) - Number(data.totalOut)}</td>
                                    <td style={{ color: '#fbbf24', fontWeight: 600, textAlign: 'center' }}>{Number(data.totalIn) + Number(data.totalOut)}</td>
                                </tr>
                            ))}
                            {hourlyData.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>가져올 데이터가 없습니다.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TodayContent;
