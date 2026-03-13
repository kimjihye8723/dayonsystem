require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.query("SELECT CODE_CD, CODE_NM FROM TCM_CODE WHERE GROUP_NM = '거래처구분'", (err, results) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('거래처구분 codes:');
    console.table(results);
    db.end();
});
