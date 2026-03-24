/**
 * CCTV Sensor Data Collection Node v3.0 (Minimal Polling)
 * 
 * TD2000 센서가 동시 1개 API 요청만 처리 가능 (503 System Busy)
 * → 실시간 폴링 제거, 10분 정각 스케줄만 유지
 * → 정각 폴링 결과로 RAW/STAT INSERT + 실시간(NOW_) 갱신 동시 처리
 * 
 * [스케줄]
 *   - 10분 정각(00/10/20/30/40/50분): 센서 1회 쿼리 → TCM_CCTV_RAW + TCM_CCTV 갱신
 *   - 정시(00분): TCM_CCTV_STATISTICS 추가 INSERT
 * 
 * [안정성]
 *   - 센서당 순차 처리 (동시 접근 없음)
 *   - 503 재시도 10초 × 3회
 *   - 요청 타임아웃 30초
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
        connectionLimit: 10,
        queueLimit: 0
    },
    cctv: {
        user: process.env.CCTV_USER || 'admin',
        password: process.env.CCTV_PASSWORD || 'Tectree6767!'
    },
    listRefreshInterval: parseInt(process.env.LIST_REFRESH_INTERVAL || '300000', 10),
    maxRetries: 3,
    retryDelay: 10000,          // 503 재시도 대기: 10초
    requestTimeout: 30000       // HTTP 요청 타임아웃: 30초
};

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

let pool = null;
let activeCctvList = [];

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

function log(tag, msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.log(`[${t}] [${tag}] ${msg}`);
}
function logErr(tag, msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.error(`[${t}] [${tag}] ❌ ${msg}`);
}

// ─────────────────────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────────────────────

function initDB() {
    pool = mysql.createPool(CONFIG.db);
    log('DB', `풀 생성 (${CONFIG.db.host}/${CONFIG.db.database})`);
}

// ─────────────────────────────────────────────────────────────
// CCTV List
// ─────────────────────────────────────────────────────────────

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
        log('CCTV', `목록 갱신: ${activeCctvList.length}대 (이전: ${prev}대)`);
    } catch (err) {
        logErr('CCTV', `목록 조회 실패: ${err.message}`);
    }
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

function formatDT(date) {
    const p = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// 센서 API 호출 (순차, 재시도 포함)
// ─────────────────────────────────────────────────────────────

async function fetchSensorData(cctv) {
    const { connectInfo, idx } = cctv;
    const baseUrl = connectInfo.startsWith('http') ? connectInfo : `http://${connectInfo}`;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const response = await axios.get(`${baseUrl}/api/statistics/query`, {
                params: {
                    start: formatDT(startOfDay),
                    end: formatDT(now),
                    interval: 'by1day'
                },
                auth: {
                    username: CONFIG.cctv.user,
                    password: CONFIG.cctv.password
                },
                headers: { 'Connection': 'close' },
                timeout: CONFIG.requestTimeout
            });

            if (response.data && response.data.Status === 'Success' && response.data.Data && response.data.Data.Count) {
                let totalIn = 0, totalOut = 0;
                let maleIn = 0, maleOut = 0;
                let femaleIn = 0, femaleOut = 0;

                response.data.Data.Count.forEach(zone => {
                    totalIn += parseInt(zone.Enters || 0, 10);
                    totalOut += parseInt(zone.Exits || 0, 10);
                    femaleIn += parseInt(zone.EntersFemaleCustomer || 0, 10);
                    femaleOut += parseInt(zone.ExitsFemaleCustomer || 0, 10);
                    maleIn += parseInt(zone.EntersMaleCustomer || 0, 10);
                    maleOut += parseInt(zone.ExitsMaleCustomer || 0, 10);
                });

                log('SENSOR', `  ✓ [${idx}] 입:${totalIn} 출:${totalOut} (남:${maleIn}/${maleOut} 여:${femaleIn}/${femaleOut})${attempt > 1 ? ` [${attempt}회째 성공]` : ''}`);
                return {
                    idx, connectInfo, status: 'online',
                    totalIn, totalOut, maleIn, maleOut, femaleIn, femaleOut
                };
            }

            log('SENSOR', `  ✗ [${idx}] 응답 형식 오류`);
            return { idx, connectInfo, status: 'error' };

        } catch (error) {
            if (error.response && error.response.status === 503 && attempt < CONFIG.maxRetries) {
                log('SENSOR', `  ⟳ [${idx}] 503 System Busy → ${CONFIG.retryDelay / 1000}초 후 재시도 (${attempt}/${CONFIG.maxRetries})`);
                await sleep(CONFIG.retryDelay);
                continue;
            }

            const msg = error.code === 'ECONNABORTED' ? '타임아웃'
                : error.response ? `HTTP ${error.response.status}`
                : error.message;
            logErr('SENSOR', `  [${idx}] ${connectInfo} — ${msg}${attempt > 1 ? ` (${attempt}회 시도 후)` : ''}`);
            return { idx, connectInfo, status: 'offline', error: msg };
        }
    }
}

// ─────────────────────────────────────────────────────────────
// DB Insert/Update
// ─────────────────────────────────────────────────────────────

async function insertRawData(results) {
    const online = results.filter(r => r.status === 'online');
    if (online.length === 0) return;

    const sql = `INSERT INTO TCM_CCTV_RAW (CONNECT_INFO, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) VALUES ?`;
    const now = new Date();
    const values = online.map(r => [
        r.connectInfo, now, r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut
    ]);
    try {
        const [result] = await pool.query(sql, [values]);
        log('RAW', `${result.affectedRows}건 INSERT 완료`);
    } catch (err) {
        logErr('RAW', `INSERT 실패: ${err.message}`);
    }
}

async function insertStatisticsData(results) {
    const online = results.filter(r => r.status === 'online');
    if (online.length === 0) return;

    const sql = `INSERT INTO TCM_CCTV_STATISTICS (CONNECT_INFO, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) VALUES ?`;
    const now = new Date();
    const values = online.map(r => [
        r.connectInfo, now, r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut
    ]);
    try {
        const [result] = await pool.query(sql, [values]);
        log('STAT', `${result.affectedRows}건 INSERT 완료 (정시 통계)`);
    } catch (err) {
        logErr('STAT', `INSERT 실패: ${err.message}`);
    }
}

async function updateRealtimeData(results) {
    const sqlOnline = `UPDATE TCM_CCTV SET CONNECT_YN = 'Y', CONNECT_DT = NOW(), NOW_MALE_IN = ?, NOW_MALE_OUT = ?, NOW_FEMALE_IN = ?, NOW_FEMALE_OUT = ?, NOW_TOTAL_IN = ?, NOW_TOTAL_OUT = ? WHERE CONNECT_INFO = ?`;
    const sqlOffline = `UPDATE TCM_CCTV SET CONNECT_YN = 'N', CONNECT_DT = NOW() WHERE CONNECT_INFO = ?`;

    let ok = 0, fail = 0;
    for (const r of results) {
        try {
            if (r.status === 'online') {
                await pool.query(sqlOnline, [
                    r.maleIn, r.maleOut, r.femaleIn, r.femaleOut, r.totalIn, r.totalOut, r.connectInfo
                ]);
                ok++;
            } else {
                await pool.query(sqlOffline, [r.connectInfo]);
                fail++;
            }
        } catch (err) {
            logErr('DB', `UPDATE 실패 (${r.connectInfo}): ${err.message}`);
        }
    }
    log('REALTIME', `DB 갱신 (온라인: ${ok}, 오프라인: ${fail})`);
}

// ─────────────────────────────────────────────────────────────
// 10분 정각 스케줄러 (유일한 센서 접근 방식)
// ─────────────────────────────────────────────────────────────

async function executeScheduledPoll(isHourly) {
    if (activeCctvList.length === 0) {
        log('POLL', '활성 CCTV 없음, 스킵');
        return;
    }

    log('POLL', `────── ${activeCctvList.length}대 폴링 시작${isHourly ? ' [+정시 통계]' : ''} ──────`);

    // 센서별 순차 처리 (동시 요청 절대 안 함!)
    const results = [];
    for (const cctv of activeCctvList) {
        const result = await fetchSensorData(cctv);
        results.push(result);

        // 다음 센서 전 2초 대기 (센서 회복 시간)
        if (activeCctvList.indexOf(cctv) < activeCctvList.length - 1) {
            await sleep(2000);
        }
    }

    const onlineCnt = results.filter(r => r.status === 'online').length;
    log('POLL', `완료: ${onlineCnt}/${results.length}대 온라인`);

    // 1. RAW INSERT (항상)
    await insertRawData(results);

    // 2. STAT INSERT (정시만)
    if (isHourly) {
        await insertStatisticsData(results);
    }

    // 3. 실시간 DB 갱신 (폴링 결과 재활용 → 추가 센서 접근 없음!)
    await updateRealtimeData(results);
}

function scheduleNextPoll() {
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

    const p = n => String(n).padStart(2, '0');
    log('POLL', `다음: ${p(next.getHours())}:${p(next.getMinutes())} (${Math.round(delay / 1000)}초 후)${isHourly ? ' [STAT 포함]' : ''}`);

    setTimeout(() => {
        executeScheduledPoll(isHourly)
            .catch(err => logErr('POLL', `실행 에러: ${err.message}`))
            .finally(() => scheduleNextPoll());
    }, delay);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  CCTV Sensor Node v3.0 (Schedule Only)');
    console.log('═══════════════════════════════════════════');
    console.log(`  수집 방식    : 10분 정각 1회 폴링 (센서 과부하 방지)`);
    console.log(`  정시 통계    : 매시 정각 (00분)`);
    console.log(`  실시간 갱신  : 폴링 결과 DB 동시 반영 (추가 쿼리 없음)`);
    console.log(`  503 재시도   : ${CONFIG.maxRetries}회 × ${CONFIG.retryDelay / 1000}초`);
    console.log(`  요청 타임아웃: ${CONFIG.requestTimeout / 1000}초`);
    console.log(`  목록 갱신    : ${CONFIG.listRefreshInterval / 1000}초 간격`);
    console.log('');

    // 1. DB 연결
    initDB();

    // 2. CCTV 목록 로드
    await refreshCctvList();

    // 3. 즉시 1회 폴링 (시작 직후 데이터 확보)
    log('MAIN', '초기 폴링 시작...');
    await executeScheduledPoll(false);

    // 4. 정각 스케줄러 시작
    scheduleNextPoll();

    // 5. 주기적 CCTV 목록 갱신
    setInterval(refreshCctvList, CONFIG.listRefreshInterval);

    log('MAIN', '✅ 서비스 가동 중...\n');
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[MAIN] 종료 중...');
    if (pool) await pool.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL]', err.message);
});

main().catch(err => {
    console.error('[FATAL] 시작 실패:', err.message);
    process.exit(1);
});
