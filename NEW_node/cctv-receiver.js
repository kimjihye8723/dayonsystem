/**
 * CCTV Sensor Data Receiver v5.0 (Direct Insert)
 * 
 * [동작 구조]
 * 1. 실시간 푸시 수신:
 *    - 센서(TD2000 G3)가 POST로 보내는 JSON 데이터를 수신 (카메라 설정에서 1시간 단위로 전송하게끔 세팅되어 있음)
 *    - 데이터의 HostName을 기준으로 TCM_CCTV 테이블에서 CONNECT_INFO를 조회
 *    - 수신 즉시 TCM_CCTV_STATISTICS 테이블에 INSERT 처리
 * 
 * 2. 스케줄러 및 메모리 누적기 제거:
 *    - 센서 자체가 1시간 단위로 집계된 값을 보내주므로 서버에서 별도로 누적/스케줄링할 필요 없이 값 그대로 DB에 적재
 */

const express = require('express');
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

let pool = null;

// 특정 단말기 1시간 단위 누적용 메모리 (시리얼번호: 202525040349)
const TARGET_DEVICE_SN = '202525040349';
let accumulatedData = {
    active: false,
    timer: null,
    maleIn: 0, maleOut: 0, femaleIn: 0, femaleOut: 0, totalIn: 0, totalOut: 0,
    hostName: '', connectInfo: ''
};

app.use(express.json());

function log(tag, msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.log(`[${t}] [${tag}] ${msg}`);
}

/** 센서 푸시 데이터 파싱 */
function parsePushData(body) {
    if (!body || !body.Metrics) return null;
    const metrics = body.Metrics;

    let hostName = "";
    let deviceSn = "";
    if (metrics.Properties) {
        hostName = metrics.Properties.HostName || "";
        deviceSn = metrics.Properties.SerialNumber || "";
    }
    if (!deviceSn) return null;

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

    return { totalIn, totalOut, maleIn, maleOut, femaleIn, femaleOut, hostName, deviceSn };
}

// ─────────────────────────────────────────────────────────────
//  1. 센서 데이터 수신 시간 즉시 DB Insert 로직
// ─────────────────────────────────────────────────────────────

app.post('/', async (req, res) => {
    // 응답은 센서 쪽 병목 없도록 최대한 빠르게 리턴
    res.status(200).json({ Status: "Success" });

    const pushData = parsePushData(req.body);
    if (!pushData) return;

    const { hostName, deviceSn, totalIn, totalOut, maleIn, maleOut, femaleIn, femaleOut } = pushData;

    try {
        if (!pool) pool = mysql.createPool(dbConfig);

        // 1. 해당 DEVICE_SN의 CONNECT_INFO 알아내기
        const [rows] = await pool.query('SELECT CONNECT_INFO FROM TCM_CCTV WHERE DEVICE_SN = ? AND USE_YN = "Y"', [deviceSn]);
        if (rows.length === 0) {
            log('WARN', `DB에 등록되지 않았거나 사용중지된 Device SN: [${deviceSn}] - 수신된 데이터 무시됨`);
            return;
        }

        const connectInfo = rows[0].CONNECT_INFO || '';

        // 2. 특정 단말기인지 검사 (30초마다 오는 데이터를 1시간 동안 누적 후 저장)
        if (deviceSn === TARGET_DEVICE_SN) {
            accumulatedData.maleIn += maleIn;
            accumulatedData.maleOut += maleOut;
            accumulatedData.femaleIn += femaleIn;
            accumulatedData.femaleOut += femaleOut;
            accumulatedData.totalIn += totalIn;
            accumulatedData.totalOut += totalOut;
            
            // 타이머가 작동 중이지 않다면 최초 데이터 수신 시 1시간 타이머 시작
            if (!accumulatedData.active) {
                accumulatedData.active = true;
                accumulatedData.hostName = hostName;
                accumulatedData.connectInfo = connectInfo;
                
                log('INFO', `[${TARGET_DEVICE_SN}] 타겟 단말기 데이터 수신 시작. 1시간 누적 타이머 작동됨.`);
                
                // 1시간(3600000ms) 후 DB에 저장 및 초기화
                accumulatedData.timer = setTimeout(async () => {
                    const insertSql = `
                        INSERT INTO TCM_CCTV_STATISTICS 
                        (CONNECT_INFO, HOSTNAME, DEVICE_SN, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) 
                        VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
                    `;
                    try {
                        await pool.query(insertSql, [
                            accumulatedData.connectInfo, accumulatedData.hostName, TARGET_DEVICE_SN,
                            accumulatedData.maleIn, accumulatedData.maleOut, accumulatedData.femaleIn, accumulatedData.femaleOut, accumulatedData.totalIn, accumulatedData.totalOut
                        ]);
                        log('STAT', `✓ [1시간 누적완료] ${accumulatedData.hostName} [${TARGET_DEVICE_SN}] DB 저장 완료 (누적 총입:${accumulatedData.totalIn} 총출:${accumulatedData.totalOut})`);
                    } catch (err) {
                        log('ERROR', `[${TARGET_DEVICE_SN}] 1시간 누적치 DB INSERT 실패: ${err.message}`);
                    } finally {
                        // 메모리 초기화
                        accumulatedData.active = false;
                        accumulatedData.timer = null;
                        accumulatedData.maleIn = 0; accumulatedData.maleOut = 0;
                        accumulatedData.femaleIn = 0; accumulatedData.femaleOut = 0;
                        accumulatedData.totalIn = 0; accumulatedData.totalOut = 0;
                    }
                }, 60 * 60 * 1000); // 1시간 (60 * 60 * 1000)
            }
            // 누적 상황 로깅
            log('DEBUG', `[${TARGET_DEVICE_SN}] 카운팅 누적중... 현재합계 (입:${accumulatedData.totalIn} 출:${accumulatedData.totalOut})`);
            return;
        }

        // 3. 다른 단말기들은 수신 즉시 STATISTICS에 INSERT (기존 로직 유지)
        const sql = `
            INSERT INTO TCM_CCTV_STATISTICS 
            (CONNECT_INFO, HOSTNAME, DEVICE_SN, INSERT_DT, MALE_IN, MALE_OUT, FEMALE_IN, FEMALE_OUT, TOTAL_IN, TOTAL_OUT) 
            VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
        `;
        
        await pool.query(sql, [
            connectInfo, hostName, deviceSn,
            maleIn, maleOut, femaleIn, femaleOut, totalIn, totalOut
        ]);

        log('STAT', `✓ ${hostName} [${deviceSn}] 데이터 수신 및 DB 즉시 저장 완료 (총입:${totalIn} 총출:${totalOut})`);

    } catch (err) {
        log('ERROR', `${hostName} 통계 실시간 INSERT 실패: ${err.message}`);
    }
});

app.get('/', (req, res) => res.send('CCTV Receiver v5.0 Active.'));

app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════');
    console.log('  CCTV Data Receiver v5.0 (Direct Insert)');
    console.log('═══════════════════════════════════════════');
    console.log('  동작 방식: 외부 센서(1시간 주기 단위)에서 데이터를 PUSH로 보내면');
    console.log('             메모리 및 타이머 스케줄링 없이 즉시 TCM_CCTV_STATISTICS 에 저장합니다.');
    console.log('═══════════════════════════════════════════\n');
});
