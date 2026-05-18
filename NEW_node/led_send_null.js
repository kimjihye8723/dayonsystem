/**
 * LED 보드 기본채널(prog_null) 강제 송출 스크립트
 * - 보드에 이미 저장된 3개 기본 영상만 재생
 * - 기존 프로그램 전체 삭제 후 prog_null 생성 → 즉시 전환
 */

const net = require('net');

// ── 설정 ──────────────────────────────────────────────
const TARGET_IP   = '223.171.64.228';
const TARGET_PORT = 7003;
const TCP_VERSION = 0x1000007;

// 보드에 이미 저장된 null 파일 3개 (diag에서 확인)
const NULL_FILES = [
    'd1080x1080_160539.mp4',
    'd1080x1080_158800.mp4',
    'd1080x1080_158792.mp4',
];
const SCREEN_W = 256;
const SCREEN_H = 256;
const DURATION = 30000; // ms per video
// ─────────────────────────────────────────────────────

const CMD = {
    HEARTBEAT_ASK:      0x005f,
    HEARTBEAT_ANSWER:   0x0060,
    SDK_SERVICE_ASK:    0x2001,
    SDK_SERVICE_ANSWER: 0x2002,
    ERROR_ANSWER:       0x2000,
    SDK_CMD_ASK:        0x2003,
    SDK_CMD_ANSWER:     0x2004,
};

let guid = null;
let recvBuffer = Buffer.alloc(0);
let resolveVersion = null;
let resolveGuid    = null;
let resolveSdkCmd  = null;

function log(msg) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    console.log(`[${t}] ${msg}`);
}

function processBuffer() {
    while (recvBuffer.length >= 2) {
        const len = recvBuffer.readUInt16LE(0);
        if (recvBuffer.length < len) break;
        const cmd  = recvBuffer.readUInt16LE(2);
        const data = recvBuffer.slice(4, len);
        recvBuffer  = recvBuffer.slice(len);
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
            log(`⚠️ 에러 코드: ${code} (22=파일이미존재=정상)`);
            if (resolveVersion) { resolveVersion(null); resolveVersion = null; }
            if (resolveGuid)    { resolveGuid(new Error(`에러:${code}`)); resolveGuid = null; }
            if (resolveSdkCmd)  { resolveSdkCmd(null, `error:${code}`); resolveSdkCmd = null; }
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
        const timer = setTimeout(() => { resolveSdkCmd = null; reject(new Error('타임아웃')); }, timeoutMs);
        resolveSdkCmd = (err, result) => {
            clearTimeout(timer);
            resolveSdkCmd = null;
            if (err) reject(err); else resolve(result);
        };
        sendSdkPacket(socket, xmlString);
    });
}

async function main() {
    console.log('\n══════════════════════════════════════════');
    console.log('  LED 기본채널(prog_null) 강제 송출');
    console.log(`  대상: ${TARGET_IP}:${TARGET_PORT}`);
    console.log('══════════════════════════════════════════\n');

    const socket = new net.Socket();
    socket.on('data', (chunk) => { recvBuffer = Buffer.concat([recvBuffer, chunk]); processBuffer(); });
    socket.on('error', (err) => { log(`소켓 에러: ${err.message}`); process.exit(1); });

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
        sendSdkPacket(socket, `<?xml version="1.0" encoding="utf-8"?><sdk guid="##GUID"><in method="GetIFVersion"><version value="1000000"/></in></sdk>`);
    });
    log(`✅ GUID 획득: ${guid}\n`);

    // 4. 기존 프로그램 전부 삭제
    log('━━━ [1/3] 기존 프로그램 전체 삭제');
    const delResult = await sendSdkCommand(socket, `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="DeleteAllProgram"></in></sdk>`, 10000);
    const delMatch = delResult.match ? delResult.match(/result="([^"]+)"/) : null;
    log(`  → DeleteAllProgram: ${delMatch ? delMatch[1] : delResult}`);

    // 5. prog_null 생성 (이미 보드에 있는 파일 참조)
    log('\n━━━ [2/3] prog_null 생성 (기본 영상 3개)');
    const videoTags = NULL_FILES.map((fname, idx) =>
        `<video guid="vid-null-${idx}" aspectRatio="false"><file name="${fname}"/><playParams duration="${DURATION}"/></video>`
    ).join('');
    const addXml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="AddProgram"><screen timeStamps="${Date.now()}"><program guid="prog_null" type="normal"><playControl count="99999"/><area guid="area-null" alpha="255"><rectangle x="0" y="0" width="${SCREEN_W}" height="${SCREEN_H}"/><resources>${videoTags}</resources></area></program></screen></in></sdk>`;
    const addResult = await sendSdkCommand(socket, addXml, 15000);
    const addMatch = addResult.match ? addResult.match(/result="([^"]+)"/) : null;
    log(`  → AddProgram: ${addMatch ? addMatch[1] : addResult}`);

    // 6. prog_null 즉시 전환
    log('\n━━━ [3/3] prog_null 즉시 전환');
    const swResult = await sendSdkCommand(socket, `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="SwitchProgram"><program guid="prog_null"/></in></sdk>`, 5000);
    const swMatch = swResult.match ? swResult.match(/result="([^"]+)"/) : null;
    log(`  → SwitchProgram: ${swMatch ? swMatch[1] : swResult}`);

    // 7. 불필요한 파일 삭제 (null 영상 3개 제외)
    const DELETE_FILES = [
        'af6fc783bb193093cb347777f2b6cbc5.mp4', // 남성 BMW 영상
    ];
    log('\n━━━ [4/4] 불필요한 영상 파일 삭제');
    const fileTags = DELETE_FILES.map(f => `<file name="${f}"/>`).join('');
    const delFileResult = await sendSdkCommand(socket,
        `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="DeleteFiles"><files>${fileTags}</files></in></sdk>`,
        10000
    );
    const delFileMatch = delFileResult.match ? delFileResult.match(/result="([^"]+)"/) : null;
    log(`  → DeleteFiles: ${delFileMatch ? delFileMatch[1] : delFileResult}`);
    DELETE_FILES.forEach(f => log(`     삭제: ${f}`));

    const ok = (addMatch && addMatch[1] === 'kSuccess') && (swMatch && swMatch[1] === 'kSuccess');
    console.log('\n══════════════════════════════════════════');
    console.log(ok
        ? '  ✅ 완료! 보드가 기본 영상 3개 무한 반복 송출 중'
        : '  ⚠️  일부 명령 실패 - 위 결과 확인 필요');
    console.log('══════════════════════════════════════════\n');

    socket.destroy();
}

main().catch(err => { console.error('❌ 오류:', err.message); process.exit(1); });
