
const axios = require('axios');
require('dotenv').config();

const CONFIG = {
    cctv: {
        user: process.env.CCTV_USER || 'admin',
        password: process.env.CCTV_PASSWORD || 'Tectree6767!'
    },
    requestTimeout: 60000, // 60s
    maxRetries: 3
};

function formatDT(date) {
    const p = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

async function testWithParams() {
    const baseUrl = 'http://smartgate1001.cns-link.net:7002';
    
    // 2026-03-24 기준으로 설정
    const start = '2026-03-24T00:00:00';
    const end = '2026-03-24T23:59:59';
    const interval = 'by1day';

    console.log(`Testing CCTV with Params: ${baseUrl}/api/statistics/query`);
    console.log(`Params: start=${start}, end=${end}, interval=${interval}`);

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const response = await axios.get(`${baseUrl}/api/statistics/query`, {
                params: { start, end, interval },
                auth: {
                    username: CONFIG.cctv.user,
                    password: CONFIG.cctv.password
                },
                headers: { 'Connection': 'close' },
                timeout: CONFIG.requestTimeout
            });

            console.log('--- Response Success ---');
            console.log('Status:', response.status);
            console.log('Data:', JSON.stringify(response.data, null, 2));
            return;

        } catch (error) {
            console.log(`--- Attempt ${attempt} Failed ---`);
            if (error.response) {
                console.log(`HTTP ${error.response.status} (${error.response.statusText})`);
                if (error.response.status === 503 && attempt < CONFIG.maxRetries) {
                    console.log('503 System Busy - Retrying in 10s...');
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }
                console.log('Data:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.log('Error:', error.message);
            }
            if (attempt === CONFIG.maxRetries) {
                console.log('Max retries reached.');
            }
        }
    }
}

testWithParams();
