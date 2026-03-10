import 'dotenv/config';
import mysql from 'mysql2';

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.query(`DESCRIBE TCM_BOARD`, (err, r) => {
    if (err) {
        console.error(`TCM_BOARD DESCRIBE error:`, err.message);
    } else {
        console.log(`=== TCM_BOARD 컬럼 ===`);
        r.forEach(col => console.log(`${col.Field} | ${col.Type} | ${col.Null} | ${col.Key}`));
    }
    db.end();
});
