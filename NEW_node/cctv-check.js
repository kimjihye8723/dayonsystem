const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

async function check() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('--- [TCM_CCTV 테이블 활성 목록] ---');
        const [rows] = await connection.query('SELECT idx, HOSTNAME, CONNECT_INFO, USE_YN FROM TCM_CCTV WHERE USE_YN = "Y"');
        
        if (rows.length === 0) {
            console.log('활성화된(USE_YN="Y") CCTV가 없습니다.');
        } else {
            rows.forEach(r => {
                console.log(`[ID:${r.idx}] HostName: "${r.HOSTNAME}", Info: "${r.CONNECT_INFO}"`);
            });
        }
        console.log('----------------------------------');
    } catch (err) {
        console.error('DB 접속 에러:', err.message);
    } finally {
        if (connection) await connection.end();
    }
}

check();
