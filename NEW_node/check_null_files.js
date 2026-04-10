const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({ 
        host: process.env.DB_HOST, 
        user: process.env.DB_USER, 
        password: process.env.DB_PASS, 
        database: process.env.DB_NAME 
    });

    try {
        const [files] = await pool.query(`
            SELECT 
                F.FILE_KEY, F.FILE_NAME, F.GENDER 
            FROM TCM_CONTENTS_LIST L
            JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
            WHERE L.CONTENTS_KEY = '3'
              AND L.USE_YN = 'Y'
              AND F.USE_YN = 'Y'
              AND (F.GENDER IS NULL OR F.GENDER = '')
        `);
        console.table(files);
    } catch(err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
