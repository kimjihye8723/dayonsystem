const express = require('express');
require('dotenv').config();

const app = express();
const PORT = 2015;

app.use(express.json());

// 모든 실시간 푸시 데이터 수신 및 출력 (RAW 로그 전용)
app.post('/', (req, res) => {
    const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });

    console.log(`\n[${now}] ──────────────────────────────────────────────────`);
    console.log(`[수신 데이터 원본]`);
    console.log(JSON.stringify(req.body, null, 2));
    console.log(`────────────────────────────────────────────────────────────`);

    res.status(200).json({ Status: "Success" });
});

app.get('/', (req, res) => {
    res.send('CCTV RAW Logger (Port 2016) is active.');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('==============================================');
    console.log(`  CCTV 모든 데이터 로그 서버 시작`);
    console.log(`  포트: ${PORT}`);
    console.log(`  동작: 수신되는 모든 JSON/XML 데이터를 출력합니다.`);
    console.log('==============================================');
});
