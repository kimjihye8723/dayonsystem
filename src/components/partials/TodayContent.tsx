import React, { useState } from 'react';
import { Search, Printer, BarChart3, TrendingUp, UserPlus, UserMinus, Users } from 'lucide-react';
import Chart from 'react-apexcharts';

interface TodayContentProps {
    theme?: 'light' | 'dark';
}

interface DataItem {
    time: string;
    in: number;
    out: number;
    stay: number;
    total: number;
}

const TodayContent: React.FC<TodayContentProps> = ({ theme = 'dark' }) => {
    const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    // Get color based on theme from CSS variables or defaults
    const textColor = theme === 'light' ? '#64748b' : '#94a3b8';

    const dummyData: DataItem[] = [
        { time: '09:00 ~ 10:00', in: 45, out: 12, stay: 33, total: 57 },
        { time: '10:00 ~ 11:00', in: 82, out: 34, stay: 81, total: 116 },
        { time: '11:00 ~ 12:00', in: 124, out: 56, stay: 149, total: 180 },
        { time: '12:00 ~ 13:00', in: 95, out: 88, stay: 156, total: 183 },
        { time: '13:00 ~ 14:00', in: 156, out: 42, stay: 270, total: 198 },
        { time: '14:00 ~ 15:00', in: 88, out: 65, stay: 293, total: 153 },
        { time: '15:00 ~ 16:00', in: 72, out: 95, stay: 270, total: 167 },
        { time: '16:00 ~ 17:00', in: 45, out: 120, stay: 195, total: 165 },
        { time: '17:00 ~ 18:00', in: 110, out: 85, stay: 220, total: 195 },
        { time: '18:00 ~ 19:00', in: 190, out: 45, stay: 365, total: 235 },
        { time: '19:00 ~ 20:00', in: 65, out: 150, stay: 280, total: 215 },
    ];

    const handleExport = (format: string) => {
        setIsExportMenuOpen(false);
        const headers = ['시간', '입장', '퇴장', '잔류', '합계'];
        const rows = dummyData.map(d => [d.time, d.in.toString(), d.out.toString(), d.stay.toString(), d.total.toString()]);

        const now = new Date();
        const dateStr = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}`;
        const companyName = "현대보안월드";
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
                content = `<?xml version="1.0" encoding="UTF-8"?>\n<data>\n${dummyData.map(d =>
                    `  <row>\n    <time>${d.time}</time>\n    <in>${d.in}</in>\n    <out>${d.out}</out>\n    <stay>${d.stay}</stay>\n    <total>${d.total}</total>\n  </row>`
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
                                    <div class="company">현대보안월드</div>
                                    <div class="title">투데이 통계 리포트</div>
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

    const totals = {
        in: dummyData.reduce((acc, cur) => acc + cur.in, 0),
        out: dummyData.reduce((acc, cur) => acc + cur.out, 0),
        stay: dummyData[dummyData.length - 1].stay,
        total: dummyData.reduce((acc, cur) => acc + cur.total, 0),
    };

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
            categories: dummyData.map(d => d.time.split('~')[0].trim()),
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
            data: dummyData.map(d => d.in)
        },
        {
            name: '퇴장',
            data: dummyData.map(d => d.out)
        },
        {
            name: '잔류',
            data: dummyData.map(d => d.stay)
        },
        {
            name: '합계',
            data: dummyData.map(d => d.total)
        }
    ];

    return (
        <div className="animate-fade-in">
            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="filter-group">
                    <select className="filter-input" style={{ width: '120px' }}>
                        <option>(전체조회)</option>
                        <option>쇼룸</option>
                    </select>
                </div>
                <div className="filter-group">
                    <input type="date" className="filter-input" defaultValue="2026-02-23" />
                </div>
                <div className="filter-group">
                    <select className="filter-input" style={{ width: '100px' }}>
                        <option>60분단위</option>
                        <option>30분단위</option>
                        <option>15분단위</option>
                        <option>05분단위</option>
                    </select>
                </div>
                <div className="filter-group">
                    <select className="filter-input" style={{ width: '80px' }}>
                        <option>수동</option>
                        <option>60초</option>
                        <option>45초</option>
                        <option>30초</option>
                        <option>20초</option>
                        <option>10초</option>
                        <option>5초</option>
                        <option>1초</option>
                    </select>
                </div>
                <div className="filter-group">
                    <button className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', gap: '0.5rem', fontSize: '0.875rem' }}>
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
                        <div className="title">입장</div>
                        <div className="main-val">{totals.in.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">월간 3,420 명</div>
                </div>

                <div className="summary-card card-rose">
                    <div className="card-icon"><UserMinus size={24} /></div>
                    <div>
                        <div className="title">퇴장</div>
                        <div className="main-val">{totals.out.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">월간 2,980 명</div>
                </div>

                <div className="summary-card card-emerald">
                    <div className="card-icon"><Users size={24} /></div>
                    <div>
                        <div className="title">잔류</div>
                        <div className="main-val">{totals.stay.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">월간 0 명</div>
                </div>

                <div className="summary-card card-amber">
                    <div className="card-icon"><BarChart3 size={24} /></div>
                    <div>
                        <div className="title">합계</div>
                        <div className="main-val">{totals.total.toLocaleString()} <span className="unit">명</span></div>
                    </div>
                    <div className="sub-val">월간 6,400 명</div>
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
                                <th>잔류</th>
                                <th>합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dummyData.map((data, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ color: 'var(--text-muted)' }}>{index + 1}</td>
                                    <td style={{ color: 'var(--text-main)', fontWeight: 600 }}>{data.time}</td>
                                    <td style={{ color: '#38bdf8', fontWeight: 600 }}>{data.in}</td>
                                    <td style={{ color: '#fb7185', fontWeight: 600 }}>{data.out}</td>
                                    <td style={{ color: '#34d399', fontWeight: 600 }}>{data.stay}</td>
                                    <td style={{ color: '#fbbf24', fontWeight: 600 }}>{data.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TodayContent;
