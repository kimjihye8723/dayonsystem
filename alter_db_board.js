import 'dotenv/config';
import mysql from 'mysql2';

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

const alterQuery = "ALTER TABLE TCM_BOARD MODIFY TX_CONTENTS LONGBLOB";

db.query(alterQuery, (err, result) => {
    if (err) {
        console.error('Error altering table:', err.message);
    } else {
        console.log('Successfully altered TCM_BOARD.TX_CONTENTS to LONGBLOB');
    }
    db.end();
});
