import mysql from 'mysql2/promise';
import 'dotenv/config';

async function verify() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected to DB');
        const [rows] = await connection.execute('SELECT account, name, password FROM users WHERE account = ?', ['hdsw']);

        if (rows.length === 0) {
            console.log('User hdsw NOT FOUND in database');
        } else {
            console.log('User found:', rows[0].account);
            console.log('Password in DB:', rows[0].password);
            console.log('User input by user:', '1234');
        }

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

verify();
