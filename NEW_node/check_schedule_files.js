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
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        console.log('--- 1. 스케줄 정보 (목요일: DAY_SEC=4) ---');
        const [schRows] = await pool.query(`
            SELECT * FROM TCM_VENDOR_SCH 
            WHERE VENDOR_CD='260001' AND DAY_SEC='4' 
              AND USE_YN='Y' AND ? BETWEEN START_DT AND END_DT 
            ORDER BY REGISTDT DESC LIMIT 1
        `, [today]);
        
        console.log(schRows);

        if (schRows.length > 0) {
            // 목요일의 어떤 시간대든 사용중인 CONTENTS_KEY 하나만 추출 (여기서는 14시 또는 아무거나)
            const row = schRows[0];
            let contentsKey = null;
            for(let i=0; i<24; i++) {
                const col = 'SCH_' + String(i).padStart(2, '0');
                if (row[col]) {
                    contentsKey = row[col];
                    console.log(`발견된 최신 CONTENTS_KEY: ${contentsKey} (${i}시 편성)`);
                    break;
                }
            }

            if (contentsKey) {
                console.log(`\n--- 2. CONTENTS_KEY=${contentsKey}에 해당하는 파일 목록 (TCM_CONTENTS_FILE) ---`);
                const [files] = await pool.query(`
                    SELECT 
                        L.DISP_SEQ, F.FILE_KEY, F.FILE_NAME, F.GENDER 
                    FROM TCM_CONTENTS_LIST L
                    JOIN TCM_CONTENTS_FILE F ON L.FILE_KEY = F.FILE_KEY
                    WHERE L.CONTENTS_KEY = ? AND L.USE_YN = 'Y' AND F.USE_YN = 'Y'
                    ORDER BY L.DISP_SEQ ASC
                `, [contentsKey]);
                
                console.table(files);
            } else {
                console.log('편성된 시간대(SCH_00~23)가 없습니다.');
            }
        }
    } catch(err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
