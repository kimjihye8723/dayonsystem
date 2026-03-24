/**
 * CCTV Sensor Data Collection Node
 * 
 * TCM_CCTV 테이블에서 USE_YN='Y'인 CCTV 목록을 동적으로 읽어
 * 각 센서의 CONNECT_INFO를 대상으로 주기적 폴링하여 혼잡도 데이터를 수집합니다.
 * 
 * - 10분 단위 정각(00분, 10분, 20분, 30분, 40분, 50분): 1번의 폴링으로 TCM_CCTV_RAW 기록
 * - 매시 정각(13:00, 14:00 등): 위 폴링 결과로 TCM_CCTV_STATISTICS 함께 기록
 * 
 * 최적화:
 * - 정각(00분)에 RAW와 STAT이 이중 폴링되어 503이 발생하는 것을 방지 (단일 폴링화)
 * - 동시 폴링 제한 (concurrency limit)으로 네트워크/센서 과부하 방지
 * - Batch INSERT로 DB 부하 최소화
 * - 503 System Busy 시 30초 간격 최대 3회 재시도
 */

require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const CONFIG = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 20,                // 대량 INSERT 대비 풀 확대
        queueLimit: 0
    },
    cctv: {
        user: process.env.CCTV_USER || 'admin',
        password: process.env.CCTV_PASSWORD || 'Tectree6767!'
    },
    listRefreshInterval: parseInt(process.env.LIST_REFRESH_INTERVAL || '300000', 10),
    maxRetries: 3,                          // 503 재시도 횟수
    retryDelay: 30000,                      // 재시도 대기 (30초)
    concurrencyLimit: 10,                   // 동시 폴링 최대 수 (1000대 중 10대씩 병렬)
    realtimeInterval: parseInt(process.env.REALTIME_INTERVAL || '20000', 10), // 실시간 폴링 루프 대기 시간 (20초)
    realtimeConcurrency: 5,                 // 실시간 폴링 동시 접속 제한
    realtimeDelayMs: 500                    // 실시간 폴링 센서 텀 (장비 보호용)
};

// ─────────────────────────────────────────────────────────────
// Database Pool
// ─────────────────────────────────────────────────────────────

let pool = null;

function initDB() {
    pool = mysql.createPool(CONFIG.db);
    console.log(`[DB] Connection pool created (${CONFIG.db.host}/${CONFIG.db.database})`);
}

// ─────────────────────────────────────────────────────────────
// CCTV List Management
// ─────────────────────────────────────────────────────────────

let activeCctvList = [];

async function refreshCctvList() {
    try {
        const [rows] = await pool.query(
            "SELECT idx, CONNECT_INFO, DEVICE_RTSP, REMARK FROM TCM_CCTV WHERE USE_YN = 'Y'"
        );

        const prev = activeCctvList.length;
        activeCctvList = rows.map(row => ({
            idx: row.idx,
            connectInfo: row.CONNECT_INFO,
            rtsp: row.DEVICE_RTSP || '',
            remark: row.REMARK || ''
        }));

        console.log(`[CCTV] 목록 갱신 완료: ${activeCctvList.length}대 활성 (이전: ${prev}대)`);
        return activeCctvList;
    } catch (err) {
        console.error('[CCTV] 목록 조회 실패:', err.message);
        return activeCctvList;
    }
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function getFormattedTime(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 동시 실행 제한 비동기 처리
 */
async function asyncPool(limit, items, fn) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
        // 서버 측 과부하를 막기 위해 루프 간 아주 짧은 대기(10ms) 추가
        await sleep(10);
        
        const p = fn(item).then(result => {
            executing.delete(p);
            return result;
        });
        executing.add(p);
        results.push(p);

        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

// ─────────────────────────────────────────────────────────────
// CCTV Sensor Polling (with 503 Retry)
// ─────────────────────────────────────────────────────────────

async function fetchSensorData(cctv) {
    const { connectInfo, idx } = cctv;

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const now = new Date();
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);

            const startTime = getFormattedTime(startOfDay);
            const endTime = getFormattedTime(now);

            const baseUrl = connectInfo.startsWith('http') ? connectInfo : `http://${connectInfo}`;
            const response = await axios.get(`${baseUrl}/api/statistics/query`, {
                params: {
                    start: startTime,
                    end: endTime,
                    interval: 'by1day'
                },
                auth: {
                    username: CONFIG.cctv.user,
                    password: CONFIG.cctv.password
                },
                headers: {
                    'Connection': 'close'
                },
                timeout: 30000
            });

            if (response.data && response.data.Status === 'Success' && response.data.Data && response.data.Data.Count) {
                let totalEnters = 0, totalExits = 0;
                let femaleEnters = 0, femaleExits = 0;
                let maleEnters = 0, maleExits = 0;

                response.data.Data.Count.forEach(zone => {
                    totalEnters += parseInt(zone.Enters || 0, 10);
                    totalExits += parseInt(zone.Exits || 0, 10);
                    femaleEnters += parseInt(zone.EntersFemaleCustomer || 0, 10);
                    femaleExits += parseInt(zone.ExitsFemaleCustomer || 0, 10);
                    maleEnters += parseInt(zone.EntersMaleCustomer || 0, 10);
                    maleExits += parseInt(zone.ExitsMaleCustomer || 0, 10);
                });

                const result = {
                    idx,
                    connectInfo,
                    status: 'online',
                    maleIn: maleEnters,
                    maleOut: maleExits,
                    femaleIn: femaleEnters,
                    femaleOut: femaleExits,
                    totalIn: totalEnters,
                    totalOut: totalExits,
                    time: now.toLocaleTimeString()
                };

                console.log(`  ✓ [${idx}] ${connectInfo} — 입장: ${totalEnters}, 퇴장: ${totalExits} (남:${maleEnters}/${maleExits}, 여:${femaleEnters}/${femaleExits})`);
                return result;
            }

            console.warn(`  ✗ [${idx}] ${connectInfo} — 응답 형식 오류`);
            return { idx, connectInfo, status: 'error' };

        } catch (error) {
            // 503 System Busy → 재시도
            if (error.response && error.response.status === 503 && attempt < CONFIG.maxRetries) {
                console.warn(`  ⟳ [${idx}] ${connectInfo} — 503 System Busy, ${CONFIG.retryDelay / 1000}초 후 재시도 (${attempt}/${CONFIG.maxRetries})`);
                await sleep(CONFIG.retryDelay);
                continue;
            }

            const msg = error.code === 'ECONNABORTED' ? '타임아웃 (30s)'
                : error.response ? `HTTP ${error.response.status}`
                : error.message;
            console.error(`  ✗ [${idx}] ${connectInfo} — ${msg}${attempt > 1 ? ` (${attempt}회 시도 후 실패)` : ''}`);
            return { idx, connectInfo, status: 'offline', error: msg };
        }
    }
}

