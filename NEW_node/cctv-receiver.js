/**
 * CCTV Sensor Data Receiver v3.3 (Final)
 * 
 * [동작 구조]
 * 1. 실시간 (푸시 수신 시마다):
 *    - 센서가 보내는 증분값을 서버 메모리에 누적
 *    - TCM_CCTV 테이블의 NOW_ 칼럼에 누적 총합 업데이트
 *    - HostName 기준으로 DB 행 매칭
 *
 * 2. 10분마다 (서버 시계 기준):
 *    - 센서 API를 1회 호출하여 오늘의 정확한 누적 총합(by1day) 확보
 *    - TCM_CCTV_RAW 테이블에 INSERT
 *
 * 3. 매시 정각 (서버 시계 기준):
 *    - 센서 API를 1회 호출하여 오늘의 정확한 누적 총합(by1day) 확보
 *    - TCM_CCTV_STATISTICS 테이블에 INSERT
 */

const express = require('express');
const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = 2015;

// DB 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
};

// 센서 API 인증 정보
const CCTV_AUTH = {
    username: process.env.CCTV_USER || 'admin',
    password: process.env.CCTV_PASSWORD || 'Tectree6767!'
};

let pool = null;

// 센서별 누적 카운터 (메모리) - 자정에 리셋
const accumulators = {};

app.use(express.json());

function log(tag, msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.log(`[${t}] [${tag}] ${msg}`);
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

/** 센서 푸시 데이터에서 증분값 + HostName 추출 */
function parsePushData(body) {
    if (!body || !body.Metrics) return null;
    const metrics = body.Metrics;

    let hostName = "";
    if (metrics.Properties) hostName = metrics.Properties.HostName || "";
    if (!hostName) return null;

    let totalIn = 0, totalOut = 0;
    let maleIn = 0, maleOut = 0;
    let femaleIn = 0, femaleOut = 0;

    if (metrics.ReportData && metrics.ReportData.Report) {
        const report = metrics.ReportData.Report;
        const objects = Array.isArray(report.Object) ? report.Object : [report.Object];
        objects.forEach(obj => {
            if (obj.Count) {
                const counts = Array.isArray(obj.Count) ? obj.Count : [obj.Count];
                counts.forEach(c => {
                    totalIn += parseInt(c["@Enters"] || 0, 10);
                    totalOut += parseInt(c["@Exits"] || 0, 10);
                    femaleIn += parseInt(c["@EntersFemaleCustomer"] || 0, 10);
                    femaleOut += parseInt(c["@ExitsFemaleCustomer"] || 0, 10);
                    maleIn += parseInt(c["@EntersMaleCustomer"] || 0, 10);
                    maleOut += parseInt(c["@ExitsMaleCustomer"] || 0, 10);
                });
            }
        });
    }

    return { totalIn, totalOut, maleIn, maleOut, femaleIn, femaleOut, hostName };
}

/** API 응답 데이터 파서 (by1day 누적 총합) */
function parseApiData(body) {
    if (!body || !body.Data || !body.Data.Count) return null;

    let totalIn = 0, totalOut = 0;
    let maleIn = 0, maleOut = 0;
    let femaleIn = 0, femaleOut = 0;

    body.Data.Count.forEach(z => {
        totalIn += parseInt(z.Enters || 0, 10);
        totalOut += parseInt(z.Exits || 0, 10);
        femaleIn += parseInt(z.EntersFemaleCustomer || 0, 10);
        femaleOut += parseInt(z.ExitsFemaleCustomer || 0, 10);
        maleIn += parseInt(z.EntersMaleCustomer || 0, 10);
        maleOut += parseInt(z.ExitsMaleCustomer || 0, 10);
    });

    return { totalIn, totalOut, maleIn, maleOut, femaleIn, femaleOut };
}

// ─────────────────────────────────────────────────────────────
//  1. 실시간 푸시 수신 → 증분 누적 → TCM_CCTV 업데이트
// ─────────────────────────────────────────────────────────────

app.post('/', async (req, res) => {
    const pushData = parsePushData(req.body);
    if (!pushData) return res.status(200).json({ Status: "Success" });

    const { hostName } = pushData;
    const today = getToday();

    // 누적기 초기화 (자정 리셋 또는 첫 수신)
    if (!accumulators[hostName] || accumulators[hostName].lastDate !== today) {
        accumulators[hostName] = {
            totalIn: 0, totalOut: 0,
            maleIn: 0, maleOut: 0,
            femaleIn: 0, femaleOut: 0,
            lastDate: today
        };
        log('RESET', `${hostName} 누적 카운터 초기화 (${today})`);
    }

    // 증분값 누적
    const acc = accumulators[hostName];
    acc.totalIn += pushData.totalIn;
    acc.totalOut += pushData.totalOut;
    acc.maleIn += pushData.maleIn;
    acc.maleOut += pushData.maleOut;
    acc.femaleIn += pushData.femaleIn;
    acc.femaleOut += pushData.femaleOut;

    log('PUSH', `${hostName} 증분(+${pushData.totalIn}/+${pushData.totalOut}) → 누적(입:${acc.totalIn} 출:${acc.totalOut} 남:${acc.maleIn}/${acc.maleOut} 여:${acc.femaleIn}/${acc.femaleOut})`);

    try {
        if (!pool) pool = mysql.createPool(dbConfig);

        const sqlUpdate = `
            UPDATE TCM_CCTV 
            SET CONNECT_YN = 'Y', CONNECT_DT = NOW(), 
                NOW_MALE_IN = ?, NOW_MALE_OUT = ?, 
                NOW_FEMALE_IN = ?, NOW_FEMALE_OUT = ?, 
                NOW_TOTAL_IN = ?, NOW_TOTAL_OUT = ? 
            WHERE HOSTNAME = ?
        `;
        const [result] = await pool.query(sqlUpdate, [
            acc.maleIn, acc.maleOut, acc.femaleIn, acc.femaleOut,
            acc.totalIn, acc.totalOut, hostName
        ]);

        if (result.affectedRows === 0) {
            log('WARN', `DB에 등록되지 않은 HostName: ${hostName}`);
        }
    } catch (err) {
        log('ERROR', `DB 업데이트 실패: ${err.message}`);
    }

    res.status(200).json({ Status: "Success" });
});

// ─────────────────────────────────────────────────────────────
//  2. 서버 시계 기준 스케줄러 (10분/정각)
// ─────────────────────────────────────────────────────────────

/** 등록된 모든 센서에 대해 API 호출 후 테이블에 INSERT */
async function scheduledInsert(tableName) {
    if (!pool) pool = mysql.createPool(dbConfig);

    const [sensors] = await pool.query('SELECT HOSTNAME, CONNECT_INFO FROM TCM_CCTV WHERE USE_YN = "Y" AND HOSTNAME IS NOT NULL');

    // 로컬 시간 포맷터 (yyyy-mm-ddTHH:MM:SS)
    const formatLocalDT = (date) => {
        const p = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
    };

    for (const sensor of sensors) {
        const { HOSTNAME, CONNECT_INFO } = sensor;

        if (!CONNECT_INFO) {
            log('WARN', `${HOSTNAME}: CONNECT_INFO가 비어있음 → 스킵`);
            continue;
        }

        const now = new Date();
        const sod = new Date(now); sod.setHours(0, 0, 0, 0);
        const start = formatLocalDT(sod);
        const end = formatLocalDT(now);

        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                log('API', `${HOSTNAME}: API 호출 시도 (${attempt}/3) - ${start} ~ ${end}`);
                const response = await axios.get(`${CONNECT_INFO}/api/statistics/query`, {
                    params: { start, end, interval: 'by1day' },
                    auth: CCTV_AUTH,
                    timeout: 60000, // 60s (센서 응답 지연 대응)
                    headers: { 'Connection': 'close' }
                });

                const data = parseApiData(response.data);
                if (!data) {
                    log('WARN', `${HOSTNAME}: API 응답 데이터 없음`);
                    break; 
                }

                const sql = `INSERT INTO ${tableName} (CONNECT_INFO, HOSTNAME, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`;
                await pool.query(sql, [
                    CONNECT_INFO, HOSTNAME,
                    data.maleIn, data.maleOut, data.femaleIn, data.femaleOut, data.totalIn, data.totalOut
                ]);

                log('DB', `✓ ${tableName} 저장 완료 [${HOSTNAME}] (입:${data.totalIn} 출:${data.totalOut})`);

                // API 값으로 메모리 누적기 보정
                if (accumulators[HOSTNAME]) {
                    Object.assign(accumulators[HOSTNAME], data);
                }
                
                success = true;
                break; // 성공 시 시도 중단

            } catch (err) {
                const status = err.response ? err.response.status : err.message;
                log('ERROR', `${HOSTNAME}: 호출 실패 (${status})`);
                
                if (err.response && err.response.status === 503 && attempt < 3) {
                    log('RETRY', `${HOSTNAME}: 503 System Busy - 10초 후 재시도...`);
                    await new Promise(r => setTimeout(r, 10000));
                } else {
                    break; // 그 외 에러는 즉시 중단
                }
            }
        }

        // 다음 센서 호출 전 짧은 대기
        await new Promise(r => setTimeout(r, 2000));
    }
}

