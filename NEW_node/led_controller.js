/**
 * LED 전광판 통신 컨트롤러 v2.0
 * 
 * 기능:
 * 1. 광고 스케줄(TCM_VENDOR_SCH)에 따라 현재 시간대의 콘텐츠 목록을 조회
 * 2. TCM_CONTENTS → TCM_CONTENTS_LIST → TCM_CONTENTS_FILE 체인으로 파일 정보 획득
 * 3. GENDER IS NULL인 파일만 재생 목록에 포함
 * 4. 프로그램 변경 시 기존 보드 파일 삭제(DeleteFiles SDK) 후 새 프로그램 송출
 * 5. 장비(TCM_DEVICEINFO)의 CONNECT_INFO로 LED 전광판 TCP 연결
 * 
 * [추후 구현 예정] CCTV 성별 카운트(TCM_CCTV) 기반 실시간 콘텐츠 전환
 *   - 남성 체류 > 여성 → GENDER='M' 파일만
 *   - 여성 체류 > 남성 → GENDER='F' 파일만
 *   - 동일 또는 0 → 전체 순차 재생
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
// 파일 서빙 경로 (운영 환경)
const FILE_BASE_PATH = process.env.FILE_PATH || 'D:\\dayon_file';

const FILE_SERVER_PORT = parseInt(process.env.FILE_SERVER_PORT || '9090', 10);
const SCHEDULE_POLL_INTERVAL = 60000;   // 1분마다 스케줄 체크
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

    // CORS (프론트엔드에서 직접 호출 허용)
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });

    app.use(express.json());

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
        log('FILE', `즉시 반영 API → http://${LOCAL_IP}:${FILE_SERVER_PORT}/api/push-content`);
    });

    return app;
}

// ─────────────────────────────────────────────────────────────
// Huidu LED Client (SDK 3.0 Protocol)
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
     * 보드 내 파일 삭제 (DeleteFiles SDK 명령)
     * @param {Array} fileUrls - 삭제할 파일 URL 배열 (AddProgram에서 보낸 name 값)
     */
    async deleteFiles(fileUrls) {
        if (!this.sdkReady || !fileUrls || fileUrls.length === 0) return;

        try {
            const fileTags = fileUrls.map(url => `<file name="${url}"/>`).join('');
            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="DeleteFiles"><files>${fileTags}</files></in></sdk>`;

            const result = await this._sendSdkCommand(xml, 30000);
            log('LED', `[${this.name}] 🗑️ DeleteFiles 완료 (${fileUrls.length}개 파일)`);
            return result;
        } catch (err) {
            // 삭제 실패해도 프로그램 전송은 계속 진행해야 하므로 에러만 로깅
            logError('LED', `[${this.name}] DeleteFiles 실패: ${err.message}`);
        }
    }

    /**
     * 보드에 적재된 CMS 관리 외 구(舊) 프로그램 삭제 (DeleteProgram SDK 명령)
     * - GetProgram으로 전체 프로그램 목록 조회 후
     * - prog_null / prog_male_X / prog_female_X 가 아닌 것은 모두 DeleteProgram
     */
    async deleteOldPrograms() {
        if (!this.sdkReady) return;
        try {
            // 1. 현재 보드의 전체 프로그램 목록 조회
            const getXml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="GetProgram"/></sdk>`;
            const result = await this._sendSdkCommand(getXml, 20000);

            // 2. 모든 program GUID 추출
            const allGuids = [...result.matchAll(/program[^>]*guid="([^"]+)"/g)].map(m => m[1]);

            // 3. CMS가 관리하는 프로그램은 보호, 나머지는 삭제 대상
            const OUR_PREFIX = ['prog_null', 'prog_male_', 'prog_female_'];
            const toDelete = allGuids.filter(g => !OUR_PREFIX.some(prefix => g.startsWith(prefix)));

            if (toDelete.length === 0) {
                log('LED', `[${this.name}] 삭제할 구 프로그램 없음 (보드 정상)`);
                return;
            }

            log('LED', `[${this.name}] 🗑️ 구 프로그램 ${toDelete.length}개 삭제 시작: ${toDelete.join(', ')}`);

            // 4. 하나씩 DeleteProgram 호출
            for (const guid of toDelete) {
                try {
                    const delXml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="DeleteProgram"><program guid="${guid}"/></in></sdk>`;
                    await this._sendSdkCommand(delXml, 10000);
                    log('LED', `[${this.name}]   ✅ 삭제 완료: "${guid}"`);
                } catch (e) {
                    // 개별 삭제 실패는 무시하고 계속 진행
                    logError('LED', `[${this.name}]   ⚠️ 삭제 실패(무시): "${guid}" → ${e.message}`);
                }
            }
            log('LED', `[${this.name}] 🗑️ 구 프로그램 정리 완료`);
        } catch (err) {
            // 조회 실패 시 삭제 없이 계속 진행 (안전하게 AddProgram은 그냥 진행)
            logError('LED', `[${this.name}] deleteOldPrograms 조회 실패(무시): ${err.message}`);
        }
    }

    /**
     * 비디오 프로그램 전송 (오프스크린 캐싱 포함)
     * @param {Array} mainList - 메인 화면 송출 영상 [{...}]
     * @param {Array} cacheList - 투명 캐시 영역에 사전 다운로드 시킬 영상 [{...}]
     */

    // ── Program Control (Multiplex) ──────────────────────────

    /**
     * 3개의 독립된 프로그램을 한 번에 보드에 적재 (AddProgram)
     * prog_null (기본, disabled=false)
     * prog_male (남성, disabled=true)
     * prog_female (여성, disabled=true)
     */
    async sendMultiplePrograms(nullList, maleList, femaleList, screenWidth, screenHeight) {
            if (!this.sdkReady) {
                log('LED', `[${this.name}] SDK 미준비, 프로그램 전송 스킵`);
                return false;
            }

            const allUrls = [
                ...(nullList || []).map(v => v.url),
                ...(maleList || []).map(v => v.url),
                ...(femaleList || []).map(v => v.url)
            ];

            const hash = crypto.createHash('md5')
                .update(JSON.stringify(allUrls))
                .digest('hex');

            if (hash === this._currentProgramHash) {
                return true;
            }

            try {
                const makeTags = (list, prefix) => {
                    if (!list || list.length === 0) return '';
                    return list.map((vid, idx) =>
                        `<video guid="video-${prefix}-${idx}" aspectRatio="${vid.aspectRatio}"><file name="${vid.url}" size="${vid.size}" md5="${vid.md5}"/><playParams duration="${vid.duration || 20000}"/></video>`
                    ).join('');
                };

                const makeProgram = (progGuid, list, isHidden = false) => {
                    if (!list || list.length === 0) return '';
                    const tags = makeTags(list, progGuid);
                    const playCount = isHidden ? 1 : 99999;
                    return `<program guid="${progGuid}" type="normal"><playControl count="${playCount}"/><area guid="area-${progGuid}" alpha="255"><rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/><resources>${tags}</resources></area></program>`;
                };

                const progNull = makeProgram('prog_null', nullList);
                
                let progMaleXml = '';
                if (maleList && maleList.length > 0) {
                    maleList.forEach((vid, idx) => {
                        progMaleXml += makeProgram(`prog_male_${idx}`, [vid], true);
                    });
                }

                let progFemaleXml = '';
                if (femaleList && femaleList.length > 0) {
                    femaleList.forEach((vid, idx) => {
                        progFemaleXml += makeProgram(`prog_female_${idx}`, [vid], true);
                    });
                }

                // 만약 남/여 채널이 재생 후 다음 영상으로 자연스럽게 넘어갈 경우를 대비해,
                // 리스트의 맨 마지막에 기본 채널을 한 번 더 배치합니다 (안전장치).
                const progNullFallback = makeProgram('prog_null_fallback', nullList, false);

                // AddProgram 전에 보드에 남은 구(舊) 프로그램 정리
                await this.deleteOldPrograms();

                // 순서: prog_null(기본) → 남성영상들 → 여성영상들 → prog_null_fallback(안전장치)
                let xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="AddProgram"><screen timeStamps="${Date.now()}">`;
                xml += progNull + progMaleXml + progFemaleXml + progNullFallback;
                xml += `</screen></in></sdk>`;

                const result = await this._sendSdkCommand(xml);
                if (result === 'kDownloadingFile') {
                    log('LED', `[${this.name}] 📥 LED 파일 다운로드 시작 (총 ${allUrls.length}개 파일)`);
                    this._isDownloading = true;
                    this._currentProgramHash = hash;
                } else {
                    this._currentProgramHash = hash;
                    log('LED', `[${this.name}] ✅ 다중 Program 세트 전송 완료`);
                }

                // AddProgram 직후 기본 상태(prog_null)로 스위치 강제
                setTimeout(() => this.switchProgram('prog_null'), 2000);

                return true;
            } catch (err) {
                logError('LED', `[${this.name}] AddProgram 실패: ${err.message}`);
                return false;
            }
        }

    /** 
     * 특정 Program GUID로 화면 즉각 전환 (다운로드 발생 안함)
     */
    async switchProgram(programGuid) {
            if (!this.sdkReady) return false;
            try {
                const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="SwitchProgram"><program guid="${programGuid}"/></in></sdk>`;
                const result = await this._sendSdkCommand(xml, 5000);
                return result === 'kSuccess';
            } catch (err) {
                // logError('LED', `[${this.name}] SwitchProgram(${programGuid}) 실패: ${err.message}`);
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

        _sendSdkCommand(xmlString, timeoutMs = 120000) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('SDK 명령 타임아웃')), timeoutMs);
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
     * 테이블 체인: TCM_VENDOR_SCH → TCM_CONTENTS_LIST → TCM_CONTENTS_FILE
     * 전체 파일(공통 + 남/여) 포함 → updateController에서 Main/Cache 분리
     * @returns {Array} [{FILE_KEY, FILE_NAME, FTP_FILENAME, FILE_SIZE, FILE_MD5, GENDER, SCREEN_WIDTH, SCREEN_HEIGHT, ASPECTRATIO_YN, PLAY_SEQ, DELAY_TIME}]
     */
    async getScheduledFiles(vendorCd) {
        const now = new Date();
        const currentHour = now.getHours();
        const dayOfWeek = now.getDay().toString(); // 0=일, 1=월, ...

        // 로컬 날짜 (YYYYMMDD)
        const p = (n) => n.toString().padStart(2, '0');
        const today = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;

        const schColumn = `SCH_${String(currentHour).padStart(2, '0')}`;

        try {
            // 1. 해당 요일/거래처의 스케줄 조회
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
                    log('SCHEDULE', `[${vendorCd}] 등록된 스케줄 없음`);
                }
                this._currentContentsKey = null;
                this._currentFileList = [];
                return [];
            }

            const row = scheduleRows[0];
            const contentsKey = row[schColumn];

            // 현재 시간대에 콘텐츠가 없으면 재생하지 않음
            if (!contentsKey || contentsKey === '') {
                log('SCHEDULE', `[${vendorCd}] ${currentHour}시 스케줄 비어있음 → 재생 없음`);
                this._currentContentsKey = null;
                this._currentFileList = [];
                return [];
            }

            // 시간이 바뀌거나 콘텐츠가 변경된 경우에만 파일 목록 갱신 (기존 목록이 비어있으면 재조회)
            if (currentHour === this._lastHour && contentsKey === this._currentContentsKey && this._currentFileList.length > 0) {
                return this._currentFileList;
            }

            // 2. CONTENTS_KEY → TCM_CONTENTS_LIST → TCM_CONTENTS_FILE 체인 조회
            //    전체 파일(공통 + 남/여) 로드 → updateController에서 Main/Cache 분리
            log('SCHEDULE', `[${vendorCd}] CONTENTS_KEY=${contentsKey} → 전체 파일 목록 조회 중`);
            const fileRows = await dbQuery(`
                SELECT 
                    F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                    F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                    F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN,
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

            if (fileRows.length > 0) {
                log('SCHEDULE', `[${vendorCd}] ${currentHour}시 콘텐츠(${contentsKey}) → ${fileRows.length}개 파일 로드`);
                fileRows.forEach((f, i) => {
                    log('SCHEDULE', `  ${i + 1}. ${f.FILE_NAME} (${f.SCREEN_WIDTH}x${f.SCREEN_HEIGHT})`);
                });
            } else {
                log('WARN', `[${vendorCd}] CONTENTS_KEY=${contentsKey}에 해당하는 유효한 파일이 없습니다.`);
            }

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
// Main Controller
// ─────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  LED 전광판 통신 컨트롤러 v2.0');
    console.log('  CMS 광고 스케줄 기반 콘텐츠 송출');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();

    // 1. 파일 서버 시작 (Express app 반환 → 이후 push API 등록용)
    const fileServerApp = startFileServer();

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

    // 3. 거래처별 LED 클라이언트 + 스케줄 매니저 생성
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

        return {
            vendorCd: vendor.VENDOR_CD,
            vendorNm: vendor.VENDOR_NM,
            deviceId: vendor.DEVICE_ID,
            connectInfo: vendor.CONNECT_INFO,
            ledClient,
            scheduler,
            lastSentHash: null,
            previousFileUrls: [],   // 이전에 보드로 보낸 파일 URL 목록 (삭제용 추적)
        };
    });

    // 4. 모든 LED 클라이언트 연결 시작
    controllers.forEach(c => c.ledClient.start());

    // ── 즉시 반영 REST API ──────────────────────────────────────
    fileServerApp.post('/api/push-content', async (req, res) => {
        const { vendorCodes, contentsId } = req.body;

        if (!vendorCodes || !Array.isArray(vendorCodes) || vendorCodes.length === 0) {
            return res.status(400).json({ success: false, message: '대상 점포를 선택해주세요.' });
        }
        if (!contentsId) {
            return res.status(400).json({ success: false, message: '콘텐츠를 선택해주세요.' });
        }

        log('PUSH-API', `즉시 반영 요청: 점포 ${vendorCodes.length}개, 콘텐츠=${contentsId}`);

        try {
            // 1. 콘텐츠 파일 목록 조회 (전체 남/여/공통)
            //    즉시 반영 시에도 모든 영상을 보드에 캐싱하여 CCTV 반응성을 유지함
            const fileRows = await dbQuery(`
                SELECT 
                    F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                    F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                    F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN,
                    L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME,
                    L.USE_YN
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ?
                  AND L.CONTENTS_KEY = ?
                  AND L.USE_YN = 'Y'
                  AND F.USE_YN = 'Y'
                ORDER BY L.DISP_SEQ ASC
            `, [CORP_CD, contentsId]);

            if (fileRows.length === 0) {
                return res.json({ success: false, message: '해당 콘텐츠에 송출 가능한 파일이 없습니다.' });
            }

            // 2. 송출용(Null) / 잠복용(성별) 분리
            const nullFiles = fileRows.filter(f => !f.GENDER || f.GENDER === '');
            const genderFiles = fileRows.filter(f => f.GENDER && f.GENDER !== '');

            const mainVideoList = await filesToVideoList(nullFiles);
            const cacheVideoList = await filesToVideoList(genderFiles);

            if (mainVideoList.length === 0) {
                return res.json({ success: false, message: '송출할 공통 대상 영상(Main)이 없습니다.' });
            }

            log('PUSH-API', `즉시 반영 준비: 메인 ${mainVideoList.length}개, 캐시 ${cacheVideoList.length}개`);

            // 3. 각 점포별 LED에 송출
            const results = [];
            for (const vendorCd of vendorCodes) {
                const vendorControllers = controllers.filter(c => c.vendorCd === vendorCd);
                if (vendorControllers.length === 0) {
                    results.push({ vendorCd, vendorNm: vendorCd, status: 'NOT_FOUND', message: '등록된 LED 장비 없음' });
                    continue;
                }

                let vendorSuccess = false;
                let vendorError = null;
                const vendorNm = vendorControllers[0].vendorNm;

                for (const ctrl of vendorControllers) {
                    if (!ctrl.ledClient.isReady()) {
                        logError('PUSH-API', `[${ctrl.vendorNm}] 장비 미연결: ${ctrl.deviceId || '알수없음'}`);
                        continue;
                    }

                    try {
                        const allCurrentUrls = [...mainVideoList, ...cacheVideoList].map(v => v.url);

                        // 기존 파일 삭제 (새 목록에 없는 것만)
                        if (ctrl.previousFileUrls.length > 0) {
                            const newFileUrls = new Set(allCurrentUrls);
                            const toDelete = ctrl.previousFileUrls.filter(url => !newFileUrls.has(url));
                            if (toDelete.length > 0) {
                                log('PUSH-API', `[${ctrl.vendorNm}] 불필요 파일 ${toDelete.length}개 삭제`);
                                await ctrl.ledClient.deleteFiles(toDelete);
                            }
                        }

                        // 프로그램 송출 (다중 프로그램 적재)
                        const screenWidth = mainVideoList[0]?.width || 128;
                        const screenHeight = mainVideoList[0]?.height || 64;
                        ctrl.ledClient.resetProgramHash();

                        const maleFiles = fileRows.filter(f => f.GENDER === 'M');
                        const femaleFiles = fileRows.filter(f => f.GENDER === 'F');
                        const maleVideoList = await filesToVideoList(maleFiles);
                        const femaleVideoList = await filesToVideoList(femaleFiles);

                        const ok = await ctrl.ledClient.sendMultiplePrograms(mainVideoList, maleVideoList, femaleVideoList, screenWidth, screenHeight);

                        if (ok) {
                            ctrl.previousFileUrls = allCurrentUrls;
                            ctrl.lastSentHash = crypto.createHash('md5').update(JSON.stringify(allCurrentUrls)).digest('hex');
                            log('PUSH-API', `[${ctrl.vendorNm} - ${ctrl.deviceId || '알수없음'}] ✅ 즉시 반영 성공`);
                            vendorSuccess = true;
                        }
                    } catch (err) {
                        logError('PUSH-API', `[${ctrl.vendorNm} - ${ctrl.deviceId || '알수없음'}] 송출 에러: ${err.message}`);
                        vendorError = err.message;
                    }
                }

                if (vendorSuccess) {
                    results.push({ vendorCd, vendorNm: vendorNm, status: 'SUCCESS', message: '송출 완료' });
                } else {
                    results.push({ vendorCd, vendorNm: vendorNm, status: vendorError ? 'ERROR' : 'FAILED', message: vendorError || '송출 실패 또는 장비 연결 안됨' });
                }
            }

            const successCount = results.filter(r => r.status === 'SUCCESS').length;
            log('PUSH-API', `즉시 반영 완료: ${successCount}/${vendorCodes.length} 성공`);

            res.json({
                success: successCount > 0,
                message: `${successCount}/${vendorCodes.length}개 점포 송출 완료`,
                results
            });
        } catch (err) {
            logError('PUSH-API', `즉시 반영 실패: ${err.message}`);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    log('MAIN', `즉시 반영 API 등록 완료 (POST /api/push-content)`);
    console.log();

    // 5. 파일 메타데이터 캐시 및 변환 유틸리티
    const fileMetaCache = {}; // { filename: { size, md5, mtime } }

    async function getFileMeta(filename, filePath) {
        try {
            const stats = fs.statSync(filePath);
            const mtime = stats.mtime.getTime();

            // 캐시 확인
            if (fileMetaCache[filename] && fileMetaCache[filename].mtime === mtime) {
                return fileMetaCache[filename];
            }

            log('FILE', `  [${filename}] MD5 계산 시작... (크기: ${Math.round(stats.size / 1024 / 1024)}MB)`);

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
                duration: (f.DELAY_TIME || 20) * 1000, // 초 → 밀리초
                width: f.SCREEN_WIDTH,
                height: f.SCREEN_HEIGHT,
                aspectRatio: f.ASPECTRATIO_YN === 'Y' ? 'true' : 'false'
            });
        }
        return videoList;
    }

    // 6. 개별 컨트롤러 업데이트 함수
    async function updateController(ctrl) {
        if (!ctrl.ledClient.isReady()) return;

        try {
            // 1. 현재 시간대 스케줄 파일 목록 조회 (전체 남/여/공통)
            const files = await ctrl.scheduler.getScheduledFiles(ctrl.vendorCd);
            if (files.length === 0) return;

            // 2. 송출용(Null) / 잠복캐싱용(남녀) 분리
            const nullFiles = files.filter(f => !f.GENDER || f.GENDER === '');
            const genderFiles = files.filter(f => f.GENDER && f.GENDER !== '');

            const mainVideoList = await filesToVideoList(nullFiles);
            const cacheVideoList = await filesToVideoList(genderFiles);

            if (mainVideoList.length === 0) {
                log('WARN', `[${ctrl.vendorNm}] 송출할 공통 대상 영상(Main)이 없습니다.`);
                return;
            }

            // 3. 전체 목록 기반 해시 확인 (변경 여부 체크)
            const allCurrentUrls = [...mainVideoList, ...cacheVideoList].map(v => v.url);
            const programHash = crypto.createHash('md5')
                .update(JSON.stringify(allCurrentUrls))
                .digest('hex');

            if (programHash === ctrl.lastSentHash) {
                return; // 변경 없음 → 스킵
            }

            log('CTRL', `[${ctrl.vendorNm}] === 프로그램 갱신 감지 → 전체 다운로드 및 Main 송출 시작 (총 ${allCurrentUrls.length}개) ===`);

            // 4. 기존 보드 파일 삭제 (이전에 전송했던 '전체' 파일 중, 새 목록에 없는 찌꺼기만 삭제)
            if (ctrl.previousFileUrls.length > 0) {
                const newFileUrls = new Set(allCurrentUrls);
                const toDelete = ctrl.previousFileUrls.filter(url => !newFileUrls.has(url));

                if (toDelete.length > 0) {
                    log('CTRL', `[${ctrl.vendorNm}] 🗑️ 불필요 찌꺼기 파일 ${toDelete.length}개 삭제 중...`);
                    await ctrl.ledClient.deleteFiles(toDelete);
                } else {
                    log('CTRL', `[${ctrl.vendorNm}] 기존 파일 전부 재사용 → 삭제 스킵`);
                }
            }

            // 5. 새 프로그램 분리 송출 (다중 프로그램 적재)
            const screenWidth = mainVideoList[0]?.width || 128;
            const screenHeight = mainVideoList[0]?.height || 64;

            const maleFiles = files.filter(f => f.GENDER === 'M');
            const femaleFiles = files.filter(f => f.GENDER === 'F');
            const maleVideoList = await filesToVideoList(maleFiles);
            const femaleVideoList = await filesToVideoList(femaleFiles);

            ctrl.ledClient.resetProgramHash();
            const result = await ctrl.ledClient.sendMultiplePrograms(mainVideoList, maleVideoList, femaleVideoList, screenWidth, screenHeight);

            if (result) {
                ctrl.lastSentHash = programHash;
                ctrl.previousFileUrls = allCurrentUrls;
                log('CTRL', `[${ctrl.vendorNm}] ✅ 자동 스케줄 송출 완료`);
            }

        } catch (err) {
            logError('CTRL', `[${ctrl.vendorNm}] 업데이트 에러: ${err.message}`);
        }
    }

    // 7. 스케줄 폴링 (1분 간격)
    // 이 폴링은 매분마다 다운로드를 하는 것이 아닙니다! 시간이 바뀌어(예: 13시->14시) 새로운 7개의 스케줄을 넣어야 할 '딱 그 시점 한 번만' 다운로드를 유발합니다.
    log('MAIN', `스케줄 폴링 시작 (${SCHEDULE_POLL_INTERVAL / 1000}초 간격)`);
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
    }, SCHEDULE_POLL_INTERVAL);

    // 8. 초기 실행 (5초 후, LED 연결 대기)
    setTimeout(async () => {
        log('MAIN', '초기 콘텐츠 로드 시작...');
        for (const ctrl of controllers) {
            await updateController(ctrl);
        }
    }, 5000);

    // 9. Graceful shutdown
    process.on('SIGINT', () => {
        log('MAIN', '종료 중...');
        controllers.forEach(c => c.ledClient.stop());
        db.end();
        process.exit(0);
    });

    // ── CCTV 실시간 성별 감지 → LED 타겟 송출 ──────────────────
    const CCTV_PORT = parseInt(process.env.CCTV_RECEIVER_PORT || '2016', 10);
    const GENDER_COOLDOWN = 30000; // 30초 쿨다운
    const vendorGenderCooldowns = {}; // { vendorCd: lastTriggerTime }

    // CCTV SerialNumber → VENDOR_CD 매핑 캐시
    let cctvVendorMap = {};

    async function refreshCctvVendorMap() {
        try {
            const rows = await dbQuery(
                'SELECT DEVICE_SN, USE_VENDOR FROM TCM_CCTV WHERE CORP_CD = ? AND USE_YN = "Y"',
                [CORP_CD]
            );
            cctvVendorMap = {};
            rows.forEach(r => {
                if (r.DEVICE_SN && r.USE_VENDOR) {
                    cctvVendorMap[r.DEVICE_SN] = r.USE_VENDOR;
                }
            });
            log('CCTV', `CCTV→거래처 매핑 갱신: ${Object.keys(cctvVendorMap).length}개 (${Object.entries(cctvVendorMap).map(([sn, v]) => `${sn}→${v}`).join(', ')})`);
        } catch (err) {
            logError('CCTV', `매핑 갱신 실패: ${err.message}`);
        }
    }

    // 가장 가까운 시간대의 스케줄을 찾아 타겟 성별 파일 1개와 NULL 파일 목록을 반환
    async function getClosestGenderedAndNullFiles(vendorCd, gender) {
        const now = new Date();
        const currentHour = now.getHours();
        const dayCode = now.getDay().toString(); // 0(일), 1(월), ... 6(토)
        const today = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD 변환

        // 1. 당일 활성 스케줄 가져오기 (가장 최근 등록된 스케줄)
        const schRows = await dbQuery(`
            SELECT * FROM TCM_VENDOR_SCH 
            WHERE CORP_CD = ? 
              AND VENDOR_CD = ? 
              AND DAY_SEC = ?
              AND USE_YN = 'Y'
              AND ? BETWEEN START_DT AND END_DT
            ORDER BY REGISTDT DESC
            LIMIT 1
        `, [CORP_CD, vendorCd, dayCode, today]);

        if (schRows.length === 0) return { selectedGenderFile: null, nullFiles: [], allGenderFiles: [] };

        const schRow = schRows[0];
        let closestHour = -1;
        let minDiff = 999;
        let closestContentsKey = null;

        // 2. 0시부터 23시 중 현재 시간과 가장 가까운 편성시간 찾기
        for (let i = 0; i < 24; i++) {
            const colName = `SCH_${String(i).padStart(2, '0')}`;
            const contentsKey = schRow[colName];
            if (contentsKey && String(contentsKey).trim() !== '') {
                const diff = Math.abs(currentHour - i);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestHour = i;
                    closestContentsKey = contentsKey;
                }
            }
        }

        if (!closestContentsKey) return { genderedFiles: [], nullFiles: [] };

        log('CCTV', `[${vendorCd}] 현재 ${currentHour}시 ↔ 가장 가까운 스케줄: ${closestHour}시 (차이: ${minDiff}시간) 매칭`);

        // 3. 해당 스케줄(ContentsKey)의 모든 활성 파일 로드
        const fileRows = await dbQuery(`
            SELECT 
                F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN,
                L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME
            FROM TCM_CONTENTS_LIST L
            JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
            WHERE L.CORP_CD = ?
              AND L.CONTENTS_KEY = ?
              AND L.USE_YN = 'Y'
              AND F.USE_YN = 'Y'
            ORDER BY L.DISP_SEQ ASC
        `, [CORP_CD, closestContentsKey]);

        const nullFiles = fileRows.filter(f => !f.GENDER || f.GENDER === '');
        const allGenderFiles = fileRows.filter(f => f.GENDER && f.GENDER !== '');

        // 특정 성별(gender)에 맞는 파일들 중 1개 선택
        const matchingFiles = allGenderFiles.filter(f => f.GENDER === gender);
        let selectedGenderFile = null;
        let selectedIndex = -1;
        if (matchingFiles.length > 0) {
            selectedIndex = Math.floor(Math.random() * matchingFiles.length);
            selectedGenderFile = matchingFiles[selectedIndex];
        }

        return { selectedGenderFile, selectedIndex, nullFiles, allGenderFiles };
    }

    // CCTV Express 서버
    const cctvApp = express();
    cctvApp.use(express.json({ limit: '50mb' }));

    const vendorRevertTimers = {}; // 재생 복귀용 타이머 관리
    const cctvPreviousCounts = {}; // 이전 누적 카운트 저장용 (델타 계산)

    cctvApp.post('/', async (req, res) => {
        res.status(200).json({ Status: "Success" });

        try {
            const metrics = req.body?.Metrics;
            if (!metrics?.Properties?.SerialNumber) return;
            if (!metrics?.ReportData?.RealTimeReport) return;

            const serialNumber = metrics.Properties.SerialNumber;
            const vendorCd = cctvVendorMap[serialNumber];
            if (!vendorCd) return; // 미등록 센서

            // ObjectType="1"의 RealTimeCount만 추출
            const report = metrics.ReportData.RealTimeReport;
            const objects = Array.isArray(report.Object) ? report.Object : [report.Object].filter(Boolean);
            const countObj = objects.find(o => o['@ObjectType'] === '1' && o.RealTimeCount);
            if (!countObj) return;

            const rc = countObj.RealTimeCount;
            const currentTotalMale = parseInt(rc['@EntersMaleCustomer'] || 0, 10);
            const currentTotalFemale = parseInt(rc['@EntersFemaleCustomer'] || 0, 10);

            const prev = cctvPreviousCounts[serialNumber] || { male: currentTotalMale, female: currentTotalFemale };
            const deltaMale = currentTotalMale - prev.male;
            const deltaFemale = currentTotalFemale - prev.female;

            cctvPreviousCounts[serialNumber] = { male: currentTotalMale, female: currentTotalFemale };

            // 감지된 증가량이 없거나, 동수면 무시 (통과 인원만 반응)
            if (deltaMale <= 0 && deltaFemale <= 0) return;
            if (deltaMale === deltaFemale) return;

            const dominantGender = deltaMale > deltaFemale ? 'M' : 'F';
            const genderLabel = dominantGender === 'M' ? '남성' : '여성';

            log('CCTV', `[SN:${serialNumber}→${vendorCd}] ${genderLabel} 지나감 감지 (새로 들어온 인원 - 남:${deltaMale} 여:${deltaFemale})`);

            const vendorControllers = controllers.filter(c => c.vendorCd === vendorCd);
            const activeControllers = vendorControllers.filter(c => c.ledClient.isReady());

            if (activeControllers.length === 0) {
                log('CCTV', `[${vendorCd}] LED 미연결 → 성별 반영 스킵`);
                return;
            }

            // 재생 중 방해 금지 (쿨타임 모드)
            // 현재 특정 성별 타겟 영상이 재생 중이고 아직 공통으로 복귀하지 않았다면 무시합니다.
            if (vendorRevertTimers[vendorCd]) {
                log('CCTV', `[${vendorCd}] ⏳ 타겟 영상 송출 중이므로 센서 이벤트 무시 (방해 금지)`);
                return;
            }

            // 1. 가장 가까운 스케줄시간대에서 전체 파일 조회 및 타겟 성별 1개 선택 (랜덤 선택됨)
            const { selectedGenderFile, selectedIndex, nullFiles, allGenderFiles } = await getClosestGenderedAndNullFiles(vendorCd, dominantGender);

            if (!selectedGenderFile) {
                log('CCTV', `[${vendorCd}] 당일 스케줄 내 GENDER=${dominantGender} 콘텐츠 없음 → 스킵`);
                return;
            }

            // 2. 이미 적재된 개별 Program GUID로 즉각 스위칭
            const targetProgGuid = dominantGender === 'M' ? `prog_male_${selectedIndex}` : `prog_female_${selectedIndex}`;
            log('CCTV', `[${vendorCd}] ⚡ 즉각 스위칭 명령 전송: ${targetProgGuid} (대상: ${activeControllers.length}대)`);

            const genderedVideo = await filesToVideoList([selectedGenderFile]);
            // IMAGE_DELAY 값을 우선적으로 사용하며, 값이 없으면 10초를 기본값으로 둡니다.
            const playDurationMs = genderedVideo.length > 0 && genderedVideo[0].duration ? genderedVideo[0].duration : 10000;

            let anySuccess = false;
            for (const ctrl of activeControllers) {
                let ok = await ctrl.ledClient.switchProgram(targetProgGuid);
                if (ok) anySuccess = true;
            }

            if (anySuccess) {
                log('CCTV', `[${vendorCd}] ✅ ${genderLabel} 타겟 영상 스위칭 완료 (${playDurationMs / 1000}초 대기 시작)`);
                vendorGenderCooldowns[vendorCd] = Date.now();

                if (vendorRevertTimers[vendorCd]) clearTimeout(vendorRevertTimers[vendorCd]);

                // 3. 재생시간 대기 후 원래 공통 프로그램(prog_null)으로 복귀
                vendorRevertTimers[vendorCd] = setTimeout(async () => {
                    log('CCTV', `[${vendorCd}] 타겟 영상 재생 종료 → 공통 스케줄로 복귀 진행`);
                    for (const ctrl of activeControllers) {
                        if (ctrl.ledClient.isReady()) {
                            await ctrl.ledClient.switchProgram('prog_null');
                        }
                    }
                    log('CCTV', `[${vendorCd}] ✅ 공통 스케줄(prog_null) 복구 스위칭 완료`);
                    delete vendorRevertTimers[vendorCd];
                }, playDurationMs);
            } else {
                log('CCTV', `[${vendorCd}] ❌ 스위칭 실패 (보드 응답 없음)`);
                delete vendorRevertTimers[vendorCd];
            }
        } catch (err) {
            logError('CCTV', `처리 에러: ${err.message}`);
        }
    });

    cctvApp.get('/', (req, res) => res.send('CCTV Gender Receiver Active'));

    cctvApp.listen(CCTV_PORT, '0.0.0.0', () => {
        log('CCTV', `성별 감지 수신 서버 시작 → port ${CCTV_PORT}`);
    });

    // CCTV 매핑 초기 로드 + 5분마다 갱신
    await refreshCctvVendorMap();
    setInterval(refreshCctvVendorMap, 5 * 60 * 1000);

    log('MAIN', '✅ LED 컨트롤러 가동 완료 (스케줄 폴링 + 즉시 반영 API + CCTV 성별 감지)');
    console.log();
}

// 실행
main().catch(err => {
    logError('FATAL', err.message);
    process.exit(1);
});
