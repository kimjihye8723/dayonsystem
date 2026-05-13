/**
 * LED 보드 내부 상태 진단 스크립트
 * - GetProgram:               보드에 실제로 적재된 프로그램 목록 조회
 * - GetCurrentPlayProgramGUID: 현재 실제로 재생 중인 프로그램 GUID 조회
 * - GetFiles:                 보드에 저장된 파일 목록 조회
 *
 * 실행: node led_diag_check.js
 */

const net = require('net');

// ── 접속 정보 (롯데시연 장비) ──────────────────────
const TARGET_IP   = '223.171.64.228';
const TARGET_PORT = 7003;
const TCP_VERSION = 0x1000007;

// ── 커맨드 코드 ────────────────────────────────────
const CMD = {
    HEARTBEAT_ASK:     0x005f,
    HEARTBEAT_ANSWER:  0x0060,
    SDK_SERVICE_ASK:   0x2001,
    SDK_SERVICE_ANSWER:0x2002,
    ERROR_ANSWER:      0x2000,
    SDK_CMD_ASK:       0x2003,
    SDK_CMD_ANSWER:    0x2004,
};

// ── 상태 ───────────────────────────────────────────
let guid = null;
let recvBuffer = Buffer.alloc(0);
let resolveVersion = null;
let resolveGuid = null;
let resolveSdkCmd = null;

function log(msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.log(`[${t}] ${msg}`);
}

// ── 패킷 파싱 ──────────────────────────────────────
function processBuffer(socket) {
    while (recvBuffer.length >= 2) {
        const len = recvBuffer.readUInt16LE(0);
        if (recvBuffer.length < len) break;
        const cmd  = recvBuffer.readUInt16LE(2);
        const data = recvBuffer.slice(4, len);
        recvBuffer = recvBuffer.slice(len);
        handlePacket(cmd, data);
    }
}

function handlePacket(cmd, data) {
    switch (cmd) {
        case CMD.SDK_SERVICE_ANSWER:
            if (resolveVersion) { resolveVersion(null); resolveVersion = null; }
            break;
        case CMD.ERROR_ANSWER: {
            const code = data.length >= 2 ? data.readUInt16LE(0) : -1;
            log(`❌ 에러 코드: ${code}`);
            if (resolveVersion)  { resolveVersion(new Error(`에러:${code}`));  resolveVersion  = null; }
            if (resolveGuid)     { resolveGuid(new Error(`에러:${code}`));     resolveGuid     = null; }
            if (resolveSdkCmd)   { resolveSdkCmd(new Error(`에러:${code}`));   resolveSdkCmd   = null; }
            break;
        }
        case CMD.SDK_CMD_ANSWER: {
            if (data.length >= 8) {
                const xmlData = data.slice(8).toString('utf-8');
                if (resolveGuid) {
                    const m = xmlData.match(/guid="([^"]+)"/);
                    if (m) { resolveGuid(null, m[1]); } else { resolveGuid(new Error('GUID 파싱 실패')); }
                    resolveGuid = null;
                } else if (resolveSdkCmd) {
                    resolveSdkCmd(null, xmlData);
                    resolveSdkCmd = null;
                }
            }
            break;
        }
        case CMD.HEARTBEAT_ANSWER: break;
        default: break;
    }
}

// ── 패킷 전송 ──────────────────────────────────────
function sendSdkPacket(socket, xmlString) {
    const xmlBuf = Buffer.from(xmlString, 'utf-8');
    const xmlLen = xmlBuf.length;
    const len    = 2 + 4 + 4 + xmlLen;
    const pkt    = Buffer.alloc(2 + len);
    pkt.writeUInt16LE(len + 2, 0);
    pkt.writeUInt16LE(CMD.SDK_CMD_ASK, 2);
    pkt.writeUInt32LE(xmlLen, 4);
    pkt.writeUInt32LE(0, 8);
    xmlBuf.copy(pkt, 12);
    socket.write(pkt);
}

function sendSdkCommand(socket, xmlString, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            resolveSdkCmd = null;
            reject(new Error('SDK 명령 타임아웃'));
        }, timeoutMs);
        resolveSdkCmd = (err, result) => {
            clearTimeout(timer);
            resolveSdkCmd = null;
            if (err) reject(err); else resolve(result);
        };
        sendSdkPacket(socket, xmlString);
    });
}

// ── XML 예쁘게 출력 ───────────────────────────────
function prettyXml(xml) {
    try {
        return xml
            .replace(/></g, '>\n<')
            .split('\n')
            .map(l => '  ' + l)
            .join('\n');
    } catch { return xml; }
}

