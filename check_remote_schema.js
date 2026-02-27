import mysql from 'mysql2/promise';
import 'dotenv/config';

async function checkSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected to DB');
        const [columns] = await connection.execute('SHOW COLUMNS FROM users');
        console.log('Columns in users table:');
        columns.forEach(col => {
            console.log(`- ${col.Field} (${col.Type})`);
        });

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkSchema();
