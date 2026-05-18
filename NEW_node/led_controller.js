/**
 * LED 전광판 통신 컨트롤러 v2.0
 *
 * 다중 프로그램 + disabled 제어 테스트 버전
 *
 * 목표 동작:
 * 1. 초기/즉시반영 시 AddProgram 한 번으로 여러 프로그램을 일괄 등록
 *    - prog_null       : 공통 영상 3개, 활성 상태
 *    - prog_male_0~n   : 남성 영상 1개씩, disabled=true
 *    - prog_female_0~n : 여성 영상 1개씩, disabled=true
 *
 * 2. 평상시에는 prog_null만 상시 노출
 *
 * 3. 성별 감지 시:
 *    - 선택된 성별 프로그램만 UpdateProgram으로 disabled=false
 *    - SwitchProgram(선택된 성별 프로그램)
 *    - 영상 재생 시간 후 SwitchProgram(prog_null)
 *    - 선택된 성별 프로그램을 다시 UpdateProgram으로 disabled=true
 *
 * 원본 1:
 * - 원본 1은 별도 기준본으로 유지
 * - 원본 1은 DeleteAllProgram → AddProgram(prog_gender) → DeleteAllProgram → AddProgram(prog_null) 방식
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
const FILE_BASE_PATH = process.env.FILE_PATH || 'D:\\dayon_file';

const FILE_SERVER_PORT = parseInt(process.env.FILE_SERVER_PORT || '9090', 10);
const SCHEDULE_POLL_INTERVAL = 60000;

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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    console.error(`[${now}] [${tag}] X ${msg}`);
}

function escapeXmlAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const LOCAL_IP = process.env.FILE_SERVER_HOST || getLocalIp();

// ─────────────────────────────────────────────────────────────
// File Server
// ─────────────────────────────────────────────────────────────
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
// Huidu LED Client
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

        this._currentProgramHash = null;
    }

    start() {
        log('LED', `[${this.name}] 연결 시작...`);
        this._connect();
    }

    stop() {
        this._stopHeartbeat();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }

        this.connected = false;
        this.sdkReady = false;
    }

    isReady() {
        return this.connected && this.sdkReady;
    }

    resetProgramHash() {
        this._currentProgramHash = null;
    }

    // ─────────────────────────────────────────────────────────
    // File Control
    // ─────────────────────────────────────────────────────────

    async deleteFiles(fileUrls) {
        if (!this.sdkReady || !fileUrls || fileUrls.length === 0) return;

        try {
            const fileTags = fileUrls
                .map(url => `<file name="${escapeXmlAttr(url)}"/>`)
                .join('');

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="DeleteFiles">` +
                `<files>${fileTags}</files>` +
                `</in>` +
                `</sdk>`;

            const result = await this._sendSdkCommand(xml, 30000);
            log('LED', `[${this.name}] DeleteFiles 완료 (${fileUrls.length}개 파일)`);

            return result;
        } catch (err) {
            logError('LED', `[${this.name}] DeleteFiles 실패: ${err.message}`);
        }
    }

    async addFilesSequential(videoList) {
        if (!this.sdkReady || !videoList || videoList.length === 0) return true;

        const uniqueMap = new Map();

        for (const video of videoList) {
            if (!video || !video.name || !video.url || !video.size || !video.md5) continue;
            uniqueMap.set(video.name, video);
        }

        const uniqueVideos = Array.from(uniqueMap.values());

        if (uniqueVideos.length === 0) {
            return true;
        }

        let successCount = 0;

        for (let i = 0; i < uniqueVideos.length; i++) {
            const video = uniqueVideos[i];
            let ok = false;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const fileTag =
                        `<file type="video" size="${video.size}" md5="${video.md5}" ` +
                        `name="${escapeXmlAttr(video.name)}" remote="${escapeXmlAttr(video.url)}"/>`;

                    const xml =
                        `<?xml version="1.0" encoding="utf-8"?>` +
                        `<sdk guid="${this.guid}">` +
                        `<in method="AddFiles">` +
                        `<files>${fileTag}</files>` +
                        `</in>` +
                        `</sdk>`;

                    log('LED', `[${this.name}] AddFiles 순차 적재 ${i + 1}/${uniqueVideos.length} 시도(${attempt}/3): ${video.name}`);

                    await this._sendSdkCommand(xml, 180000);

                    log('LED', `[${this.name}] AddFiles 완료: ${video.name}`);

                    ok = true;
                    successCount++;
                    break;
                } catch (err) {
                    logError('LED', `[${this.name}] AddFiles 실패(${attempt}/3): ${video.name} / ${err.message}`);

                    if (attempt < 3) {
                        await sleep(5000);
                    }
                }
            }

            if (!ok) {
                logError('LED', `[${this.name}] AddFiles 최종 실패: ${video.name}`);
            }

            await sleep(3000);
        }

        log('LED', `[${this.name}] AddFiles 순차 적재 결과: ${successCount}/${uniqueVideos.length} 성공`);

        return successCount === uniqueVideos.length;
    }

    // ─────────────────────────────────────────────────────────
    // Program XML Builder
    // ─────────────────────────────────────────────────────────

    buildProgramXml(programGuid, videoList, screenWidth, screenHeight, options = {}) {
        const safeProgramGuid = programGuid || 'prog_null';
        const playOnce = options.playOnce === true;
        const disabled = options.disabled === true;

        const videoTags = videoList.map((vid, idx) => {
            const aspectRatio = vid.aspectRatio || 'false';
            const duration = vid.duration || 20000;

            return `<video guid="video-${safeProgramGuid}-${idx}" aspectRatio="${aspectRatio}">` +
                `<file name="${escapeXmlAttr(vid.url)}" size="${vid.size}" md5="${vid.md5}"/>` +
                `<playParams duration="${duration}"/>` +
                `</video>`;
        }).join('');

        /*
         * 테스트 핵심:
         * - 성별 프로그램은 count=1 + disabled=true로 등록
         * - 감지 시 해당 프로그램만 UpdateProgram으로 disabled=false
         * - 복귀 후 다시 disabled=true
         *
         * 공통 프로그램 prog_null은 playControl을 넣지 않는다.
         */
        const playControlXml = playOnce
            ? `<playControl count="1" disabled="${disabled ? 'true' : 'false'}"/>`
            : '';

        return `<program guid="${safeProgramGuid}" type="normal">` +
            playControlXml +
            `<area guid="area-${safeProgramGuid}" alpha="255">` +
            `<rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/>` +
            `<resources>${videoTags}</resources>` +
            `</area>` +
            `</program>`;
    }

    assignGenderProgramGuids(maleList, femaleList) {
        if (Array.isArray(maleList)) {
            maleList.forEach((video, idx) => {
                video.programGuid = `prog_male_${idx}`;
            });
        }

        if (Array.isArray(femaleList)) {
            femaleList.forEach((video, idx) => {
                video.programGuid = `prog_female_${idx}`;
            });
        }
    }

    // ─────────────────────────────────────────────────────────
    // Program Control
    // ─────────────────────────────────────────────────────────

    /**
     * 다중 프로그램 일괄 등록 + disabled 제어용 초기 등록.
     *
     * 등록 구조:
     * - prog_null      : 공통 영상 전체, 활성
     * - prog_male_n    : 남성 영상 1개씩, disabled=true
     * - prog_female_n  : 여성 영상 1개씩, disabled=true
     *
     * 이후 센서 감지는:
     * - UpdateProgram(selected, disabled=false)
     * - SwitchProgram(selected)
     * - SwitchProgram(prog_null)
     * - UpdateProgram(selected, disabled=true)
     */
    async sendMultiplePrograms(nullList, maleList, femaleList, screenWidth, screenHeight) {
        if (!this.sdkReady) {
            log('LED', `[${this.name}] SDK 미준비, 프로그램 전송 스킵`);
            return false;
        }

        if (!nullList || nullList.length === 0) {
            log('LED', `[${this.name}] 공통 영상(nullList)이 없어 프로그램 전송 불가`);
            return false;
        }

        this.assignGenderProgramGuids(maleList, femaleList);

        const allFiles = [
            ...(nullList || []),
            ...(maleList || []),
            ...(femaleList || [])
        ];

        const hashPayload = allFiles.map(v => ({
            url: v.url,
            md5: v.md5,
            programGuid: v.programGuid || 'prog_null'
        }));

        const hash = crypto.createHash('md5').update(JSON.stringify(hashPayload)).digest('hex');

        if (hash === this._currentProgramHash) {
            return true;
        }

        try {
            log('LED', `[${this.name}] 기존 프로그램 전체 삭제 (DeleteAllProgram) 진행`);

            const delXml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="DeleteAllProgram"></in>` +
                `</sdk>`;

            try {
                await this._sendSdkCommand(delXml, 5000);
            } catch (delErr) {
                log('LED', `[${this.name}] DeleteAllProgram 응답 오류. 무시하고 계속 진행: ${delErr.message}`);
            }

            const programXmlList = [];

            programXmlList.push(
                this.buildProgramXml(
                    'prog_null',
                    nullList,
                    screenWidth,
                    screenHeight,
                    { playOnce: false, disabled: false }
                )
            );

            if (Array.isArray(maleList)) {
                maleList.forEach(video => {
                    programXmlList.push(
                        this.buildProgramXml(
                            video.programGuid,
                            [video],
                            screenWidth,
                            screenHeight,
                            { playOnce: true, disabled: true }
                        )
                    );
                });
            }

            if (Array.isArray(femaleList)) {
                femaleList.forEach(video => {
                    programXmlList.push(
                        this.buildProgramXml(
                            video.programGuid,
                            [video],
                            screenWidth,
                            screenHeight,
                            { playOnce: true, disabled: true }
                        )
                    );
                });
            }

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="AddProgram">` +
                `<screen timeStamps="${Date.now()}">${programXmlList.join('')}</screen>` +
                `</in>` +
                `</sdk>`;

            log(
                'LED',
                `[${this.name}] 다중 프로그램 일괄 등록 시작 → ` +
                `prog_null 활성, 남성 ${(maleList || []).length}개 disabled, 여성 ${(femaleList || []).length}개 disabled`
            );

            await this._sendSdkCommand(xml, 300000);

            this._currentProgramHash = hash;

            log('LED', `[${this.name}] 다중 프로그램 일괄 등록 완료`);

            const switchOk = await this.switchProgram('prog_null', 10000);

            if (switchOk) {
                log('LED', `[${this.name}] 초기 재생 프로그램 prog_null 전환 완료`);
            } else {
                log('LED', `[${this.name}] 초기 SwitchProgram(prog_null) 실패. 기본 첫 프로그램 재생 상태로 진행`);
            }

            return true;
        } catch (err) {
            this._currentProgramHash = null;
            logError('LED', `[${this.name}] sendMultiplePrograms 실패: ${err.message}`);
            return false;
        }
    }

    async forcePlayProgram(videoList, programName, screenWidth, screenHeight, timeoutMs = 180000, useLocalFileName = false) {
        return await this.forcePlayProgramInternal(
            videoList,
            programName,
            screenWidth,
            screenHeight,
            true,
            timeoutMs,
            useLocalFileName
        );
    }

    async forcePlayProgramInternal(
        videoList,
        programName,
        screenWidth,
        screenHeight,
        deleteBefore,
        timeoutMs = 180000,
        useLocalFileName = false
    ) {
        if (!this.sdkReady) return false;
        if (!videoList || videoList.length === 0) return false;

        try {
            if (deleteBefore) {
                const delXml =
                    `<?xml version="1.0" encoding="utf-8"?>` +
                    `<sdk guid="${this.guid}">` +
                    `<in method="DeleteAllProgram"></in>` +
                    `</sdk>`;

                try {
                    log('LED', `[${this.name}] 강제 송출 전 기존 프로그램 삭제`);
                    await this._sendSdkCommand(delXml, 5000);
                } catch (delErr) {
                    log('LED', `[${this.name}] DeleteAllProgram 응답 오류. 무시하고 계속 진행: ${delErr.message}`);
                }
            }

            const safeProgramName = programName || 'prog_null';

            const videoTags = videoList.map((vid, idx) => {
                const aspectRatio = vid.aspectRatio || 'false';
                const duration = vid.duration || 20000;

                const fileTag = useLocalFileName
                    ? `<file name="${escapeXmlAttr(vid.name)}" md5="${vid.md5}"/>`
                    : `<file name="${escapeXmlAttr(vid.url)}" size="${vid.size}" md5="${vid.md5}"/>`;

                return `<video guid="video-${safeProgramName}-${idx}" aspectRatio="${aspectRatio}">` +
                    fileTag +
                    `<playParams duration="${duration}"/>` +
                    `</video>`;
            }).join('');

            const playControlXml = safeProgramName === 'prog_gender'
                ? `<playControl count="1" disabled="false"/>`
                : '';

            const programXml =
                `<program guid="${safeProgramName}" type="normal">` +
                playControlXml +
                `<area guid="area-${safeProgramName}" alpha="255">` +
                `<rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/>` +
                `<resources>${videoTags}</resources>` +
                `</area>` +
                `</program>`;

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="AddProgram">` +
                `<screen timeStamps="${Date.now()}">${programXml}</screen>` +
                `</in>` +
                `</sdk>`;

            const modeText = useLocalFileName ? '내부 파일명' : 'URL';
            const deleteText = deleteBefore ? '삭제 후' : '삭제 없이';

            log(
                'LED',
                `[${this.name}] AddProgram 송출 시작 → ${safeProgramName} / ` +
                `영상 ${videoList.length}개 / ${modeText} 방식 / ${deleteText}`
            );

            await this._sendSdkCommand(xml, timeoutMs);

            log('LED', `[${this.name}] AddProgram 송출 완료 → ${safeProgramName}`);

            return true;
        } catch (err) {
            const modeText = useLocalFileName ? '내부 파일명' : 'URL';
            logError('LED', `[${this.name}] forcePlayProgram 실패(${modeText} 방식): ${err.message}`);
            return false;
        }
    }

    /**
     * 성별 프로그램 disabled 상태 변경.
     *
     * disabled=false:
     *   성별 감지 시 선택된 프로그램만 활성화
     *
     * disabled=true:
     *   공통 복귀 후 다시 숨김
     */
    async updateGenderProgramDisabled(videoData, screenWidth, screenHeight, disabled) {
        if (!this.sdkReady) return false;
        if (!videoData || !videoData.programGuid) {
            logError('LED', `[${this.name}] updateGenderProgramDisabled 실패: programGuid 없음`);
            return false;
        }

        try {
            const programXml = this.buildProgramXml(
                videoData.programGuid,
                [videoData],
                screenWidth,
                screenHeight,
                { playOnce: true, disabled }
            );

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="UpdateProgram">` +
                programXml +
                `</in>` +
                `</sdk>`;

            log(
                'LED',
                `[${this.name}] UpdateProgram 성별 프로그램 ${disabled ? '비활성화' : '활성화'} 시도 → ` +
                `${videoData.programGuid} / ${videoData.name}`
            );

            await this._sendSdkCommand(xml, 60000);

            log(
                'LED',
                `[${this.name}] UpdateProgram 성별 프로그램 ${disabled ? '비활성화' : '활성화'} 완료 → ` +
                `${videoData.programGuid}`
            );

            return true;
        } catch (err) {
            logError(
                'LED',
                `[${this.name}] UpdateProgram 성별 프로그램 ${disabled ? '비활성화' : '활성화'} 실패 → ` +
                `${videoData.programGuid} / ${err.message}`
            );
            return false;
        }
    }

    /**
     * SwitchProgram 명령.
     */
    async switchProgram(progGuid, timeoutMs = 10000) {
        if (!this.sdkReady || !progGuid) return false;

        try {
            const swXml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="SwitchProgram">` +
                `<program guid="${progGuid}"/>` +
                `</in>` +
                `</sdk>`;

            log('LED', `[${this.name}] SwitchProgram 시도 → ${progGuid}`);

            await this._sendSdkCommand(swXml, timeoutMs);

            log('LED', `[${this.name}] SwitchProgram 완료 → ${progGuid}`);

            return true;
        } catch (err) {
            logError('LED', `[${this.name}] SwitchProgram 실패(${progGuid}): ${err.message}`);
            return false;
        }
    }

    /**
     * 성별 영상 전환.
     *
     * 단계:
     * 1. 선택된 성별 프로그램 disabled=false
     * 2. SwitchProgram(selected)
     */
    async switchPlayGenderVideo(videoData, screenWidth, screenHeight) {
        if (!videoData || !videoData.programGuid) {
            logError('LED', `[${this.name}] 성별 영상 programGuid 없음`);
            return false;
        }

        log('LED', `[${this.name}] 성별 프로그램 전환 플로우 시작 → ${videoData.programGuid}`);

        const enableOk = await this.updateGenderProgramDisabled(
            videoData,
            screenWidth,
            screenHeight,
            false
        );

        if (!enableOk) {
            logError('LED', `[${this.name}] 성별 프로그램 활성화 실패 → SwitchProgram 생략`);
            return false;
        }

        await sleep(500);

        const switchOk = await this.switchProgram(videoData.programGuid, 10000);

        if (!switchOk) {
            logError('LED', `[${this.name}] 성별 프로그램 SwitchProgram 실패`);
            return false;
        }

        return true;
    }

    /**
     * 공통 영상 복귀.
     *
     * 단계:
     * 1. SwitchProgram(prog_null)
     * 2. 선택된 성별 프로그램 disabled=true
     */
    async switchBackToCommonProgramAndDisableGender(videoData, screenWidth, screenHeight) {
        log('LED', `[${this.name}] 공통 복귀 플로우 시작 → SwitchProgram(prog_null)`);

        const switchOk = await this.switchProgram('prog_null', 10000);

        if (!switchOk) {
            logError('LED', `[${this.name}] 공통 복귀 SwitchProgram(prog_null) 실패`);
            return false;
        }

        await sleep(500);

        const disableOk = await this.updateGenderProgramDisabled(
            videoData,
            screenWidth,
            screenHeight,
            true
        );

        if (!disableOk) {
            logError('LED', `[${this.name}] 공통 복귀 후 성별 프로그램 비활성화 실패`);
            return false;
        }

        log('LED', `[${this.name}] 공통 복귀 플로우 완료 → prog_null + ${videoData.programGuid} disabled=true`);

        return true;
    }

    /**
     * 원본 1 방식 호환용.
     * 현재 disabled 테스트에서는 CCTV 감지부에서 직접 사용하지 않는다.
     */
    async forcePlaySingleVideo(videoData, screenWidth, screenHeight) {
        if (!videoData) return false;

        return await this.forcePlayProgramInternal(
            [videoData],
            'prog_gender',
            screenWidth,
            screenHeight,
            true,
            180000,
            false
        );
    }

    /**
     * 원본 1 방식 호환용.
     * 현재 disabled 테스트에서는 CCTV 감지부에서 직접 사용하지 않는다.
     */
    async forcePlayCommonVideos(commonVideoList, screenWidth, screenHeight) {
        if (!commonVideoList || commonVideoList.length === 0) return false;

        return await this.forcePlayProgramInternal(
            commonVideoList,
            'prog_null',
            screenWidth,
            screenHeight,
            true,
            300000,
            false
        );
    }

    // 기존 호환용. 현재 CCTV 성별 감지에는 사용하지 않음.
    async insertPlayVideo(videoData, screenWidth, screenHeight) {
        if (!this.sdkReady || !videoData) return false;

        try {
            const durationMs = videoData.duration || 20000;
            const durationSec = Math.max(1, Math.ceil(durationMs / 1000));
            const guidSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

            const progGuid = `insert_${guidSuffix}`;
            const areaGuid = `area_insert_${guidSuffix}`;
            const videoGuid = `video_insert_${guidSuffix}`;

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="InsertPlayProgram">` +
                `<insertProject timeMode="0" mode="0" duration="${durationSec}" enable="true" autoDelete="1" maxPlayCount="1">` +
                `<periodReles interval="1800" allDay="true" repeatPolicy="0" permanent="false"/>` +
                `</insertProject>` +
                `<screen timeStamps="${Date.now()}">` +
                `<program guid="${progGuid}" type="normal">` +
                `<area guid="${areaGuid}" alpha="255">` +
                `<rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/>` +
                `<resources>` +
                `<video guid="${videoGuid}" aspectRatio="${videoData.aspectRatio || 'false'}">` +
                `<file name="${escapeXmlAttr(videoData.name)}" md5="${videoData.md5}"/>` +
                `<playParams duration="${durationMs}"/>` +
                `</video>` +
                `</resources>` +
                `</area>` +
                `</program>` +
                `</screen>` +
                `</in>` +
                `</sdk>`;

            log('LED', `[${this.name}] InsertPlayProgram 요청 → ${videoData.name} (${durationSec}초)`);
            await this._sendSdkCommand(xml, 30000);
            log('LED', `[${this.name}] InsertPlayProgram 완료 → ${videoData.name}`);

            return true;
        } catch (err) {
            logError('LED', `[${this.name}] InsertPlayProgram 실패: ${err.message}`);
            return false;
        }
    }

    // 기존 호환용.
    async updateProgramVideos(progGuid, videoList, screenWidth, screenHeight, timeoutMs = 30000) {
        if (!this.sdkReady || !progGuid) return false;
        if (!videoList || videoList.length === 0) return false;

        try {
            const videoTags = videoList.map((vid, idx) => {
                const aspectRatio = vid.aspectRatio || 'false';
                const duration = vid.duration || 20000;

                return `<video guid="video-${progGuid}-${idx}" aspectRatio="${aspectRatio}">` +
                    `<file name="${escapeXmlAttr(vid.url)}" size="${vid.size}" md5="${vid.md5}"/>` +
                    `<playParams duration="${duration}"/>` +
                    `</video>`;
            }).join('');

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="${this.guid}">` +
                `<in method="UpdateProgram">` +
                `<program guid="${progGuid}" type="normal">` +
                `<area guid="area-${progGuid}" alpha="255">` +
                `<rectangle x="0" y="0" width="${screenWidth}" height="${screenHeight}"/>` +
                `<resources>${videoTags}</resources>` +
                `</area>` +
                `</program>` +
                `</in>` +
                `</sdk>`;

            await this._sendSdkCommand(xml, timeoutMs);
            log('LED', `[${this.name}] UpdateProgram 완료 → ${progGuid} / 영상 ${videoList.length}개`);

            return true;
        } catch (err) {
            logError('LED', `[${this.name}] UpdateProgram 실패(${progGuid}): ${err.message}`);
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────
    // Connection Flow
    // ─────────────────────────────────────────────────────────

    _connect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }

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

                log('LED', `[${this.name}] SDK 준비 완료`);
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

    _negotiateVersion() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._resolveVersion = null;
                reject(new Error('버전 협상 타임아웃'));
            }, 5000);

            this._resolveVersion = (err) => {
                clearTimeout(timeout);
                this._resolveVersion = null;

                if (err) reject(err);
                else resolve();
            };

            const packet = Buffer.alloc(8);
            packet.writeUInt16LE(8, 0);
            packet.writeUInt16LE(CMD.SDK_SERVICE_ASK, 2);
            packet.writeUInt32LE(LOCAL_TCP_VERSION, 4);

            this.socket.write(packet);
        });
    }

    _exchangeGuid() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._resolveGuid = null;
                reject(new Error('GUID 교환 타임아웃'));
            }, 5000);

            this._resolveGuid = (err, guid) => {
                clearTimeout(timeout);
                this._resolveGuid = null;

                if (err) reject(err);
                else {
                    this.guid = guid;
                    resolve();
                }
            };

            const xml =
                `<?xml version="1.0" encoding="utf-8"?>` +
                `<sdk guid="##GUID">` +
                `<in method="GetIFVersion">` +
                `<version value="1000000"/>` +
                `</in>` +
                `</sdk>`;

            this._sendSdkPacket(xml);
        });
    }

    _startHeartbeat() {
        this._stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            if (!this.connected) return;

            const packet = Buffer.alloc(4);
            packet.writeUInt16LE(4, 0);
            packet.writeUInt16LE(CMD.HEARTBEAT_ASK, 2);

            try {
                this.socket.write(packet);
            } catch (e) {
                // ignore
            }
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

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
            const timeout = setTimeout(() => {
                this._resolveSdkCmd = null;
                reject(new Error('SDK 명령 타임아웃'));
            }, timeoutMs);

            this._resolveSdkCmd = (err, result) => {
                clearTimeout(timeout);
                this._resolveSdkCmd = null;

                if (err) reject(err);
                else resolve(result);
            };

            this._sendSdkPacket(xmlString);
        });
    }

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
                    if (data.length >= 4) {
                        this._resolveVersion(null);
                    } else {
                        this._resolveVersion(new Error('잘못된 버전 응답'));
                    }
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
                if (data.length < 8) break;

                const xmlData = data.slice(8).toString('utf-8');

                if (this._resolveGuid) {
                    const guidMatch = xmlData.match(/guid="([^"]+)"/);

                    if (guidMatch && guidMatch[1]) {
                        this._resolveGuid(null, guidMatch[1]);
                    } else {
                        this._resolveGuid(new Error('GUID 파싱 실패'));
                    }

                    break;
                }

                const resultMatch = xmlData.match(/result="([^"]+)"/);
                let result = resultMatch ? resultMatch[1] : 'unknown';

                if (result === 'unknown' && xmlData.includes('method="DeleteAllProgram"')) {
                    result = 'kSuccess';
                }

                if (result === 'kSuccess') {
                    log('LED', `[${this.name}] SDK 명령 성공`);

                    if (this._resolveSdkCmd) {
                        this._resolveSdkCmd(null, result);
                    }
                } else if (result === 'kDownloadingFile' || result === 'kProcessing') {
                    log('LED', `[${this.name}] SDK 처리 중: ${result}`);
                } else {
                    this._currentProgramHash = null;

                    const msg = `SDK 응답 실패: ${result} / XML=${xmlData}`;
                    logError('LED', `[${this.name}] ${msg}`);

                    if (this._resolveSdkCmd) {
                        this._resolveSdkCmd(new Error(msg));
                    }
                }

                break;
            }

            case CMD.HEARTBEAT_ANSWER:
                break;

            default:
                break;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Schedule Manager
// ─────────────────────────────────────────────────────────────
class ScheduleManager {
    constructor() {
        this._lastHour = -1;
        this._currentContentsKey = null;
        this._currentFileList = [];
    }

    async getScheduledFiles(vendorCd) {
        const now = new Date();
        const currentHour = now.getHours();
        const dayOfWeek = now.getDay().toString();

        const p = (n) => n.toString().padStart(2, '0');
        const today = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;

        const schColumn = `SCH_${String(currentHour).padStart(2, '0')}`;

        try {
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

            if (!contentsKey || contentsKey === '') {
                log('SCHEDULE', `[${vendorCd}] ${currentHour}시 스케줄 비어있음 → 재생 없음`);

                this._currentContentsKey = null;
                this._currentFileList = [];
                return [];
            }

            if (
                currentHour === this._lastHour &&
                contentsKey === this._currentContentsKey &&
                this._currentFileList.length > 0
            ) {
                return this._currentFileList;
            }

            log('SCHEDULE', `[${vendorCd}] CONTENTS_KEY=${contentsKey} → 전체 파일 목록 조회 중`);

            const fileRows = await dbQuery(`
                SELECT
                    F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                    F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                    F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN,
                    L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME,
                    L.USE_YN
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F
                  ON L.CORP_CD = F.CORP_CD
                 AND L.FILE_KEY = F.FILE_KEY
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
            return this._currentFileList;
        }
    }

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
    console.log('  다중 프로그램 + disabled 제어 테스트');
    console.log('═══════════════════════════════════════════════════════════');
    console.log();

    const fileServerApp = startFileServer();

    log('INIT', 'DB 연결 및 장비 조회 중...');

    let targetVendors;

    try {
        targetVendors = await dbQuery(`
            SELECT DISTINCT
                D.USE_VENDOR AS VENDOR_CD,
                V.VENDOR_NM,
                D.DEVICE_ID,
                D.CONNECT_INFO
            FROM TCM_DEVICEINFO D
            JOIN TCM_VENDOR V
              ON D.CORP_CD = V.CORP_CD
             AND D.USE_VENDOR = V.VENDOR_CD
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
        log('INIT', `  - ${v.VENDOR_NM} (${v.VENDOR_CD}) → 장비: ${v.DEVICE_ID} → LED: ${v.CONNECT_INFO}`);
    });

    console.log();

    const controllers = targetVendors.map(vendor => {
        let ledIp;
        let ledPort;

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
            previousFileUrls: [],
            screenWidth: 128,
            screenHeight: 64,
            activeNullVideoList: [],
            activeMaleVideoList: [],
            activeFemaleVideoList: []
        };
    });

    controllers.forEach(c => c.ledClient.start());

    // ─────────────────────────────────────────────────────────
    // File Metadata
    // ─────────────────────────────────────────────────────────
    const fileMetaCache = {};

    async function getFileMeta(filename, filePath) {
        try {
            const stats = fs.statSync(filePath);
            const mtime = stats.mtime.getTime();

            if (fileMetaCache[filename] && fileMetaCache[filename].mtime === mtime) {
                return fileMetaCache[filename];
            }

            log('FILE', `  [${filename}] MD5 계산 시작... (크기: ${Math.round(stats.size / 1024 / 1024)}MB)`);

            const md5 = await new Promise((resolve, reject) => {
                const hash = crypto.createHash('md5');
                const stream = fs.createReadStream(filePath);

                stream.on('data', data => hash.update(data));
                stream.on('error', reject);
                stream.on('end', () => resolve(hash.digest('hex')));
            });

            const meta = {
                size: stats.size,
                md5,
                mtime
            };

            fileMetaCache[filename] = meta;

            log('FILE', `  [${filename}] MD5 계산 완료: ${md5.substring(0, 8)}...`);
            return meta;
        } catch (err) {
            logError('FILE', `  [${filename}] 메타데이터 획득 실패: ${err.message}`);
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
                duration: (f.DELAY_TIME || 20) * 1000,
                width: f.SCREEN_WIDTH,
                height: f.SCREEN_HEIGHT,
                aspectRatio: f.ASPECTRATIO_YN === 'Y' ? 'true' : 'false',
                programGuid: null
            });
        }

        return videoList;
    }

    // ─────────────────────────────────────────────────────────
    // Push API
    // ─────────────────────────────────────────────────────────
    fileServerApp.post('/api/push-content', async (req, res) => {
        const { vendorCodes, contentsId } = req.body;

        if (!vendorCodes || !Array.isArray(vendorCodes) || vendorCodes.length === 0) {
            return res.status(400).json({
                success: false,
                message: '대상 점포를 선택해주세요.'
            });
        }

        if (!contentsId) {
            return res.status(400).json({
                success: false,
                message: '콘텐츠를 선택해주세요.'
            });
        }

        log('PUSH-API', `즉시 반영 요청: 점포 ${vendorCodes.length}개, 콘텐츠=${contentsId}`);

        try {
            const fileRows = await dbQuery(`
                SELECT
                    F.FILE_KEY, F.FILE_NAME, F.FTP_FILENAME, F.FILE_TITLE,
                    F.FILE_SIZE, F.FILE_MD5, F.GENDER,
                    F.SCREEN_WIDTH, F.SCREEN_HEIGHT, F.ASPECTRATIO_YN,
                    L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME,
                    L.USE_YN
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F
                  ON L.CORP_CD = F.CORP_CD
                 AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ?
                  AND L.CONTENTS_KEY = ?
                  AND L.USE_YN = 'Y'
                  AND F.USE_YN = 'Y'
                ORDER BY L.DISP_SEQ ASC
            `, [CORP_CD, contentsId]);

            if (fileRows.length === 0) {
                return res.json({
                    success: false,
                    message: '해당 콘텐츠에 송출 가능한 파일이 없습니다.'
                });
            }

            const nullFiles = fileRows.filter(f => !f.GENDER || f.GENDER === '');
            const maleFiles = fileRows.filter(f => f.GENDER === 'M');
            const femaleFiles = fileRows.filter(f => f.GENDER === 'F');
            const genderFiles = fileRows.filter(f => f.GENDER && f.GENDER !== '');

            const mainVideoList = await filesToVideoList(nullFiles);
            const cacheVideoList = await filesToVideoList(genderFiles);
            const maleVideoList = await filesToVideoList(maleFiles);
            const femaleVideoList = await filesToVideoList(femaleFiles);

            if (mainVideoList.length === 0) {
                return res.json({
                    success: false,
                    message: '송출할 공통 대상 영상(Main)이 없습니다.'
                });
            }

            log('PUSH-API', `즉시 반영 준비: 메인 ${mainVideoList.length}개, 남성 ${maleVideoList.length}개, 여성 ${femaleVideoList.length}개`);

            const results = [];

            for (const vendorCd of vendorCodes) {
                const ctrl = controllers.find(c => c.vendorCd === vendorCd);

                if (!ctrl) {
                    results.push({
                        vendorCd,
                        vendorNm: vendorCd,
                        status: 'NOT_FOUND',
                        message: '등록된 LED 장비 없음'
                    });
                    continue;
                }

                if (!ctrl.ledClient.isReady()) {
                    results.push({
                        vendorCd,
                        vendorNm: ctrl.vendorNm,
                        status: 'NOT_CONNECTED',
                        message: 'LED 장비 연결 안됨'
                    });
                    continue;
                }

                try {
                    const allCurrentUrls = [...mainVideoList, ...cacheVideoList].map(v => v.url);

                    if (ctrl.previousFileUrls.length > 0) {
                        const newFileUrls = new Set(allCurrentUrls);
                        const toDelete = ctrl.previousFileUrls.filter(url => !newFileUrls.has(url));

                        if (toDelete.length > 0) {
                            log('PUSH-API', `[${ctrl.vendorNm}] 불필요 파일 ${toDelete.length}개 삭제`);
                            await ctrl.ledClient.deleteFiles(toDelete);
                        }
                    }

                    const screenWidth = mainVideoList[0]?.width || 128;
                    const screenHeight = mainVideoList[0]?.height || 64;

                    ctrl.ledClient.resetProgramHash();

                    const ok = await ctrl.ledClient.sendMultiplePrograms(
                        mainVideoList,
                        maleVideoList,
                        femaleVideoList,
                        screenWidth,
                        screenHeight
                    );

                    if (ok) {
                        ctrl.previousFileUrls = allCurrentUrls;
                        ctrl.lastSentHash = crypto.createHash('md5').update(JSON.stringify(allCurrentUrls)).digest('hex');
                        ctrl.screenWidth = screenWidth;
                        ctrl.screenHeight = screenHeight;
                        ctrl.activeNullVideoList = mainVideoList;
                        ctrl.activeMaleVideoList = maleVideoList;
                        ctrl.activeFemaleVideoList = femaleVideoList;

                        results.push({
                            vendorCd,
                            vendorNm: ctrl.vendorNm,
                            status: 'SUCCESS',
                            message: '송출 완료'
                        });

                        log('PUSH-API', `[${ctrl.vendorNm}] 즉시 반영 성공 (다중 프로그램 disabled 등록 완료)`);
                    } else {
                        results.push({
                            vendorCd,
                            vendorNm: ctrl.vendorNm,
                            status: 'FAILED',
                            message: '송출 실패'
                        });
                    }
                } catch (err) {
                    logError('PUSH-API', `[${ctrl.vendorNm}] 송출 에러: ${err.message}`);

                    results.push({
                        vendorCd,
                        vendorNm: ctrl.vendorNm,
                        status: 'ERROR',
                        message: err.message
                    });
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

            res.status(500).json({
                success: false,
                message: err.message
            });
        }
    });

    log('MAIN', `즉시 반영 API 등록 완료 (POST /api/push-content)`);
    console.log();

    // ─────────────────────────────────────────────────────────
    // Controller Update
    // ─────────────────────────────────────────────────────────
    async function updateController(ctrl) {
        if (!ctrl.ledClient.isReady()) return;

        try {
            const files = await ctrl.scheduler.getScheduledFiles(ctrl.vendorCd);
            if (files.length === 0) return;

            const nullFiles = files.filter(f => !f.GENDER || f.GENDER === '');
            const maleFiles = files.filter(f => f.GENDER === 'M');
            const femaleFiles = files.filter(f => f.GENDER === 'F');
            const genderFiles = files.filter(f => f.GENDER && f.GENDER !== '');

            const mainVideoList = await filesToVideoList(nullFiles);
            const cacheVideoList = await filesToVideoList(genderFiles);
            const maleVideoList = await filesToVideoList(maleFiles);
            const femaleVideoList = await filesToVideoList(femaleFiles);

            if (mainVideoList.length === 0) {
                log('WARN', `[${ctrl.vendorNm}] 송출할 공통 대상 영상(Main)이 없습니다.`);
                return;
            }

            const allCurrentUrls = [...mainVideoList, ...cacheVideoList].map(v => v.url);

            const programHash = crypto.createHash('md5')
                .update(JSON.stringify(allCurrentUrls))
                .digest('hex');

            if (programHash === ctrl.lastSentHash) {
                return;
            }

            log('CTRL', `[${ctrl.vendorNm}] === 프로그램 갱신 감지 → 다중 프로그램 disabled 등록 시작 (총 ${allCurrentUrls.length}개) ===`);

            if (ctrl.previousFileUrls.length > 0) {
                const newFileUrls = new Set(allCurrentUrls);
                const toDelete = ctrl.previousFileUrls.filter(url => !newFileUrls.has(url));

                if (toDelete.length > 0) {
                    log('CTRL', `[${ctrl.vendorNm}] 불필요 찌꺼기 파일 ${toDelete.length}개 삭제 중...`);
                    await ctrl.ledClient.deleteFiles(toDelete);
                } else {
                    log('CTRL', `[${ctrl.vendorNm}] 기존 파일 전부 재사용 → 삭제 스킵`);
                }
            }

            const screenWidth = mainVideoList[0]?.width || 128;
            const screenHeight = mainVideoList[0]?.height || 64;

            ctrl.ledClient.resetProgramHash();

            const result = await ctrl.ledClient.sendMultiplePrograms(
                mainVideoList,
                maleVideoList,
                femaleVideoList,
                screenWidth,
                screenHeight
            );

            if (result) {
                ctrl.lastSentHash = programHash;
                ctrl.previousFileUrls = allCurrentUrls;
                ctrl.screenWidth = screenWidth;
                ctrl.screenHeight = screenHeight;
                ctrl.activeNullVideoList = mainVideoList;
                ctrl.activeMaleVideoList = maleVideoList;
                ctrl.activeFemaleVideoList = femaleVideoList;

                log('CTRL', `[${ctrl.vendorNm}] 자동 스케줄 송출 완료`);
            }
        } catch (err) {
            logError('CTRL', `[${ctrl.vendorNm}] 업데이트 에러: ${err.message}`);
        }
    }

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

    setTimeout(async () => {
        log('MAIN', '초기 콘텐츠 로드 시작...');

        for (const ctrl of controllers) {
            await updateController(ctrl);
        }
    }, 5000);

    // ─────────────────────────────────────────────────────────
    // CCTV Gender Receiver
    // ─────────────────────────────────────────────────────────
    const CCTV_PORT = parseInt(process.env.CCTV_RECEIVER_PORT || '2016', 10);

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

    const cctvApp = express();
    cctvApp.use(express.json({ limit: '50mb' }));

    const vendorPlayLocks = {};
    const cctvPreviousCounts = {};

    cctvApp.post('/', async (req, res) => {
        res.status(200).json({ Status: 'Success' });

        try {
            const metrics = req.body?.Metrics;
            if (!metrics?.Properties?.SerialNumber) return;
            if (!metrics?.ReportData?.RealTimeReport) return;

            const serialNumber = metrics.Properties.SerialNumber;

            const reqIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const cleanIp = reqIp ? reqIp.replace(/^.*:/, '') : '';

            const vendorCd = cctvVendorMap[serialNumber] || cctvVendorMap[cleanIp];

            if (!vendorCd) {
                return;
            }

            const report = metrics.ReportData.RealTimeReport;
            const objects = Array.isArray(report.Object)
                ? report.Object
                : [report.Object].filter(Boolean);

            const countObj = objects.find(o => o['@ObjectType'] === '1' && o.RealTimeCount);
            if (!countObj) return;

            const rc = countObj.RealTimeCount;

            const currentTotalMale = parseInt(rc['@EntersMaleCustomer'] || 0, 10);
            const currentTotalFemale = parseInt(rc['@EntersFemaleCustomer'] || 0, 10);

            const prev = cctvPreviousCounts[serialNumber] || {
                male: currentTotalMale,
                female: currentTotalFemale
            };

            const deltaMale = currentTotalMale - prev.male;
            const deltaFemale = currentTotalFemale - prev.female;

            cctvPreviousCounts[serialNumber] = {
                male: currentTotalMale,
                female: currentTotalFemale
            };

            if (deltaMale <= 0 && deltaFemale <= 0) return;
            if (deltaMale === deltaFemale) return;

            const dominantGender = deltaMale > deltaFemale ? 'M' : 'F';
            const genderLabel = dominantGender === 'M' ? '남성' : '여성';

            log('CCTV', `[SN:${serialNumber}→${vendorCd}] ${genderLabel} 지나감 감지 (새로 들어온 인원 - 남:${deltaMale} 여:${deltaFemale})`);

            const ctrl = controllers.find(c => c.vendorCd === vendorCd);

            if (!ctrl || !ctrl.ledClient.isReady()) {
                return;
            }

            if (vendorPlayLocks[vendorCd]) {
                log('CCTV', `[${ctrl.vendorNm}] 성별 영상 송출 중이므로 센서 이벤트 무시`);
                return;
            }

            const targetList = dominantGender === 'M'
                ? ctrl.activeMaleVideoList
                : ctrl.activeFemaleVideoList;

            if (!targetList || targetList.length === 0) {
                log('CCTV', `[${ctrl.vendorNm}] ${genderLabel} 타겟 영상 목록이 아직 준비되지 않음 → 이벤트 무시`);
                return;
            }

            const selectedIndex = Math.floor(Math.random() * targetList.length);
            const videoData = targetList[selectedIndex];

            if (!videoData || !videoData.programGuid) {
                log('CCTV', `[${ctrl.vendorNm}] 선택된 ${genderLabel} 영상 programGuid 없음 → 이벤트 무시`);
                return;
            }

            const screenWidth = ctrl.screenWidth || videoData.width || 128;
            const screenHeight = ctrl.screenHeight || videoData.height || 64;
            const playDurationMs = videoData.duration || 20000;

            log(
                'CCTV',
                `[${ctrl.vendorNm}] disabled 제어 성별 영상 전환 시도 → ` +
                `${videoData.programGuid} / ${videoData.name}`
            );

            vendorPlayLocks[vendorCd] = true;

            const ok = await ctrl.ledClient.switchPlayGenderVideo(
                videoData,
                screenWidth,
                screenHeight
            );

            if (ok) {
                log('CCTV', `[${ctrl.vendorNm}] ${genderLabel} 성별 영상 활성화+SwitchProgram 완료 (${playDurationMs / 1000}초 후 prog_null 복귀 예정)`);

                setTimeout(async () => {
                    try {
                        log('CCTV', `[${ctrl.vendorNm}] 성별 영상 재생 종료 → prog_null 복귀 및 성별 프로그램 비활성화 시작`);

                        const restoreOk = await ctrl.ledClient.switchBackToCommonProgramAndDisableGender(
                            videoData,
                            screenWidth,
                            screenHeight
                        );

                        if (restoreOk) {
                            log('CCTV', `[${ctrl.vendorNm}] prog_null 복귀 + 성별 프로그램 disabled=true 완료`);
                        } else {
                            log('CCTV', `[${ctrl.vendorNm}] prog_null 복귀 또는 성별 프로그램 비활성화 실패`);
                        }
                    } catch (restoreErr) {
                        logError('CCTV', `[${ctrl.vendorNm}] 복귀 플로우 중 오류: ${restoreErr.message}`);
                    } finally {
                        delete vendorPlayLocks[vendorCd];
                        log('CCTV', `[${ctrl.vendorNm}] 이벤트 잠금 해제`);
                    }
                }, playDurationMs + 1000);
            } else {
                delete vendorPlayLocks[vendorCd];
                log('CCTV', `[${ctrl.vendorNm}] disabled 제어 성별 영상 전환 실패`);
            }
        } catch (err) {
            logError('CCTV', `처리 에러: ${err.message}`);
        }
    });

    cctvApp.get('/', (req, res) => res.send('CCTV Gender Receiver Active'));

    cctvApp.listen(CCTV_PORT, '0.0.0.0', () => {
        log('CCTV', `성별 감지 수신 서버 시작 → port ${CCTV_PORT}`);
    });

    await refreshCctvVendorMap();
    setInterval(refreshCctvVendorMap, 5 * 60 * 1000);

    // ─────────────────────────────────────────────────────────
    // Graceful Shutdown
    // ─────────────────────────────────────────────────────────
    process.on('SIGINT', () => {
        log('MAIN', '종료 중...');

        controllers.forEach(c => c.ledClient.stop());
        db.end();

        process.exit(0);
    });

    log('MAIN', 'LED 컨트롤러 가동 완료 (다중 프로그램 + disabled 제어 테스트)');
    console.log();
}

// 실행
main().catch(err => {
    logError('FATAL', err.message);
    process.exit(1);
});