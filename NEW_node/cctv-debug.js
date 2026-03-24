/**
 * CCTV 신호 도달 확인용 디버그 서버 (cctv-debug.js)
 * 
 * [사용 방법]
 * 1. pm2 stop all (기존 서비스 중시)
 * 2. node cctv-debug.js (직접 실행)
 * 3. 센서 웹 화면에서 [Test Setting] 또는 [Save] 클릭
 * 4. 터미널에 로그가 찍히는지 확인
 */
const http = require('http');

const PORT = 2015;

const server = http.createServer((req, res) => {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 📢 신호 포착!!`);
    console.log(` - 보낸 IP: ${req.socket.remoteAddress}`);
    console.log(` - 요청 방식: ${req.method} ${req.url}`);
    
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        console.log(` - 데이터내용: ${body}`);
        
        // 센서가 Success 응답을 기대함
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Status: "Success" }));
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log(` 📡 ${PORT}번 포트에서 CCTV 신호 대기 중...`);
    console.log('============================================');
});