// ── 메인 ──────────────────────────────────────────
async function main() {
    console.log('══════════════════════════════════════════');
    console.log('  LED 보드 내부 상태 진단 도구');
    console.log(`  대상: ${TARGET_IP}:${TARGET_PORT}`);
    console.log('══════════════════════════════════════════\n');

    const socket = new net.Socket();

    socket.on('data', (chunk) => {
        recvBuffer = Buffer.concat([recvBuffer, chunk]);
        processBuffer(socket);
    });
    socket.on('error', (err) => { log(`소켓 에러: ${err.message}`); process.exit(1); });
    socket.on('close', () => { log('연결 종료.'); });

    // 1. TCP 연결
    await new Promise((resolve, reject) => {
        socket.connect(TARGET_PORT, TARGET_IP, () => { log('✅ TCP 연결 성공'); resolve(); });
        socket.once('error', reject);
    });

    // 2. 버전 협상
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('버전협상 타임아웃')), 5000);
        resolveVersion = (err) => { clearTimeout(timer); if (err) reject(err); else resolve(); };
        const pkt = Buffer.alloc(8);
        pkt.writeUInt16LE(8, 0);
        pkt.writeUInt16LE(CMD.SDK_SERVICE_ASK, 2);
        pkt.writeUInt32LE(TCP_VERSION, 4);
        socket.write(pkt);
    });
    log('✅ 버전 협상 완료');

    // 3. GUID 획득
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('GUID 타임아웃')), 5000);
        resolveGuid = (err, g) => { clearTimeout(timer); if (err) reject(err); else { guid = g; resolve(); } };
        const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="##GUID"><in method="GetIFVersion"><version value="1000000"/></in></sdk>`;
        sendSdkPacket(socket, xml);
    });
    log(`✅ GUID 획득: ${guid}\n`);

    // ──────────────────────────────────────────────
    // 4. 현재 재생 중인 프로그램 GUID 조회
    // ──────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📺 [1] 현재 재생 중인 프로그램 GUID');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
        const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="GetCurrentPlayProgramGUID"/></sdk>`;
        const result = await sendSdkCommand(socket, xml);
        // GUID 추출
        const m = result.match(/guid="([^"]+)"/);
        const currentGuid = m ? m[1] : '(파싱 실패)';
        console.log(`  현재 재생 중: "${currentGuid}"`);
        if (currentGuid === 'prog_null')   console.log('  → 🟢 정상: 기본(공통) 채널 재생 중');
        else if (currentGuid.startsWith('prog_male'))   console.log('  → 🔵 남성 채널 재생 중');
        else if (currentGuid.startsWith('prog_female')) console.log('  → 🔴 여성 채널 재생 중');
        else console.log('  → ⚠️  알 수 없는 채널');
        console.log();
    } catch (err) {
        console.log(`  ❌ 조회 실패: ${err.message}\n`);
    }

    // ──────────────────────────────────────────────
    // 5. 보드에 적재된 전체 프로그램 목록 조회
    // ──────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 [2] 보드에 적재된 전체 프로그램 목록 (GetProgram)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
        const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="GetProgram"/></sdk>`;
        const result = await sendSdkCommand(socket, xml, 20000);
        // 프로그램 GUID 목록 추출
        const programGuids = [...result.matchAll(/program[^>]*guid="([^"]+)"/g)].map(m => m[1]);
        if (programGuids.length === 0) {
            console.log('  ⚠️  적재된 프로그램 없음 (보드가 비어있음!)\n');
        } else {
            console.log(`  총 ${programGuids.length}개 프로그램 적재됨:`);
            programGuids.forEach(g => {
                let tag = '';
                if (g === 'prog_null')              tag = '  ← 🟢 기본(공통) 채널';
                else if (g.startsWith('prog_male'))   tag = '  ← 🔵 남성 채널';
                else if (g.startsWith('prog_female')) tag = '  ← 🔴 여성 채널';
                console.log(`    - "${g}"${tag}`);
            });
            console.log();
            // prog_null 존재 여부 최종 판정
            if (!programGuids.includes('prog_null')) {
                console.log('  🚨 경고: prog_null(기본 채널)이 보드에 없습니다!');
                console.log('     → 복귀 명령(switchProgram prog_null)이 먹히지 않아 남성채널이 계속 나오는 원인입니다.\n');
            } else {
                console.log('  ✅ prog_null 존재 확인됨\n');
            }
        }
        // 원본 XML도 출력
        console.log('  [원본 응답 XML]');
        console.log(prettyXml(result));
    } catch (err) {
        console.log(`  ❌ 조회 실패: ${err.message}\n`);
    }

    // ──────────────────────────────────────────────
    // 6. 보드에 저장된 파일 목록 조회
    // ──────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 [3] 보드에 저장된 파일 목록 (GetFiles)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    try {
        const xml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="GetFiles"/></sdk>`;
        const result = await sendSdkCommand(socket, xml, 20000);
        const fileNames = [...result.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
        if (fileNames.length === 0) {
            console.log('  ⚠️  저장된 파일 없음\n');
        } else {
            console.log(`  총 ${fileNames.length}개 파일 저장됨:`);
            fileNames.forEach(f => console.log(`    - ${f}`));
            console.log();
        }
    } catch (err) {
        console.log(`  ❌ 조회 실패: ${err.message}\n`);
    }

    console.log('══════════════════════════════════════════');
    console.log('  진단 완료');
    console.log('══════════════════════════════════════════');
    socket.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
});
