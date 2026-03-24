
const net = require('net');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('Usage: node led_diag.js <host:port>');
        process.exit(1);
    }
    const [host, rawPort] = args[0].split(':');
    const port = parseInt(rawPort || '7003');

    console.log(`연결 시도: ${host}:${port}`);
    const socket = net.createConnection(port, host);
    
    const sendPkt = (cmd, buf = Buffer.alloc(0)) => {
        const totalLen = 2 + 4 + 4 + buf.length;
        const pkt = Buffer.alloc(2 + totalLen);
        pkt.writeUInt16LE(totalLen + 2, 0);
        pkt.writeUInt16LE(cmd, 2);
        pkt.writeUInt32LE(buf.length, 4);
        pkt.writeUInt32LE(0, 8);
        buf.copy(pkt, 12);
        socket.write(pkt);
    };

    const sendSdk = (guid, xml) => {
        const buf = Buffer.from(xml, 'utf-8');
        const sdkBuf = Buffer.alloc(8 + buf.length);
        sdkBuf.writeUInt32LE(buf.length, 0);
        sdkBuf.writeUInt32LE(0, 4);
        buf.copy(sdkBuf, 8);
        sendPkt(0x2003, sdkBuf);
    };

    socket.on('connect', () => {
        console.log('✅ 연결됨');
        sendPkt(0x1000, Buffer.from([0x03, 0x00, 0x00, 0x00]));
    });

    socket.on('data', (data) => {
        const cmd = data.readUInt16LE(2);
        if (cmd === 0x1001) {
            console.log('✅ 버전 협상 성공');
            sendPkt(0x1002);
        } else if (cmd === 0x1003) {
            const guid = data.slice(12, 12 + 32).toString();
            console.log(`✅ GUID: ${guid}`);
            
            // Query 1
            sendSdk(guid, `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="GetDeviceInfo"/></sdk>`);
            
            // Query 2 (Wait 2s)
            setTimeout(() => {
                console.log('\n--- GetProgramList 시도 ---');
                sendSdk(guid, `<?xml version="1.0" encoding="utf-8"?><sdk guid="${guid}"><in method="GetProgramList"/></sdk>`);
            }, 2000);
        } else if (cmd === 0x2004) {
            const xmlLen = data.readUInt32LE(12);
            const xml = data.slice(20, 20 + xmlLen).toString();
            console.log(`\n[응답]\n${xml}`);
        }
    });

    setTimeout(() => {
        console.log('\n종료.');
        socket.end();
        process.exit(0);
    }, 10000);
}

main().catch(console.error);
