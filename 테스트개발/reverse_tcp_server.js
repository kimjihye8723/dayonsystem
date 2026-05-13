/**
 * 공통 모듈 - DB, 유틸리티, 파일 서버, ScheduleManager, DeviceSession
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2');

// ── Config ──
const DB_CONFIG = {
    host: process.env.DB_HOST || '114.108.180.228',
    user: process.env.DB_USER || 'blueeye',
    password: process.env.DB_PASS || 'blueeye0037!',
    database: process.env.DB_NAME || 'joot_cms',
    waitForConnections: true, connectionLimit: 5, queueLimit: 0
};
const CORP_CD = '25001';
const FILE_BASE_PATH = process.env.FILE_PATH || 'D:\\dayon_file';
const FILE_SERVER_PORT = parseInt(process.env.FILE_SERVER_PORT || '9090', 10);
const REVERSE_TCP_PORT = parseInt(process.env.REVERSE_TCP_PORT || '7001', 10);
const SCHEDULE_POLL_INTERVAL = parseInt(process.env.SCHEDULE_POLL_INTERVAL || '60000', 10);
const CCTV_PORT = parseInt(process.env.CCTV_RECEIVER_PORT || '2016', 10);
const LOCAL_TCP_VERSION = 0x1000007;

const CMD = {
    HEARTBEAT_ASK: 0x005f, HEARTBEAT_ANSWER: 0x0060,
    SDK_SERVICE_ASK: 0x2001, SDK_SERVICE_ANSWER: 0x2002,
    ERROR_ANSWER: 0x2000, SDK_CMD_ASK: 0x2003, SDK_CMD_ANSWER: 0x2004,
};

// ── DB Pool ──
const db = mysql.createPool(DB_CONFIG);
function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => { if (err) reject(err); else resolve(results); });
    });
}

// ── Utility ──
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}
const LOCAL_IP = process.env.FILE_SERVER_HOST || getLocalIp();

function log(tag, msg) {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.log(`[${now}] [${tag}] ${msg}`);
}
function logError(tag, msg) {
    const now = new Date().toLocaleTimeString('ko-KR');
    console.error(`[${now}] [${tag}] ❌ ${msg}`);
}

// ── File Meta Cache ──
const fileMetaCache = {};
async function getFileMeta(filename, filePath) {
    try {
        const stats = fs.statSync(filePath);
        const mtime = stats.mtime.getTime();
        if (fileMetaCache[filename] && fileMetaCache[filename].mtime === mtime) return fileMetaCache[filename];
        const md5 = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            stream.on('data', d => hash.update(d));
            stream.on('error', reject);
            stream.on('end', () => resolve(hash.digest('hex')));
        });
        const meta = { size: stats.size, md5, mtime };
        fileMetaCache[filename] = meta;
        return meta;
    } catch (err) {
        logError('FILE', `[${filename}] 메타데이터 실패: ${err.message}`);
        return null;
    }
}

async function filesToVideoList(files) {
    const list = [];
    for (const f of files) {
        const filename = f.FTP_FILENAME || f.FILE_NAME;
        const filePath = path.join(FILE_BASE_PATH, filename);
        const url = `http://${LOCAL_IP}:${FILE_SERVER_PORT}/files/${encodeURIComponent(filename)}`;
        const meta = await getFileMeta(filename, filePath);
        if (!meta) continue;
        list.push({
            name: filename, url, size: meta.size, md5: meta.md5,
            duration: (f.DELAY_TIME || 20) * 1000,
            width: f.SCREEN_WIDTH, height: f.SCREEN_HEIGHT,
            aspectRatio: f.ASPECTRATIO_YN === 'Y' ? 'true' : 'false'
        });
    }
    return list;
}

// ── File Server ──
function startFileServer() {
    const app = express();
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
    });
    app.use(express.json());
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => log('FILE-SRV', `${req.method} ${req.url} - ${res.statusCode} (${Date.now()-start}ms) from ${req.ip}`));
        next();
    });
    app.use('/files', express.static(FILE_BASE_PATH));
    app.listen(FILE_SERVER_PORT, () => {
        log('FILE', `파일 서버 시작 → http://${LOCAL_IP}:${FILE_SERVER_PORT}/files/`);
    });
    return app;
}

// ── ScheduleManager ──
class ScheduleManager {
    constructor() { this._lastHour = -1; this._currentContentsKey = null; this._currentFileList = []; }

    async getScheduledFiles(vendorCd) {
        const now = new Date();
        const currentHour = now.getHours();
        const dayOfWeek = now.getDay().toString();
        const p = (n) => n.toString().padStart(2, '0');
        const today = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}`;
        const schColumn = `SCH_${String(currentHour).padStart(2,'0')}`;
        try {
            const scheduleRows = await dbQuery(`
                SELECT * FROM TCM_VENDOR_SCH
                WHERE CORP_CD = ? AND VENDOR_CD = ? AND DAY_SEC = ? AND USE_YN = 'Y' AND ? BETWEEN START_DT AND END_DT
                ORDER BY REGISTDT DESC LIMIT 1
            `, [CORP_CD, vendorCd, dayOfWeek, today]);
            if (scheduleRows.length === 0) { this._currentContentsKey = null; this._currentFileList = []; return []; }
            const contentsKey = scheduleRows[0][schColumn];
            if (!contentsKey || contentsKey === '') { this._currentContentsKey = null; this._currentFileList = []; return []; }
            if (currentHour === this._lastHour && contentsKey === this._currentContentsKey && this._currentFileList.length > 0) return this._currentFileList;
            log('SCHEDULE', `[${vendorCd}] CONTENTS_KEY=${contentsKey} → 파일 목록 조회`);
            const fileRows = await dbQuery(`
                SELECT F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE, F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                       F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN, L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ? AND L.CONTENTS_KEY = ? AND L.USE_YN = 'Y' AND F.USE_YN = 'Y'
                ORDER BY L.DISP_SEQ ASC
            `, [CORP_CD, contentsKey]);
            this._lastHour = currentHour; this._currentContentsKey = contentsKey; this._currentFileList = fileRows;
            if (fileRows.length > 0) {
                log('SCHEDULE', `[${vendorCd}] ${currentHour}시 → ${fileRows.length}개 파일`);
                fileRows.forEach((f,i) => log('SCHEDULE', `  ${i+1}. ${f.FILE_NAME} (${f.SCREEN_WIDTH}x${f.SCREEN_HEIGHT}) GENDER=${f.GENDER||'공통'}`));
            }
            return fileRows;
        } catch (err) { logError('SCHEDULE', `조회 실패: ${err.message}`); return this._currentFileList; }
    }
    invalidate() { this._lastHour = -1; this._currentContentsKey = null; }
}

// ── DeviceSession (핵심: 디바이스별 완전 격리) ──
class DeviceSession {
    constructor(socket) {
        this.socket = socket;
        this.socketId = `${socket.remoteAddress}:${socket.remotePort}`;
        this.guid = null;
        this.deviceId = null;
        this.vendorCd = null;
        this.vendorNm = null;
        this.screenWidth = 0;
        this.screenHeight = 0;
        this.sdkReady = false;
        this.recvBuffer = Buffer.alloc(0);
        this.heartbeatTimer = null;
        this._resolveVersion = null;
        this._resolveGuid = null;
        this._resolveSdkCmd = null;
        this._currentProgramHash = null;
        this._isDownloading = false;
        this.previousFileUrls = [];
        this.scheduler = null;
        this.lastSentHash = null;
    }

    get label() { return this.deviceId ? `${this.vendorNm||this.deviceId}` : this.socketId; }

    // ── SDK Packet 전송 ──
    _sendSdkPacket(xmlString) {
        if (!this.socket || this.socket.destroyed) return;
        const xmlBuf = Buffer.from(xmlString, 'utf-8');
        const xmlLen = xmlBuf.length;
        const len = 2 + 4 + 4 + xmlLen;
        const pkt = Buffer.alloc(2 + len);
        pkt.writeUInt16LE(len + 2, 0);
        pkt.writeUInt16LE(CMD.SDK_CMD_ASK, 2);
        pkt.writeUInt32LE(xmlLen, 4);
        pkt.writeUInt32LE(0, 8);
        xmlBuf.copy(pkt, 12);
        this.socket.write(pkt);
    }

    _sendSdkCommand(xmlString, timeoutMs = 120000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SDK 명령 타임아웃')), timeoutMs);
            this._resolveSdkCmd = (err, result) => {
                clearTimeout(timeout); this._resolveSdkCmd = null;
                if (err) reject(err); else resolve(result);
            };
            this._sendSdkPacket(xmlString);
        });
    }

    // ── 버전 협상 ──
    _negotiateVersion() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('버전 협상 타임아웃')), 10000);
            this._resolveVersion = (err) => {
                clearTimeout(timeout); this._resolveVersion = null;
                if (err) reject(err); else resolve();
            };
            const pkt = Buffer.alloc(8);
            pkt.writeUInt16LE(8, 0);
            pkt.writeUInt16LE(CMD.SDK_SERVICE_ASK, 2);
            pkt.writeUInt32LE(LOCAL_TCP_VERSION, 4);
            this.socket.write(pkt);
        });
    }

    // ── GUID 교환 ──
    _exchangeGuid() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('GUID 교환 타임아웃')), 10000);
            this._resolveGuid = (err, guid) => {
                clearTimeout(timeout); this._resolveGuid = null;
                if (err) reject(err); else { this.guid = guid; resolve(); }
            };
            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="##GUID"><in method="GetIFVersion"><version value="1000000"/></in></sdk>`;
            this._sendSdkPacket(xml);
        });
    }

    // ── GetDeviceInfo → DEVICE_ID 추출 ──
    async getDeviceInfo() {
        const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="GetDeviceInfo"/></sdk>`;
        const result = await this._sendSdkCommand(xml, 15000);
        return result; // _handlePacket에서 파싱된 info 객체 반환
    }

    // ── 프로그램 제어 ──
    async deleteFiles(fileUrls) {
        if (!this.sdkReady || !fileUrls || fileUrls.length === 0) return;
        try {
            const tags = fileUrls.map(u => `<file name="${u}"/>`).join('');
            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="DeleteFiles"><files>${tags}</files></in></sdk>`;
            await this._sendSdkCommand(xml, 30000);
            log('LED', `[${this.label}] 🗑️ DeleteFiles 완료 (${fileUrls.length}개)`);
        } catch (err) { logError('LED', `[${this.label}] DeleteFiles 실패: ${err.message}`); }
    }

    async sendMultiplePrograms(nullList, maleList, femaleList, sw, sh) {
        if (!this.sdkReady) { log('LED', `[${this.label}] SDK 미준비, 스킵`); return false; }
        const allUrls = [...(nullList||[]).map(v=>v.url), ...(maleList||[]).map(v=>v.url), ...(femaleList||[]).map(v=>v.url)];
        const hash = crypto.createHash('md5').update(JSON.stringify(allUrls)).digest('hex');
        if (hash === this._currentProgramHash) return true;
        try {
            const makeTags = (list, prefix) => {
                if (!list || list.length === 0) return '';
                return list.map((v,i) =>
                    `<video guid="video-${prefix}-${i}" aspectRatio="${v.aspectRatio}"><file name="${v.url}" size="${v.size}" md5="${v.md5}"/><playParams duration="${v.duration||20000}"/></video>`
                ).join('');
            };
            const makeProg = (guid, list, isHidden) => {
                if (!list || list.length === 0) return '';
                const tags = makeTags(list, guid);
                const count = isHidden ? 1 : 99999;
                return `<program guid="${guid}" type="normal"><playControl count="${count}"/><area guid="area-${guid}" alpha="255"><rectangle x="0" y="0" width="${sw}" height="${sh}"/><resources>${tags}</resources></area></program>`;
            };
            const progNull = makeProg('prog_null', nullList);
            let progMaleXml = '';
            if (maleList && maleList.length > 0) maleList.forEach((v,i) => { progMaleXml += makeProg(`prog_male_${i}`, [v], true); });
            let progFemaleXml = '';
            if (femaleList && femaleList.length > 0) femaleList.forEach((v,i) => { progFemaleXml += makeProg(`prog_female_${i}`, [v], true); });

            let xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="AddProgram"><screen timeStamps="${Date.now()}">`;
            xml += progNull + progMaleXml + progFemaleXml;
            xml += `</screen></in></sdk>`;

            const result = await this._sendSdkCommand(xml);
            this._currentProgramHash = hash;
            if (result === 'kDownloadingFile') {
                log('LED', `[${this.label}] 📥 파일 다운로드 시작 (${allUrls.length}개)`);
                this._isDownloading = true;
            } else {
                log('LED', `[${this.label}] ✅ 다중 Program 전송 완료`);
            }
            setTimeout(() => this.switchProgram('prog_null'), 2000);
            return true;
        } catch (err) { logError('LED', `[${this.label}] AddProgram 실패: ${err.message}`); return false; }
    }

    async switchProgram(programGuid) {
        if (!this.sdkReady) return false;
        try {
            const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${this.guid}"><in method="SwitchProgram"><program guid="${programGuid}"/></in></sdk>`;
            const result = await this._sendSdkCommand(xml, 5000);
            return result === 'kSuccess';
        } catch (err) { return false; }
    }

    resetProgramHash() { this._currentProgramHash = null; }

    // ── 수신 버퍼 처리 ──
    processRecvBuffer() {
        while (this.recvBuffer.length >= 4) {
            const len = this.recvBuffer.readUInt16LE(0);
            if (len < 4 || len > 1048576) { this.recvBuffer = Buffer.alloc(0); break; }
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
                logError('LED', `[${this.label}] 에러 코드: ${code}`);
                if (this._resolveVersion) this._resolveVersion(new Error(`에러: ${code}`));
                if (this._resolveGuid) this._resolveGuid(new Error(`에러: ${code}`));
                if (this._resolveSdkCmd) this._resolveSdkCmd(new Error(`에러: ${code}`));
                break;
            }
            case CMD.SDK_CMD_ANSWER: {
                if (data.length >= 8) {
                    const xmlData = data.slice(8).toString('utf-8');
                    if (this._resolveGuid) {
                        const m = xmlData.match(/guid="([^"]+)"/);
                        if (m && m[1]) this._resolveGuid(null, m[1]);
                        else this._resolveGuid(new Error('GUID 파싱 실패'));
                    } else if (this._resolveSdkCmd) {
                        // GetDeviceInfo 응답 특수 처리
                        if (xmlData.includes('method="GetDeviceInfo"')) {
                            const info = this._parseDeviceInfo(xmlData);
                            this._resolveSdkCmd(null, info);
                        } else {
                            const rm = xmlData.match(/result="([^"]+)"/);
                            const result = rm ? rm[1] : 'unknown';
                            if (result === 'kSuccess') { this._isDownloading = false; this._resolveSdkCmd(null, result); }
                            else if (result === 'kDownloadingFile') { this._resolveSdkCmd(null, 'kDownloadingFile'); }
                            else if (result === 'kDownloadFileFailed') { this._isDownloading = false; this._currentProgramHash = null; this._resolveSdkCmd(new Error(`SDK: ${result}`)); }
                            else { this._resolveSdkCmd(new Error(`SDK: ${result}`)); }
                        }
                    }
                }
                break;
            }
            case CMD.HEARTBEAT_ASK: {
                // 장비가 하트비트 요청 → 응답
                const pkt = Buffer.alloc(4);
                pkt.writeUInt16LE(4, 0);
                pkt.writeUInt16LE(CMD.HEARTBEAT_ANSWER, 2);
                try { this.socket.write(pkt); } catch(e) {}
                break;
            }
            case CMD.HEARTBEAT_ANSWER: break;
            default: break;
        }
    }

    _parseDeviceInfo(xmlData) {
        log('LED', `[${this.socketId}] GetDeviceInfo 원본 XML:\n${xmlData}`);
        const info = {};
        // 다양한 ID 필드 파싱 시도
        const idPatterns = [
            /<id[^>]*value="([^"]+)"/i,
            /cardId="([^"]+)"/i,
            /<cardId[^>]*value="([^"]+)"/i,
            /<serialNumber[^>]*value="([^"]+)"/i,
            /\bid="([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)"/i,
        ];
        for (const p of idPatterns) {
            const m = xmlData.match(p);
            if (m && m[1]) { info.id = m[1]; break; }
        }
        const wM = xmlData.match(/<screen[^>]*width="(\d+)"/);
        const hM = xmlData.match(/height="(\d+)"/);
        if (wM) info.screenWidth = parseInt(wM[1]);
        if (hM) info.screenHeight = parseInt(hM[1]);
        return info;
    }

    // ── 하트비트 ──
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.socket || this.socket.destroyed) return;
            const pkt = Buffer.alloc(4);
            pkt.writeUInt16LE(4, 0);
            pkt.writeUInt16LE(CMD.HEARTBEAT_ASK, 2);
            try { this.socket.write(pkt); } catch(e) {}
        }, 30000);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    // ── 정리 ──
    cleanup() {
        this.stopHeartbeat();
        this.sdkReady = false;
        if (this.socket && !this.socket.destroyed) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        this.socket = null;
    }
}



// ── 디바이스 레지스트리 (격리 핵심) ──
const activeSessions = new Map();   // deviceId → DeviceSession (식별 완료된 것만)
const socketSessions = new Map();   // socket → DeviceSession (모든 연결)
let knownDevices = [];              // DB에서 로드한 장비 목록

async function loadDevicesFromDB() {
    try {
        knownDevices = await dbQuery(`
            SELECT D.DEVICE_ID, D.USE_VENDOR AS VENDOR_CD, D.CONNECT_INFO, V.VENDOR_NM
            FROM TCM_DEVICEINFO D
            LEFT JOIN TCM_VENDOR V ON D.CORP_CD = V.CORP_CD AND D.USE_VENDOR = V.VENDOR_CD
            WHERE D.CORP_CD = ? AND D.USE_YN = 'Y'
        `, [CORP_CD]);
        log('INIT', `DB 장비 ${knownDevices.length}개 로드:`);
        knownDevices.forEach(d => log('INIT', `  📌 ${d.DEVICE_ID} → ${d.VENDOR_NM||'미지정'} (${d.VENDOR_CD||'-'})`));
    } catch (err) { logError('INIT', `장비 로드 실패: ${err.message}`); }
}

function findDeviceInDB(deviceId) {
    if (!deviceId) return null;
    const upper = deviceId.toUpperCase();
    return knownDevices.find(d => d.DEVICE_ID && d.DEVICE_ID.toUpperCase() === upper) || null;
}

// ── 소켓 연결 시 핸드셰이크 ──
async function handleNewConnection(socket) {
    const session = new DeviceSession(socket);
    socketSessions.set(socket, session);
    log('TCP', `[${session.socketId}] 장비 접속`);

    socket.on('data', (chunk) => {
        const s = socketSessions.get(socket);
        if (!s) return;
        s.recvBuffer = Buffer.concat([s.recvBuffer, chunk]);
        s.processRecvBuffer();
    });
    socket.on('error', (err) => logError('TCP', `[${session.socketId}] 소켓 에러: ${err.message}`));
    socket.on('close', () => {
        log('TCP', `[${session.label}] 연결 종료`);
        socketSessions.delete(socket);
        if (session.deviceId && activeSessions.get(session.deviceId) === session) {
            activeSessions.delete(session.deviceId);
            log('TCP', `[${session.label}] 활성 세션에서 제거됨`);
        }
        session.cleanup();
    });

    try {
        // 1. 버전 협상
        log('TCP', `[${session.socketId}] 버전 협상 시작...`);
        await session._negotiateVersion();
        log('TCP', `[${session.socketId}] 버전 협상 완료`);

        // 2. GUID 교환
        await session._exchangeGuid();
        log('TCP', `[${session.socketId}] GUID: ${session.guid}`);

        // 3. GetDeviceInfo → DEVICE_ID 추출
        log('TCP', `[${session.socketId}] GetDeviceInfo 요청...`);
        const info = await session.getDeviceInfo();
        if (info.screenWidth) session.screenWidth = info.screenWidth;
        if (info.screenHeight) session.screenHeight = info.screenHeight;
        log('TCP', `[${session.socketId}] 해상도: ${session.screenWidth}x${session.screenHeight}`);

        // 4. DB 매칭
        if (!info.id) {
            logError('TCP', `[${session.socketId}] ⚠️ DEVICE_ID 추출 실패. 위 XML 로그를 확인하세요.`);
            session.startHeartbeat();
            return;
        }

        const dbDevice = findDeviceInDB(info.id);
        if (!dbDevice) {
            logError('TCP', `[${session.socketId}] ⚠️ DEVICE_ID="${info.id}" → DB에 미등록/비활성 장비`);
            session.deviceId = info.id;
            session.startHeartbeat();
            return;
        }

        // 5. 세션 바인딩 (기존 세션 정리)
        session.deviceId = dbDevice.DEVICE_ID;
        session.vendorCd = dbDevice.VENDOR_CD;
        session.vendorNm = dbDevice.VENDOR_NM || dbDevice.VENDOR_CD;
        session.scheduler = new ScheduleManager();

        const oldSession = activeSessions.get(session.deviceId);
        if (oldSession && oldSession !== session) {
            log('TCP', `[${session.label}] 기존 세션 교체 (이전 소켓: ${oldSession.socketId})`);
            oldSession.cleanup();
            socketSessions.delete(oldSession.socket);
        }
        activeSessions.set(session.deviceId, session);
        session.startHeartbeat();
        session.sdkReady = true;

        log('TCP', `[${session.label}] ✅ 식별 완료: DEVICE_ID=${session.deviceId}, 거래처=${session.vendorNm}(${session.vendorCd})`);
        log('TCP', `[${session.label}] 현재 활성 세션: ${activeSessions.size}개`);

        // 6. 초기 콘텐츠 로드 (3초 대기 후)
        setTimeout(() => updateSession(session), 3000);

    } catch (err) {
        logError('TCP', `[${session.socketId}] 핸드셰이크 실패: ${err.message}`);
    }
}

// ── 세션별 콘텐츠 업데이트 ──
async function updateSession(session) {
    if (!session.sdkReady || !session.vendorCd) return;
    try {
        const files = await session.scheduler.getScheduledFiles(session.vendorCd);
        if (files.length === 0) return;

        const nullFiles = files.filter(f => !f.GENDER || f.GENDER === '');
        const mainVideoList = await filesToVideoList(nullFiles);
        if (mainVideoList.length === 0) { log('WARN', `[${session.label}] 공통 영상 없음`); return; }

        const maleFiles = files.filter(f => f.GENDER === 'M');
        const femaleFiles = files.filter(f => f.GENDER === 'F');
        const maleVideoList = await filesToVideoList(maleFiles);
        const femaleVideoList = await filesToVideoList(femaleFiles);

        const allUrls = [...mainVideoList, ...maleVideoList, ...femaleVideoList].map(v => v.url);
        const hash = crypto.createHash('md5').update(JSON.stringify(allUrls)).digest('hex');
        if (hash === session.lastSentHash) return;

        log('CTRL', `[${session.label}] 프로그램 갱신 → 총 ${allUrls.length}개 파일`);

        // 이전 파일 삭제
        if (session.previousFileUrls.length > 0) {
            const newSet = new Set(allUrls);
            const toDelete = session.previousFileUrls.filter(u => !newSet.has(u));
            if (toDelete.length > 0) await session.deleteFiles(toDelete);
        }

        const sw = mainVideoList[0]?.width || session.screenWidth || 128;
        const sh = mainVideoList[0]?.height || session.screenHeight || 64;
        session.resetProgramHash();
        const ok = await session.sendMultiplePrograms(mainVideoList, maleVideoList, femaleVideoList, sw, sh);
        if (ok) {
            session.lastSentHash = hash;
            session.previousFileUrls = allUrls;
            log('CTRL', `[${session.label}] ✅ 스케줄 송출 완료`);
        }
    } catch (err) { logError('CTRL', `[${session.label}] 업데이트 에러: ${err.message}`); }
}

// ── CCTV 성별 감지 함수 ──
async function getGenderedFiles(vendorCd, gender) {
    const now = new Date();
    const h = now.getHours(), dayCode = now.getDay().toString();
    const p = n => n.toString().padStart(2,'0');
    const today = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}`;
    const schRows = await dbQuery(`SELECT * FROM TCM_VENDOR_SCH WHERE CORP_CD=? AND VENDOR_CD=? AND DAY_SEC=? AND USE_YN='Y' AND ? BETWEEN START_DT AND END_DT ORDER BY REGISTDT DESC LIMIT 1`, [CORP_CD, vendorCd, dayCode, today]);
    if (schRows.length === 0) return { selectedGenderFile: null, nullFiles: [] };
    const schRow = schRows[0];
    let closestKey = null, minDiff = 999;
    for (let i = 0; i < 24; i++) {
        const ck = schRow[`SCH_${String(i).padStart(2,'0')}`];
        if (ck && String(ck).trim()) { const d = Math.abs(h-i); if (d < minDiff) { minDiff = d; closestKey = ck; } }
    }
    if (!closestKey) return { selectedGenderFile: null, nullFiles: [] };
    const fileRows = await dbQuery(`
        SELECT F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE, F.FILE_SIZE, F.FILE_MD5, F.GENDER,
               F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN, L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME
        FROM TCM_CONTENTS_LIST L JOIN TCM_CONTENTS_FILE F ON L.CORP_CD=F.CORP_CD AND L.FILE_KEY=F.FILE_KEY
        WHERE L.CORP_CD=? AND L.CONTENTS_KEY=? AND L.USE_YN='Y' AND F.USE_YN='Y' ORDER BY L.DISP_SEQ ASC
    `, [CORP_CD, closestKey]);
    const nullFiles = fileRows.filter(f => !f.GENDER || f.GENDER === '');
    const matching = fileRows.filter(f => f.GENDER === gender);
    let selectedGenderFile = null, selectedIndex = -1;
    if (matching.length > 0) { selectedIndex = Math.floor(Math.random() * matching.length); selectedGenderFile = matching[selectedIndex]; }
    return { selectedGenderFile, selectedIndex, nullFiles };
}

// ── 메인 ──
async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Reverse TCP LED Controller v1.0');
    console.log('  역커넥트 방식 · 디바이스별 세션 격리');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. 파일 서버
    const fileServerApp = startFileServer();

    // 2. DB 장비 로드
    await loadDevicesFromDB();
    setInterval(loadDevicesFromDB, 5 * 60 * 1000); // 5분마다 갱신

    // 3. TCP 서버 (역커넥트)
    const tcpServer = net.createServer((socket) => handleNewConnection(socket));
    tcpServer.listen(REVERSE_TCP_PORT, '0.0.0.0', () => {
        log('TCP', `🚀 역커넥트 서버 시작 → 0.0.0.0:${REVERSE_TCP_PORT}`);
        log('TCP', '장비 연결 대기 중...\n');
    });

    // 4. 스케줄 폴링
    let isPolling = false;
    setInterval(async () => {
        if (isPolling) return;
        isPolling = true;
        try { for (const [,s] of activeSessions) await updateSession(s); }
        finally { isPolling = false; }
    }, SCHEDULE_POLL_INTERVAL);
    log('MAIN', `스케줄 폴링 시작 (${SCHEDULE_POLL_INTERVAL/1000}초 간격)`);

    // 5. 즉시 반영 API
    fileServerApp.post('/api/push-content', async (req, res) => {
        const { vendorCodes, contentsId } = req.body;
        if (!vendorCodes || !Array.isArray(vendorCodes) || !contentsId) return res.status(400).json({ success: false, message: '파라미터 오류' });
        log('PUSH', `즉시 반영: 점포 ${vendorCodes.length}개, 콘텐츠=${contentsId}`);
        try {
            const fileRows = await dbQuery(`
                SELECT F.FILE_KEY,F.FILE_NAME,F.FTP_FILENAME,F.FILE_TITLE,F.FILE_SIZE,F.FILE_MD5,F.GENDER,
                       F.SCREEN_WIDTH,F.SCREEN_HEIGHT,F.ASPECTRATIO_YN,L.DISP_SEQ AS PLAY_SEQ,L.IMAGE_DELAY AS DELAY_TIME
                FROM TCM_CONTENTS_LIST L JOIN TCM_CONTENTS_FILE F ON L.CORP_CD=F.CORP_CD AND L.FILE_KEY=F.FILE_KEY
                WHERE L.CORP_CD=? AND L.CONTENTS_KEY=? AND L.USE_YN='Y' AND F.USE_YN='Y' ORDER BY L.DISP_SEQ ASC
            `, [CORP_CD, contentsId]);
            if (fileRows.length === 0) return res.json({ success: false, message: '파일 없음' });
            const nullFiles = fileRows.filter(f => !f.GENDER || f.GENDER === '');
            const mainVL = await filesToVideoList(nullFiles);
            if (mainVL.length === 0) return res.json({ success: false, message: '공통 영상 없음' });
            const maleVL = await filesToVideoList(fileRows.filter(f => f.GENDER === 'M'));
            const femaleVL = await filesToVideoList(fileRows.filter(f => f.GENDER === 'F'));
            const results = [];
            for (const vc of vendorCodes) {
                const session = [...activeSessions.values()].find(s => s.vendorCd === vc);
                if (!session) { results.push({ vendorCd: vc, status: 'NOT_FOUND' }); continue; }
                if (!session.sdkReady) { results.push({ vendorCd: vc, status: 'NOT_CONNECTED' }); continue; }
                try {
                    const allUrls = [...mainVL,...maleVL,...femaleVL].map(v=>v.url);
                    if (session.previousFileUrls.length > 0) {
                        const ns = new Set(allUrls);
                        const td = session.previousFileUrls.filter(u => !ns.has(u));
                        if (td.length > 0) await session.deleteFiles(td);
                    }
                    const sw = mainVL[0]?.width || session.screenWidth || 128;
                    const sh = mainVL[0]?.height || session.screenHeight || 64;
                    session.resetProgramHash();
                    const ok = await session.sendMultiplePrograms(mainVL, maleVL, femaleVL, sw, sh);
                    if (ok) { session.previousFileUrls = allUrls; results.push({ vendorCd: vc, vendorNm: session.vendorNm, status: 'SUCCESS' }); }
                    else results.push({ vendorCd: vc, status: 'FAILED' });
                } catch (err) { results.push({ vendorCd: vc, status: 'ERROR', message: err.message }); }
            }
            const sc = results.filter(r => r.status === 'SUCCESS').length;
            res.json({ success: sc > 0, message: `${sc}/${vendorCodes.length}개 완료`, results });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    });

    // 6. CCTV 성별 감지
    let cctvVendorMap = {};
    async function refreshCctvMap() {
        try {
            const rows = await dbQuery("SELECT DEVICE_SN, USE_VENDOR FROM TCM_CCTV WHERE CORP_CD=? AND USE_YN='Y'", [CORP_CD]);
            cctvVendorMap = {};
            rows.forEach(r => { if (r.DEVICE_SN && r.USE_VENDOR) cctvVendorMap[r.DEVICE_SN] = r.USE_VENDOR; });
            log('CCTV', `매핑 갱신: ${Object.keys(cctvVendorMap).length}개`);
        } catch (err) { logError('CCTV', `매핑 실패: ${err.message}`); }
    }
    await refreshCctvMap();
    setInterval(refreshCctvMap, 5 * 60 * 1000);

    const cctvApp = express();
    cctvApp.use(express.json({ limit: '50mb' }));
    const vendorRevertTimers = {};
    const cctvPrevCounts = {};

    cctvApp.post('/', async (req, res) => {
        res.status(200).json({ Status: "Success" });
        try {
            const metrics = req.body?.Metrics;
            if (!metrics?.Properties?.SerialNumber || !metrics?.ReportData?.RealTimeReport) return;
            const sn = metrics.Properties.SerialNumber;
            const vendorCd = cctvVendorMap[sn];
            if (!vendorCd) return;
            const report = metrics.ReportData.RealTimeReport;
            const objects = Array.isArray(report.Object) ? report.Object : [report.Object].filter(Boolean);
            const countObj = objects.find(o => o['@ObjectType'] === '1' && o.RealTimeCount);
            if (!countObj) return;
            const rc = countObj.RealTimeCount;
            const cm = parseInt(rc['@EntersMaleCustomer']||0,10), cf = parseInt(rc['@EntersFemaleCustomer']||0,10);
            const prev = cctvPrevCounts[sn] || { male: cm, female: cf };
            const dm = cm - prev.male, df = cf - prev.female;
            cctvPrevCounts[sn] = { male: cm, female: cf };
            if (dm <= 0 && df <= 0) return;
            if (dm === df) return;
            const gender = dm > df ? 'M' : 'F';
            const label = gender === 'M' ? '남성' : '여성';
            log('CCTV', `[SN:${sn}→${vendorCd}] ${label} 감지 (남:${dm} 여:${df})`);
            const session = [...activeSessions.values()].find(s => s.vendorCd === vendorCd);
            if (!session || !session.sdkReady) return;
            if (vendorRevertTimers[vendorCd]) { log('CCTV', `[${session.label}] ⏳ 재생 중 무시`); return; }
            const { selectedGenderFile, selectedIndex } = await getGenderedFiles(vendorCd, gender);
            if (!selectedGenderFile) return;
            const progGuid = gender === 'M' ? `prog_male_${selectedIndex}` : `prog_female_${selectedIndex}`;
            const gv = await filesToVideoList([selectedGenderFile]);
            const durMs = gv.length > 0 && gv[0].duration ? gv[0].duration : 10000;
            log('CCTV', `[${session.label}] ⚡ ${progGuid} 스위칭 (${durMs/1000}초)`);
            const ok = await session.switchProgram(progGuid);
            if (ok) {
                vendorRevertTimers[vendorCd] = setTimeout(async () => {
                    await session.switchProgram('prog_null');
                    log('CCTV', `[${session.label}] ✅ 공통 복귀`);
                    delete vendorRevertTimers[vendorCd];
                }, durMs);
            } else { delete vendorRevertTimers[vendorCd]; }
        } catch (err) { logError('CCTV', `처리 에러: ${err.message}`); }
    });
    cctvApp.get('/', (req, res) => res.send('CCTV Receiver Active'));
    cctvApp.listen(CCTV_PORT, '0.0.0.0', () => log('CCTV', `성별 감지 수신 → port ${CCTV_PORT}`));

    // 7. Graceful shutdown
    process.on('SIGINT', () => {
        log('MAIN', '종료 중...');
        for (const [,s] of activeSessions) s.cleanup();
        tcpServer.close();
        process.exit(0);
    });

    log('MAIN', '✅ Reverse TCP LED Controller 가동 완료\n');
}

main().catch(err => { logError('FATAL', err.message); process.exit(1); });
