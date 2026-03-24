/**
 * LED 전광판 통신 컨트롤러
 * 
 * 기능:
 * 1. 광고 스케줄(TCM_VENDOR_SCH)에 따라 현재 시간대의 콘텐츠 목록을 조회
 * 2. 콘텐츠 파일(TCM_CONTENTS_FILE)을 LED 전광판에 HTTP URL 기반으로 송출
 * 3. CCTV 성별 카운트(TCM_CCTV)에 따라 실시간 콘텐츠 전환
 *    - 남성 체류 > 여성 → GENDER='M' 파일만
 *    - 여성 체류 > 남성 → GENDER='F' 파일만
 *    - 동일 또는 0 → 전체 순차 재생
 * 4. 장비(TCM_DEVICEINFO)의 CONNECT_INFO로 LED 전광판 TCP 연결
 * 
 * 실행: node led_controller.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2');

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || '114.108.180.228',
    user: process.env.DB_USER || 'blueeye',
    password: process.env.DB_PASS || 'blueeye0037!',
    database: process.env.DB_NAME || 'joot_cms',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
};

const CORP_CD = '25001';
// 파일 서빙 경로 (로컬 테스트)
const FILE_BASE_PATH = process.env.FILE_PATH || 'D:\\PROJECT\\안티그래비티\\대연시스템 - 테스트 파일 경로';
// const FILE_BASE_PATH = 'D:\\dayon_file'; // 운영 환경

const FILE_SERVER_PORT = parseInt(process.env.FILE_SERVER_PORT || '9090', 10);
const SCHEDULE_POLL_INTERVAL = 60000;   // 1분마다 스케줄 체크
const GENDER_POLL_INTERVAL = 10000;     // 10초마다 성별 체크
const PROGRAM_GUID = 'program-0';

// ─────────────────────────────────────────────────────────────
// Database Pool
// ─────────────────────────────────────────────────────────────
const db = mysql.createPool(DB_CONFIG);

function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function log(tag, msg) {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log(`[${now}] [${tag}] ${msg}`);
}

function logError(tag, msg) {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.error(`[${now}] [${tag}] ❌ ${msg}`);
}

const LOCAL_IP = process.env.FILE_SERVER_HOST || getLocalIp();

// ─────────────────────────────────────────────────────────────
// File Server (Express static serving for LED HTTP download)
// ─────────────────────────────────────────────────────────────
function startFileServer() {
    const app = express();
    
    // 요청 로깅 추가 (LED가 실제 접속하는지 확인용)
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            log('FILE-SRV', `${req.method} ${req.url} - ${res.statusCode} (${duration}ms) from ${req.ip}`);
        });
        next();
    });

    app.use('/files', express.static(FILE_BASE_PATH));
    
    app.listen(FILE_SERVER_PORT, () => {
        log('FILE', `파일 서버 시작 → http://${LOCAL_IP}:${FILE_SERVER_PORT}/files/`);
        log('FILE', `서빙 경로: ${FILE_BASE_PATH}`);
    });
}

// ─────────────────────────────────────────────────────────────
// Huidu LED Client (SDK 3.0 Protocol) - 최적화 이식
// ─────────────────────────────────────────────────────────────
const LOCAL_TCP_VERSION = 0x1000007;
const CMD = {
    HEARTBEAT_ASK: 0x005f,
    HEARTBEAT_ANSWER: 0x0060,
    SDK_SERVICE_ASK: 0x2001,
    SDK_SERVICE_ANSWER: 0x2002,
    ERROR_ANSWER: 0x2000,
    SDK_CMD_ASK: 0x2003,
    SDK_CMD_ANSWER: 0x2004,
};

class HuiduLedClient {
    constructor(ip, port, name) {
        this.ip = ip;
        this.port = port;
        this.name = name || `${ip}:${port}`;
        this.socket = null;
        this.guid = null;
        this.connected = false;
        this.sdkReady = false;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.recvBuffer = Buffer.alloc(0);
        this._resolveVersion = null;
        this._resolveGuid = null;
        this._resolveSdkCmd = null;
        this._resolveSdkQuery = null;
        this._currentProgramHash = null; // 동일 프로그램 재전송 방지
        this._isDownloading = false;     // LED가 파일 다운로드 중인지
    }

    _getAttr(xml, attr) {
        const regex = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`);
        const match = xml.match(regex);
        return match ? match[1] : null;
    }

    // ── Public API ──────────────────────────────────────────

    start() {
        log('LED', `[${this.name}] 연결 시작...`);
        this._connect();
    }

    stop() {
        this._stopHeartbeat();
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.socket) { this.socket.removeAllListeners(); this.socket.destroy(); this.socket = null; }
        this.connected = false;
        this.sdkReady = false;
    }

    isReady() {
        return this.connected && this.sdkReady;
    }

    /**
     * 비디오 프로그램 전송 (콘텐츠 목록 업데이트)
     * @param {Array} videoList - [{name, url, size, md5, duration}]
     * @param {number} screenWidth
     * @param {number} screenHeight
     */
    async sendVideoProgram(videoList, screenWidth = 256, screenHeight = 256) {
        if (!this.sdkReady) {
            log('LED', `[${this.name}] SDK 미준비, 프로그램 전송 스킵`);
            return false;
        }

        // LED가 파일 다운로드 중이면 방해하지 않음
        if (this._isDownloading) {
            log('LED', `[${this.name}] 파일 다운로드 진행 중, 전송 스킵`);
            return true;
        }

        // 동일 프로그램 재전송 방지
        const hash = crypto.createHash('md5')
            .update(JSON.stringify(videoList.map(v => v.url)))
            .digest('hex');
        
        if (hash === this._currentProgramHash) {
            return true; // 이미 같은 프로그램 전송됨
        }

        try {
            let videoTags = '';
            if (videoList.length > 0) {
                videoTags = videoList.map((vid, idx) => 
                    `<video guid="video-${idx}" aspectRatio="false"><file name="${vid.url}" size="${vid.size}" md5="${vid.md5}"/><playParams duration="${vid.duration || 20000}"/></video>`
                ).join('');
            }

            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="AddProgram"><screen timeStamps="${Date.now()}"><program guid="${PROGRAM_GUID}" type="normal"><playControl count="1" disabled="false"/><area guid="area-video" alpha="255"><rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/><resources>${videoTags}</resources></area></program></screen></in></sdk>`;

            const result = await this._sendSdkCommand(xml);
            if (result === 'kDownloadingFile') {
                log('LED', `[${this.name}] 📥 LED 파일 다운로드 시작 (${videoList.length}개 영상)`);
                this._isDownloading = true;
                this._currentProgramHash = hash;
            } else {
                this._currentProgramHash = hash;
                log('LED', `[${this.name}] ✅ AddProgram 전송 완료 (${videoList.length}개 영상)`);
            }
            return true;
        } catch (err) {
            logError('LED', `[${this.name}] AddProgram 실패: ${err.message}`);
            return false;
        }
    }

    /** 프로그램 해시 초기화 (강제 재전송 필요 시) */
    resetProgramHash() {
        this._currentProgramHash = null;
    }

    // ── Connection Flow ─────────────────────────────────────

    _connect() {
        if (this.socket) { this.socket.removeAllListeners(); this.socket.destroy(); }

        this.socket = new net.Socket();
        this.connected = false;
        this.sdkReady = false;
        this.recvBuffer = Buffer.alloc(0);
        this._currentProgramHash = null;

        this.socket.connect(this.port, this.ip, async () => {
            log('LED', `[${this.name}] TCP 연결 완료`);
            this.connected = true;

            try {
                await this._negotiateVersion();
                log('LED', `[${this.name}] 버전 협상 성공`);
                await this._exchangeGuid();
                log('LED', `[${this.name}] GUID 획득: ${this.guid}`);
                this._startHeartbeat();
                this.sdkReady = true;
                log('LED', `[${this.name}] ✅ SDK 준비 완료`);
            } catch (err) {
                logError('LED', `[${this.name}] SDK 초기화 실패: ${err.message}`);
                this._scheduleReconnect();
            }
        });

        this.socket.on('data', (chunk) => {
            this.recvBuffer = Buffer.concat([this.recvBuffer, chunk]);
            this._processRecvBuffer();
        });

        this.socket.on('error', (err) => {
            logError('LED', `[${this.name}] 소켓 에러: ${err.message}`);
        });

        this.socket.on('close', () => {
            log('LED', `[${this.name}] 연결 종료`);
            this.connected = false;
            this.sdkReady = false;
            this._stopHeartbeat();
            this._scheduleReconnect();
        });
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) return;
        log('LED', `[${this.name}] 10초 후 재연결 시도...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this._connect();
        }, 10000);
    }

    // ── Version Negotiation ─────────────────────────────────

    _negotiateVersion() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('버전 협상 타임아웃')), 5000);
            this._resolveVersion = (err) => {
                clearTimeout(timeout);
                this._resolveVersion = null;
                if (err) reject(err); else resolve();
            };
            const packet = Buffer.alloc(8);
            packet.writeUInt16LE(8, 0);
            packet.writeUInt16LE(CMD.SDK_SERVICE_ASK, 2);
            packet.writeUInt32LE(LOCAL_TCP_VERSION, 4);
            this.socket.write(packet);
        });
    }

    // ── GUID Exchange ────────────────────────────────────────

    _exchangeGuid() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('GUID 교환 타임아웃')), 5000);
            this._resolveGuid = (err, guid) => {
                clearTimeout(timeout);
                this._resolveGuid = null;
                if (err) reject(err);
                else { this.guid = guid; resolve(); }
            };
            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="##GUID"><in method="GetIFVersion"><version value="1000000"/></in></sdk>`;
            this._sendSdkPacket(xml);
        });
    }

    // ── Heartbeat ───────────────────────────────────────────

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.connected) return;
            const packet = Buffer.alloc(4);
            packet.writeUInt16LE(4, 0);
            packet.writeUInt16LE(CMD.HEARTBEAT_ASK, 2);
            try { this.socket.write(packet); } catch (e) { /* ignore */ }
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    // ── SDK Packet ──────────────────────────────────────────

    _sendSdkPacket(xmlString) {
        const xmlBuffer = Buffer.from(xmlString, 'utf-8');
        const xmlLen = xmlBuffer.length;
        const len = 2 + 4 + 4 + xmlLen;
        const packet = Buffer.alloc(2 + len);
        packet.writeUInt16LE(len + 2, 0);
        packet.writeUInt16LE(CMD.SDK_CMD_ASK, 2);
        packet.writeUInt32LE(xmlLen, 4);
        packet.writeUInt32LE(0, 8);
        xmlBuffer.copy(packet, 12);
        this.socket.write(packet);
    }

    _sendSdkCommand(xmlString) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SDK 명령 타임아웃')), 120000); // 2분 (파일 다운로드 시간 고려)
            this._resolveSdkCmd = (err, result) => {
                clearTimeout(timeout);
                this._resolveSdkCmd = null;
                if (err) reject(err); else resolve(result);
            };
            this._sendSdkPacket(xmlString);
        });
    }

    // ── Receive Buffer Processing ───────────────────────────

    _processRecvBuffer() {
        while (this.recvBuffer.length >= 4) {
            const len = this.recvBuffer.readUInt16LE(0);
            if (this.recvBuffer.length < len) break;
            const cmd = this.recvBuffer.readUInt16LE(2);
            const data = this.recvBuffer.slice(4, len);
            this.recvBuffer = this.recvBuffer.slice(len);
            this._handlePacket(cmd, data);
        }
    }

    _handlePacket(cmd, data) {
        switch (cmd) {
            case CMD.SDK_SERVICE_ANSWER: {
                if (this._resolveVersion) {
                    if (data.length >= 4) this._resolveVersion(null);
                    else this._resolveVersion(new Error('잘못된 버전 응답'));
                }
                break;
            }
            case CMD.ERROR_ANSWER: {
                const code = data.length >= 2 ? data.readUInt16LE(0) : -1;
                logError('LED', `에러 코드: ${code}`);
                if (this._resolveVersion) this._resolveVersion(new Error(`에러: ${code}`));
                if (this._resolveGuid) this._resolveGuid(new Error(`에러: ${code}`));
                if (this._resolveSdkCmd) this._resolveSdkCmd(new Error(`에러: ${code}`));
                break;
            }
            case CMD.SDK_CMD_ANSWER: {
                if (data.length >= 8) {
                    const xmlData = data.slice(8).toString('utf-8');
                    if (this._resolveGuid) {
                        const guidMatch = xmlData.match(/guid="([^"]+)"/);
                        if (guidMatch && guidMatch[1]) this._resolveGuid(null, guidMatch[1]);
                        else this._resolveGuid(new Error('GUID 파싱 실패'));
                    } else if (this._resolveSdkCmd) {
                        const resultMatch = xmlData.match(/result="([^"]+)"/);
                        const result = resultMatch ? resultMatch[1] : 'unknown';
                        if (result === 'kSuccess') {
                            this._isDownloading = false;
                            this._resolveSdkCmd(null, result);
                        } else if (result === 'kDownloadingFile') {
                            // LED가 파일 다운로드 중 → 성공으로 처리 (다운로드 완료 대기)
                            this._resolveSdkCmd(null, 'kDownloadingFile');
                        } else if (result === 'kDownloadFileFailed') {
                            // 다운로드 실패 → 해시 초기화하여 다음 폴링 시 재시도
                            this._isDownloading = false;
                            this._currentProgramHash = null;
                            this._resolveSdkCmd(new Error(`SDK 응답: ${result}`));
                        } else {
                            this._resolveSdkCmd(new Error(`SDK 응답: ${result}`));
                        }
                    }
                }
                break;
            }
            case CMD.HEARTBEAT_ANSWER: break;
            default: break;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Schedule Manager
// ─────────────────────────────────────────────────────────────

class ScheduleManager {
    constructor() {
        this._lastHour = -1;             // 마지막으로 조회한 시간
        this._currentContentsKey = null;  // 현재 활성 콘텐츠 키
        this._currentFileList = [];       // 현재 활성 파일 목록
    }

    /**
     * 특정 거래처(vendorCd)의 현재 시간대 콘텐츠 파일 목록을 조회
     * @returns {Array} [{FILE_KEY, FILE_NAME, FTP_FILENAME, FILE_SIZE, FILE_MD5, GENDER, PLAY_SEQ, DELAY_TIME}]
     */
    async getScheduledFiles(vendorCd) {
        const now = new Date();
        const currentHour = now.getHours();
        const dayOfWeek = now.getDay().toString(); // 0=일, 1=월, ...
        const today = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        const schColumn = `SCH_${String(currentHour).padStart(2, '0')}`;

        try {
            // 1. 해당 요일/거래처의 전체 스케줄 조회
            const scheduleRows = await dbQuery(`
                SELECT *
                FROM TCM_VENDOR_SCH
                WHERE CORP_CD = ? 
                  AND VENDOR_CD = ?
                  AND DAY_SEC = ?
                  AND USE_YN = 'Y'
                  AND ? BETWEEN START_DT AND END_DT
                ORDER BY REGISTDT DESC
                LIMIT 1
            `, [CORP_CD, vendorCd, dayOfWeek, today]);

            if (scheduleRows.length === 0) {
                if (this._currentContentsKey !== null) {
                    log('SCHEDULE', `[${vendorCd}] 등록된 스케줄이 전혀 없음`);
                }
                this._currentContentsKey = null;
                this._currentFileList = [];
                return [];
            }

            const row = scheduleRows[0];
            let contentsKey = row[schColumn];
            let targetHour = currentHour;

            // 현재 시간이 비어있으면 가장 가까운 시간대 찾기
            if (!contentsKey || contentsKey === '') {
                let minDistance = 25;
                for (let h = 0; h < 24; h++) {
                    const hCol = `SCH_${String(h).padStart(2, '0')}`;
                    if (row[hCol] && row[hCol] !== '') {
                        const dist = Math.abs(h - currentHour);
                        if (dist < minDistance) {
                            minDistance = dist;
                            targetHour = h;
                            contentsKey = row[hCol];
                        }
                    }
                }
                
                if (contentsKey) {
                    log('SCHEDULE', `[${vendorCd}] ${currentHour}시 비어있음 → 가장 가까운 ${targetHour}시 스케줄로 대체`);
                }
            }

            if (!contentsKey) {
                this._currentContentsKey = null;
                this._currentFileList = [];
                return [];
            }

            // 시간이 바뀌거나 콘텐츠가 변경된 경우에만 파일 목록 갱신
            if (currentHour === this._lastHour && contentsKey === this._currentContentsKey) {
                return this._currentFileList;
            }

            // 2. CONTENTS_KEY → TCM_CONTENTS_LIST → TCM_CONTENTS_FILE 체인 조회
            const fileRows = await dbQuery(`
                SELECT 
                    F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                    F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                    F.SCREEN_WIDTH, F.SCREEN_HEIGHT,
                    L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME,
                    L.USE_YN
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ?
                  AND L.CONTENTS_KEY = ?
                  AND L.USE_YN = 'Y'
                  AND F.USE_YN = 'Y'
                ORDER BY L.DISP_SEQ ASC
            `, [CORP_CD, contentsKey]);

            this._lastHour = currentHour;
            this._currentContentsKey = contentsKey;
            this._currentFileList = fileRows;

            log('SCHEDULE', `[${vendorCd}] ${currentHour}시 콘텐츠(${contentsKey}) → ${fileRows.length}개 파일 로드`);
            fileRows.forEach((f, i) => {
                log('SCHEDULE', `  ${i + 1}. ${f.FILE_NAME} (${f.GENDER || '무관'}) ${Math.round((f.FILE_SIZE || 0) / 1024)}KB`);
            });

            return fileRows;
        } catch (err) {
            logError('SCHEDULE', `스케줄 조회 실패: ${err.message}`);
            return this._currentFileList; // 실패 시 기존 목록 유지
        }
    }

    /** 강제로 다음 폴링 시 재조회하도록 초기화 */
    invalidate() {
        this._lastHour = -1;
        this._currentContentsKey = null;
    }
}

// ─────────────────────────────────────────────────────────────
// Gender Filter
// ─────────────────────────────────────────────────────────────

class GenderFilter {
    constructor() {
        this._lastGenderState = null; // 'M' | 'F' | 'ALL'
    }

    /**
     * CCTV 성별 데이터를 조회하여 현재 성별 상태를 반환
     * @param {string} vendorCd 거래처 코드
     * @returns {{ state: 'M'|'F'|'ALL', maleStay: number, femaleStay: number, changed: boolean }}
     */
    async checkGender(vendorCd) {
        try {
            const rows = await dbQuery(`
                SELECT 
                    IFNULL(SUM(NOW_MALE_IN), 0) - IFNULL(SUM(NOW_MALE_OUT), 0) AS maleStay,
                    IFNULL(SUM(NOW_FEMALE_IN), 0) - IFNULL(SUM(NOW_FEMALE_OUT), 0) AS femaleStay
                FROM TCM_CCTV
                WHERE CORP_CD = ? AND USE_YN = 'Y' AND USE_VENDOR = ?
            `, [CORP_CD, vendorCd]);

            const maleStay = Math.max(0, rows[0]?.maleStay || 0);
            const femaleStay = Math.max(0, rows[0]?.femaleStay || 0);

            let state;
            if (maleStay === 0 && femaleStay === 0) {
                state = 'ALL';
            } else if (maleStay > femaleStay) {
                state = 'M';
            } else if (femaleStay > maleStay) {
                state = 'F';
            } else {
                state = 'ALL';
            }

            const changed = (state !== this._lastGenderState);
            if (changed && this._lastGenderState !== null) {
                log('GENDER', `성별 상태 변경: ${this._lastGenderState} → ${state} (남:${maleStay} 여:${femaleStay})`);
            }
            this._lastGenderState = state;

            return { state, maleStay, femaleStay, changed };
        } catch (err) {
            logError('GENDER', `성별 조회 실패: ${err.message}`);
            return { state: this._lastGenderState || 'ALL', maleStay: 0, femaleStay: 0, changed: false };
        }
    }

    /**
     * 성별 상태에 따라 파일 목록 필터링
     * @param {Array} files 전체 파일 목록
     * @param {'M'|'F'|'ALL'} genderState 성별 상태
     * @returns {Array} 필터링된 파일 목록
     */
    filterFiles(files, genderState) {
        if (genderState === 'ALL' || !genderState) {
            return files; // 전체 순차 재생
        }

        const filtered = files.filter(f => f.GENDER === genderState);
        
        // 해당 성별 파일이 없으면 전체 재생 (fallback)
        if (filtered.length === 0) {
            log('GENDER', `${genderState === 'M' ? '남성' : '여성'} 전용 파일 없음 → 전체 재생으로 폴백`);
            return files;
        }

        return filtered;
    }
}

// ─────────────────────────────────────────────────────────────
// Main Controller
// ─────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  LED 전광판 통신 컨트롤러 v1.0');
    console.log('  CMS 광고 스케줄 기반 콘텐츠 송출 + CCTV 성별 필터링');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();

    // 1. 파일 서버 시작
    startFileServer();

    // 2. DB에서 대상 거래처 + 장비(CONNECT_INFO) 조회
    log('INIT', 'DB 연결 및 장비 조회 중...');

    let targetVendors;
    try {
        // CONNECT_INFO가 등록된 장비를 보유한 거래처 조회
        targetVendors = await dbQuery(`
            SELECT DISTINCT
                D.USE_VENDOR AS VENDOR_CD,
                V.VENDOR_NM,
                D.DEVICE_ID,
                D.CONNECT_INFO
            FROM TCM_DEVICEINFO D
            JOIN TCM_VENDOR V ON D.CORP_CD = V.CORP_CD AND D.USE_VENDOR = V.VENDOR_CD
            WHERE D.CORP_CD = ?
              AND D.USE_YN = 'Y'
              AND D.CONNECT_INFO IS NOT NULL
              AND D.CONNECT_INFO != ''
            ORDER BY V.VENDOR_NM
        `, [CORP_CD]);
    } catch (err) {
        logError('INIT', `장비 조회 실패: ${err.message}`);
        process.exit(1);
    }

    if (targetVendors.length === 0) {
        logError('INIT', 'CONNECT_INFO가 등록된 장비가 없습니다. 장비관리에서 연결정보를 등록해주세요.');
        process.exit(1);
    }

    log('INIT', `대상 거래처 ${targetVendors.length}개 발견:`);
    targetVendors.forEach(v => {
        log('INIT', `  📌 ${v.VENDOR_NM} (${v.VENDOR_CD}) → 장비: ${v.DEVICE_ID} → LED: ${v.CONNECT_INFO}`);
    });
    console.log();

    // 3. 거래처별 LED 클라이언트 + 스케줄 매니저 + 성별 필터 생성
    const controllers = targetVendors.map(vendor => {
        // CONNECT_INFO 파싱 (http://host:port 또는 host:port 형식 모두 지원)
        let ledIp, ledPort;
        try {
            if (vendor.CONNECT_INFO.startsWith('http://') || vendor.CONNECT_INFO.startsWith('https://')) {
                const url = new URL(vendor.CONNECT_INFO);
                ledIp = url.hostname;
                ledPort = parseInt(url.port || '10001', 10);
            } else {
                const parts = vendor.CONNECT_INFO.split(':');
                ledIp = parts[0];
                ledPort = parseInt(parts[1] || '10001', 10);
            }
        } catch (e) {
            logError('INIT', `[${vendor.VENDOR_NM}] CONNECT_INFO 파싱 실패: ${vendor.CONNECT_INFO}`);
            ledIp = vendor.CONNECT_INFO;
            ledPort = 10001;
        }
        log('INIT', `  → LED 연결 대상: ${ledIp}:${ledPort}`);

        const ledClient = new HuiduLedClient(ledIp, ledPort, vendor.VENDOR_NM);
        const scheduler = new ScheduleManager();
        const genderFilter = new GenderFilter();

        return {
            vendorCd: vendor.VENDOR_CD,
            vendorNm: vendor.VENDOR_NM,
            deviceId: vendor.DEVICE_ID,
            connectInfo: vendor.CONNECT_INFO,
            ledClient,
            scheduler,
            genderFilter,
            
            // 재생 제어 상태
            cycleCount: 0,           // 누적 재생 횟수
            playbackMode: 'ALL',      // 'ALL' (전체) <-> 'GENDER' (성별 전용)
            nextCycleTime: 0,        // 다음 교체 가능 시간 (timestamp)
            lastSentHash: null       // 마지막 전송 콘텐트 해시
        };
    });

    // 4. 모든 LED 클라이언트 연결 시작
    controllers.forEach(c => c.ledClient.start());

    // 5. 파일을 비디오 URL 목록으로 변환 (비동기 처리로 블로킹 방지)
    const fileMetaCache = {}; // { filename: { size, md5, mtime } }

    async function getFileMeta(filename, filePath) {
        try {
            const stats = fs.statSync(filePath);
            const mtime = stats.mtime.getTime();

            // 캐시 확인
            if (fileMetaCache[filename] && fileMetaCache[filename].mtime === mtime) {
                return fileMetaCache[filename];
            }

            log('FILE', `  [${filename}] MD5 계산 시작... (크기: ${Math.round(stats.size/1024/1024)}MB)`);
            
            // 비동기 스트림 방식으로 MD5 계산 (대용량 파일 대응)
            const md5 = await new Promise((resolve, reject) => {
                const hash = crypto.createHash('md5');
                const stream = fs.createReadStream(filePath);
                stream.on('data', data => hash.update(data));
                stream.on('error', reject);
                stream.on('end', () => resolve(hash.digest('hex')));
            });

            const meta = { size: stats.size, md5: md5, mtime: mtime };
            fileMetaCache[filename] = meta;
            log('FILE', `  [${filename}] MD5 계산 완료: ${md5.substring(0, 8)}...`);
            return meta;
        } catch (err) {
            logError('FILE', `  ❌ [${filename}] 메타데이터 획득 실패: ${err.message}`);
            return null;
        }
    }

    async function filesToVideoList(files) {
        const videoList = [];
        for (const f of files) {
            const filename = f.FTP_FILENAME || f.FILE_NAME;
            const filePath = path.join(FILE_BASE_PATH, filename);
            const url = `http://${LOCAL_IP}:${FILE_SERVER_PORT}/files/${encodeURIComponent(filename)}`;

            const meta = await getFileMeta(filename, filePath);
            if (!meta) continue;

            videoList.push({
                name: filename,
                url,
                size: meta.size,
                md5: meta.md5,
                duration: (f.DELAY_TIME || 20) * 1000 // 초 → 밀리초
            });
        }
        return videoList;
    }

    // 6. 개별 컨트롤러 업데이트 함수 (3분 주기로 교대 재생)
    const CYCLE_STEP_MS = 3 * 60 * 1000; // 3분 고정

    async function updateController(ctrl, forceUpdate = false) {
        if (!ctrl.ledClient.isReady()) return;

        const now = Date.now();
        
        // 1. 아직 현재 주기가 끝나지 않았으면 스킵
        if (!forceUpdate && now < ctrl.nextCycleTime) {
            return;
        }

        try {
            // [상태 전환] 3분이 지났으므로 모드 교체
            if (!forceUpdate && ctrl.nextCycleTime > 0) {
                const oldMode = ctrl.playbackMode;
                ctrl.playbackMode = (oldMode === 'ALL') ? 'GENDER' : 'ALL';
                log('CTRL', `[${ctrl.vendorNm}] 3분 주기 종료 → 모드 전환: ${oldMode} → ${ctrl.playbackMode}`);
            }

            // 2. 현재 시간대(또는 가까운 시간대) 스케줄 확보
            const allFiles = await ctrl.scheduler.getScheduledFiles(ctrl.vendorCd);
            if (allFiles.length === 0) {
                log('WARN', `[${ctrl.vendorNm}] 재생할 스케줄이 없습니다. (10초 후 재시도)`);
                ctrl.nextCycleTime = now + 10000;
                return;
            }

            // 3. 모드에 따른 필터링 적용
            let filteredFiles = allFiles;
            let currentTargetGender = 'ALL';

            if (ctrl.playbackMode === 'GENDER') {
                const gender = await ctrl.genderFilter.checkGender(ctrl.vendorCd);
                if (gender.state !== 'ALL') {
                    filteredFiles = ctrl.genderFilter.filterFiles(allFiles, gender.state);
                    currentTargetGender = gender.state;
                } else {
                    // 성별 우위가 없으면 그냥 전체 재생(ALL) 유지
                    ctrl.playbackMode = 'ALL';
                }
            }

            // 4. 비디오 목록 생성
            const videoList = await filesToVideoList(filteredFiles);
            if (videoList.length === 0) {
                log('WARN', `[${ctrl.vendorNm}] 재생할 영상이 없음 (10초 후 재시도)`);
                ctrl.nextCycleTime = now + 10000;
                return;
            }

            // 5. 변경 사항 확인 (모드 + 영상 목록 해시)
            const programHash = crypto.createHash('md5')
                .update(JSON.stringify(videoList.map(v => v.url)) + ctrl.playbackMode)
                .digest('hex');
            
            if (programHash === ctrl.lastSentHash && !forceUpdate) {
                // 변경 사항이 없더라도 타이머는 3분 뒤로 갱신
                ctrl.nextCycleTime = now + CYCLE_STEP_MS;
                return;
            }

            // 6. LED 전송 (여기서 딱 한 번만 명령이 나감)
            const modeDesc = (ctrl.playbackMode === 'GENDER') ? `성별타겟(${currentTargetGender})` : '전체재생';
            log('CTRL', `[${ctrl.vendorNm}] === ${modeDesc} 송출 시작 (파일: ${videoList.length}개, 3분간 유지) ===`);
            
            ctrl.nextCycleTime = now + CYCLE_STEP_MS;
            ctrl.lastSentHash = programHash;
            
            // LED 클라이언트 상태 초기화 후 전송
            ctrl.ledClient.resetProgramHash();
            const result = await ctrl.ledClient.sendVideoProgram(videoList);
            log('LED', `[${ctrl.vendorNm}] 전송 결과: ${result}`);

        } catch (err) {
            logError('CTRL', `[${ctrl.vendorNm}] 업데이트 에러: ${err.message}`);
            ctrl.nextCycleTime = now + 10000; 
        }
    }

    // 7. 폴링 통합 (10초마다 체크)
    log('MAIN', `통합 폴링 시작 (10초 간격 - 교대 재생 제어)`);
    let isPolling = false;
    setInterval(async () => {
        if (isPolling) return;
        isPolling = true;
        try {
            for (const ctrl of controllers) {
                await updateController(ctrl);
            }
        } finally {
            isPolling = false;
        }
    }, GENDER_POLL_INTERVAL);

    // 9. 초기 실행 (5초 후, LED 연결 대기)
    setTimeout(async () => {
        log('MAIN', '초기 콘텐츠 로드 시작...');
        for (const ctrl of controllers) {
            await updateController(ctrl);
        }
    }, 5000);

    // 10. Graceful shutdown
    process.on('SIGINT', () => {
        log('MAIN', '종료 중...');
        controllers.forEach(c => c.ledClient.stop());
        db.end();
        process.exit(0);
    });

    log('MAIN', '✅ LED 컨트롤러 가동 완료');
    console.log();
}

// 실행
main().catch(err => {
    logError('FATAL', err.message);
    process.exit(1);
});
