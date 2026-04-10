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
        console.log('--- 1. 스케줄 정보 (목요일: DAY_SEC 4 추정) ---');
        // TCM_VENDOR_SCH의 전체 목요일(4) 매핑을 확인하자
        const [schRows] = await pool.query(`
            SELECT DAY_SEC, START_DT, END_DT, USE_YN, SCH_13, SCH_14, SCH_15, REGISTDT 
            FROM TCM_VENDOR_SCH 
            WHERE VENDOR_CD='260001' AND USE_YN='Y'
            ORDER BY REGISTDT DESC
            LIMIT 10
        `);
        console.table(schRows);

        if (schRows.length > 0) {
            // CONTENTS_KEY가 있는 곳 찾기 (예: SCH_14)
            let contentsKey = null;
            for (let row of schRows) {
                if (row.SCH_14 && String(row.SCH_14).trim() !== '') {
                    contentsKey = row.SCH_14;
                    break;
                }
            }
            
            if (contentsKey) {
                console.log(`\n--- 2. CONTENTS_KEY=${contentsKey} ('리엔 테스트' 추정) 파일 목록 ---`);
                const [files] = await pool.query(`
                    SELECT 
                        L.DISP_SEQ, F.FILE_NAME, F.GENDER 
                    FROM TCM_CONTENTS_LIST L
                    JOIN TCM_CONTENTS_FILE F ON L.FILE_KEY = F.FILE_KEY AND L.CORP_CD = F.CORP_CD
                    WHERE L.CONTENTS_KEY = ? AND L.USE_YN = 'Y' AND F.USE_YN = 'Y'
                    ORDER BY L.DISP_SEQ ASC
                `, [contentsKey]);
                console.table(files);
            }
        }
    } catch(err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
