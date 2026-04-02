const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'C:/Users/leeyw/Downloads/대연 신규/NEW_node/.env' });

async function checkSchedules() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    const CORP_CD = '25001';
    console.log(`--- Checking Vendors for CORP_CD: ${CORP_CD} ---`);
    const [vendors] = await db.query(`
        SELECT DISTINCT D.USE_VENDOR AS VENDOR_CD, V.VENDOR_NM, D.DEVICE_ID
        FROM TCM_DEVICEINFO D
        JOIN TCM_VENDOR V ON D.CORP_CD = V.CORP_CD AND D.USE_VENDOR = V.VENDOR_CD
        WHERE D.CORP_CD = ? AND D.USE_YN = 'Y' AND D.CONNECT_INFO != ''
    `, [CORP_CD]);

    for (const v of vendors) {
        console.log(`\nVendor: ${v.VENDOR_NM} (${v.VENDOR_CD})`);
        
        const now = new Date();
        const dayOfWeek = now.getDay().toString();
        const today = now.toISOString().slice(0, 10).replace(/-/g, '');
        const currentHour = now.getHours();
        const schColumn = `SCH_${String(currentHour).padStart(2, '0')}`;

        console.log(`Search Params: Day=${dayOfWeek}, Date=${today}, HourColumn=${schColumn}`);

        const [schedules] = await db.query(`
            SELECT * FROM TCM_VENDOR_SCH
            WHERE CORP_CD = ? AND VENDOR_CD = ? AND DAY_SEC = ? AND USE_YN = 'Y'
            AND ? BETWEEN START_DT AND END_DT
        `, [CORP_CD, v.VENDOR_CD, dayOfWeek, today]);

        if (schedules.length === 0) {
            console.log(`[ERROR] No schedule found in TCM_VENDOR_SCH`);
            continue;
        }

        const row = schedules[0];
        const contentsKey = row[schColumn];
        console.log(`Schedule Found! ContentsKey: ${contentsKey || 'EMPTY'}`);

        if (contentsKey) {
            const [files] = await db.query(`
                SELECT L.FILE_KEY, F.FILE_NAME, F.GENDER
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ? AND L.CONTENTS_KEY = ? AND L.USE_YN = 'Y' AND F.USE_YN = 'Y'
            `, [CORP_CD, contentsKey]);
            console.log(`Files found: ${files.length}`);
            files.forEach(f => console.log(`  - ${f.FILE_NAME} (GENDER: ${f.GENDER})`));
        } else {
            console.log(`[WARN] No contentsKey for current hour ${currentHour}`);
        }
    }

    await db.end();
}

checkSchedules().catch(console.error);