// ─────────────────────────────────────────────────────────────
// DB Insert Functions (Batch INSERT)
// ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 500; // 한 번에 INSERT할 최대 행 수

async function insertRawData(results) {
    const onlineResults = results.filter(r => r.status === 'online');
    if (onlineResults.length === 0) return;

    const sql = `INSERT INTO TCM_CCTV_RAW (CONNECT_INFO, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) VALUES ?`;
    const now = new Date();

    for (let i = 0; i < onlineResults.length; i += BATCH_SIZE) {
        const batch = onlineResults.slice(i, i + BATCH_SIZE);
        const values = batch.map(r => [
            r.connectInfo, now,
            r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut
        ]);

        try {
            const [result] = await pool.query(sql, [values]);
            console.log(`[RAW] ${result.affectedRows}건 INSERT 완료`);
        } catch (err) {
            console.error(`[RAW] INSERT 실패:`, err.message);
        }
    }
}

async function insertStatisticsData(results) {
    const onlineResults = results.filter(r => r.status === 'online');
    if (onlineResults.length === 0) return;

    const sql = `INSERT INTO TCM_CCTV_STATISTICS (CONNECT_INFO, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) VALUES ?`;
    const now = new Date();

    for (let i = 0; i < onlineResults.length; i += BATCH_SIZE) {
        const batch = onlineResults.slice(i, i + BATCH_SIZE);
        const values = batch.map(r => [
            r.connectInfo, now,
            r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut
        ]);

        try {
            const [result] = await pool.query(sql, [values]);
            console.log(`[STAT] ${result.affectedRows}건 INSERT 완료 (정시 통계)`);
        } catch (err) {
            console.error(`[STAT] INSERT 실패:`, err.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Unified Polling & Clock-Aligned Scheduling
// ─────────────────────────────────────────────────────────────

async function pollAndSaveCctvData(isHourly) {
    if (activeCctvList.length === 0) {
        console.log('[POLL] 활성 CCTV 없음, 스킵');
        return;
    }

    const timestamp = new Date().toLocaleString();
    console.log(`\n[POLL] ────── ${timestamp} ──────`);
    console.log(`[POLL] ${activeCctvList.length}대 센서 폴링 시작 (동시 ${CONFIG.concurrencyLimit}대${isHourly ? ', 정시 통계 포함' : ''})`);

    const results = await asyncPool(CONFIG.concurrencyLimit, activeCctvList, fetchSensorData);

    const online = results.filter(r => r.status === 'online').length;
    console.log(`[POLL] 완료: 온라인 ${online}대 / ${results.length}대`);

    if (results.length > 0) {
        // 무조건 RAW INSERT
        await insertRawData(results);

        // 정각인 경우 STAT INSERT 추가
        if (isHourly) {
            await insertStatisticsData(results);
        }
    }
}

/**
 * 통합 스케줄링: 다음 10분 정각을 계산 후 실행 (Drift 방지를 위해 매번 재귀)
 */
function scheduleUnifiedPolling() {
    const now = new Date();
    const minutes = now.getMinutes();
    const next10 = Math.ceil((minutes + 1) / 10) * 10;
    const next = new Date(now);

    if (next10 >= 60) {
        next.setHours(next.getHours() + 1, 0, 0, 0);
    } else {
        next.setMinutes(next10, 0, 0);
    }

    const isHourly = (next.getMinutes() === 0);
    const delay = next.getTime() - now.getTime();
    
    const pad = n => String(n).padStart(2, '0');
    console.log(`[POLL] 다음 스케줄: ${pad(next.getHours())}:${pad(next.getMinutes())} (${Math.round(delay / 1000)}초 후) ${isHourly ? '[STAT 포함]' : ''}`);

    setTimeout(() => {
        pollAndSaveCctvData(isHourly).finally(() => {
            scheduleUnifiedPolling();
        });
    }, delay);
}

async function updateRealtimeData(results) {
    if (results.length === 0) return;

    const sqlOnline = `UPDATE TCM_CCTV SET CONNECT_YN = 'Y', CONNECT_DT = NOW(), NOW_MALE_IN = ?, NOW_MALE_OUT = ?, NOW_FEMALE_IN = ?, NOW_FEMALE_OUT = ?, NOW_TOTAL_IN = ?, NOW_TOTAL_OUT = ? WHERE CONNECT_INFO = ?`;
    const sqlOffline = `UPDATE TCM_CCTV SET CONNECT_YN = 'N', CONNECT_DT = NOW() WHERE CONNECT_INFO = ?`;

    let onlineCount = 0;
    let offlineCount = 0;

    for (const r of results) {
        try {
            if (r.status === 'online') {
                await pool.query(sqlOnline, [
                    r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut, r.connectInfo
                ]);
                onlineCount++;
            } else {
                await pool.query(sqlOffline, [r.connectInfo]);
                offlineCount++;
            }
        } catch (err) {
            console.error(`  ✗ [REALTIME] UPDATE 실패 (${r.connectInfo}):`, err.message);
        }
    }
    console.log(`[REALTIME] DB 갱신 완료 (온라인: ${onlineCount}, 오프라인: ${offlineCount})`);
}

// ─────────────────────────────────────────────────────────────
// Real-time Independent Polling Loop
// ─────────────────────────────────────────────────────────────

async function pollRealtimeLoop() {
    if (activeCctvList.length === 0) {
        console.log('[REALTIME] 활성 CCTV 없음, 대기...');
    } else {
        const timestamp = new Date().toLocaleString();
        console.log(`\n[REALTIME] ────── ${timestamp} ──────`);
        console.log(`[REALTIME] ${activeCctvList.length}대 실시간 폴링 시작 (동시 ${CONFIG.realtimeConcurrency}대)`);

        // 실시간 폴링용 fetcher 래퍼 (추가 딜레이)
        const fetchWithDelay = async (cctv) => {
            await sleep(CONFIG.realtimeDelayMs);
            return fetchSensorData(cctv);
        };

        const results = await asyncPool(CONFIG.realtimeConcurrency, activeCctvList, fetchWithDelay);
        await updateRealtimeData(results);
    }

    // 지정된 간격 후 다음 실시간 루프 실행
    setTimeout(() => {
        pollRealtimeLoop();
    }, CONFIG.realtimeInterval);
}

// ─────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  CCTV Sensor Node — Starting...');
    console.log('═══════════════════════════════════════════');
    console.log(`  수집 간격      : 매 10분 정각 (00,10,20,30,40,50분)`);
    console.log(`  통계 분기      : 매시 정각 (00분) 폴링 시 통계 DB 동시 기록`);
    console.log(`  목록 갱신      : ${CONFIG.listRefreshInterval / 1000}초 간격`);
    console.log(`  503 재시도     : 최대 ${CONFIG.maxRetries}회 (${CONFIG.retryDelay / 1000}초 간격)`);
    console.log(`  동시 폴링      : 최대 ${CONFIG.concurrencyLimit}대`);
    console.log(`  DB Batch       : ${BATCH_SIZE}건씩 INSERT`);
    console.log(`  ── 실시간(Realtime) 스케줄러 ──`);
    console.log(`  실시간 주기    : ${CONFIG.realtimeInterval / 1000}초 간격`);
    console.log(`  실시간 동시접근: 최대 ${CONFIG.realtimeConcurrency}대 (장비 보호)`);
    console.log('');

    // 1. DB 연결
    initDB();

    // 2. 초기 CCTV 목록 로드
    await refreshCctvList();

    // 3. 통합 스케줄링 (10분/정시 스케줄링) 시작
    scheduleUnifiedPolling();

    // 4. 독립된 실시간 스케줄링 루프 시작 (센서 보호 측면에서 지연 실행)
    console.log(`[MAIN] 실시간 폴링 대기 중 (${CONFIG.realtimeInterval / 1000}초 후 첫 실행)...`);
    setTimeout(pollRealtimeLoop, CONFIG.realtimeInterval);

    // 5. 주기적 CCTV 목록 갱신
    setInterval(refreshCctvList, CONFIG.listRefreshInterval);

    console.log(`\n[MAIN] 서비스 구동 중... (Ctrl+C로 종료)`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[MAIN] 종료 중...');
    if (pool) await pool.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] 예상치 못한 오류:', err.message);
});

main().catch(err => {
    console.error('[FATAL] 시작 실패:', err.message);
    process.exit(1);
});
