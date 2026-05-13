const net = require('net');

// 기기 IP 설정 (명령어 인수로 받거나 기본값 사용)
const DEVICE_IP = process.argv[2] || '223.171.64.228';
const DEVICE_PORT = parseInt(process.argv[3] || '10001');

const LOCAL_TCP_VERSION = 0x1000007;

const client = new net.Socket();
let currentStep = 'version_negotiation';
let sessionGuid = '';

function sendPacket(cmd, dataBuf) {
    const len = dataBuf ? 4 + dataBuf.length : 4;
    const buf = Buffer.alloc(2 + 2 + (dataBuf ? dataBuf.length : 0));
    buf.writeUInt16LE(len, 0); // Len
    buf.writeUInt16LE(cmd, 2); // Cmd
    if (dataBuf) {
        dataBuf.copy(buf, 4);
    }
    client.write(buf);
}

function sendXml(guid, xmlString) {
    const xmlBuf = Buffer.from(xmlString, 'utf8');
    const total = xmlBuf.length;
    const index = 0;
    
    const dataBuf = Buffer.alloc(8 + total);
    dataBuf.writeUInt32LE(total, 0);
    dataBuf.writeUInt32LE(index, 4);
    xmlBuf.copy(dataBuf, 8);

    sendPacket(0x2003, dataBuf); // kSDKCmdAsk
}

client.connect(DEVICE_PORT, DEVICE_IP, () => {
    console.log(`[연결 성공] ${DEVICE_IP}:${DEVICE_PORT}`);
    
    console.log(`[STEP 1] 버전 협상 요청 전송...`);
    const versionBuf = Buffer.alloc(4);
    versionBuf.writeUInt32LE(LOCAL_TCP_VERSION, 0);
    sendPacket(0x2001, versionBuf);
});

client.on('data', (data) => {
    if (data.length < 4) return;
    const len = data.readUInt16LE(0);
    const cmd = data.readUInt16LE(2);

    if (cmd === 0x2002 && currentStep === 'version_negotiation') {
        const deviceVersion = data.readUInt32LE(4);
        console.log(`[STEP 1 완료] 기기 버전 응답: 0x${deviceVersion.toString(16)}`);
        
        console.log(`[STEP 2] GetIFVersion 요청 전송...`);
        currentStep = 'sdk_negotiation';
        const getIfXml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="##GUID"><in method="GetIFVersion"><version value="1000000"/></in></sdk>`;
        sendXml('', getIfXml);
    } 
    else if (cmd === 0x2004) { // kSDKCmdAnswer
        const xmlData = data.toString('utf8', 12);
        
        if (currentStep === 'sdk_negotiation') {
            console.log(`[STEP 2 응답 수신]`);
            const guidMatch = xmlData.match(/guid="([^"]+)"/);
            if (guidMatch && guidMatch[1]) {
                sessionGuid = guidMatch[1];
                console.log(`=> 발급받은 GUID: ${sessionGuid}`);
                
                console.log(`[STEP 3] GetSDKTcpServer 요청 전송...`);
                currentStep = 'get_tcp_server';
                const getServerXml = `<?xml version="1.0" encoding="utf-8"?><sdk guid="${sessionGuid}"><in method="GetSDKTcpServer"/></sdk>`;
                sendXml(sessionGuid, getServerXml);
            } else {
                console.error("GUID를 찾을 수 없습니다:", xmlData);
                client.destroy();
            }
        } 
        else if (currentStep === 'get_tcp_server') {
            console.log(`\n==================================================`);
            console.log(`[GetSDKTcpServer 결과 수신]`);
            console.log(xmlData);
            console.log(`==================================================\n`);
            client.destroy();
        }
    }
});

client.on('close', () => {
    console.log('[연결 종료]');
});

client.on('error', (err) => {
    console.error(`[연결 에러] ${err.message}`);
});
