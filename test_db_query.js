import mysql from 'mysql2';
import 'dotenv/config';

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

db.query("SELECT * FROM TCM_BASIC WHERE GROUP_CD = 'TEST'", (err, results) => {
    console.log(err || results);
    process.exit();
});