/** 스케줄러 시작 */
function startScheduler() {
    let lastExecutedKey = '';

    setInterval(async () => {
        const now = new Date();
        const minutes = now.getMinutes();
        const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minutes}`;

        if (key === lastExecutedKey) return;

        if (minutes === 0) {
            lastExecutedKey = key;
            log('SCHEDULE', '═══ 매시 정각 → TCM_CCTV_STATISTICS + TCM_CCTV_RAW 저장 ═══');
            await scheduledInsert('TCM_CCTV_STATISTICS');
            await new Promise(r => setTimeout(r, 3000));
            await scheduledInsert('TCM_CCTV_RAW');
        } else if (minutes % 10 === 0) {
            lastExecutedKey = key;
            log('SCHEDULE', `═══ ${minutes}분 → TCM_CCTV_RAW 저장 ═══`);
            await scheduledInsert('TCM_CCTV_RAW');
        }
    }, 5000);

    log('SCHEDULE', '스케줄러 시작: 10분마다 RAW, 매시 정각 STATISTICS 저장');
}

app.get('/', (req, res) => res.send('CCTV Receiver v3.3 Active.'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════');
    console.log('  CCTV Data Receiver v3.3 (Final)');
    console.log('═══════════════════════════════════════════');
    console.log('  실시간: 푸시 증분 누적 → TCM_CCTV');
    console.log('  10분:   서버시계 기준 API호출 → TCM_CCTV_RAW');
    console.log('  정각:   서버시계 기준 API호출 → TCM_CCTV_STATISTICS');
    console.log('═══════════════════════════════════════════\n');

    startScheduler();
});
