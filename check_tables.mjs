import 'dotenv/config';
import mysql from 'mysql2';

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

async function checkTable(tableName) {
    return new Promise((resolve) => {
        db.query(`DESCRIBE ${tableName}`, (err, r) => {
            if (err) {
                console.error(`${tableName} DESCRIBE error:`, err.message);
                resolve(null);
            } else {
                console.log(`=== ${tableName} 컬럼 ===`);
                r.forEach(col => console.log(`${col.Field} | ${col.Type} | ${col.Null} | ${col.Key}`));
                resolve(true);
            }
        });
    });
}

(async () => {
    await checkTable('TCM_USERHDR');
    await checkTable('TCM_USERVENDOR');
    await checkTable('TCM_USERCARD');
    db.end();
})();
