import mysql from 'mysql2';
import 'dotenv/config';

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }

    db.query('SELECT account FROM users WHERE account = ?', ['hdsw'], (err, results) => {
        if (err) {
            console.error('Query failed:', err.message);
        } else {
            console.log('Results:', results);
        }
        db.end();
    });
});
