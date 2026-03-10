import mysql from 'mysql2/promise';
import 'dotenv/config';

async function checkDevices() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME
        });

        console.log('Connected to DB');
        const [rows] = await connection.execute('SELECT CORP_CD, COUNT(*) as count FROM TCM_DEVICEINFO GROUP BY CORP_CD');
        console.log('Device counts by CORP_CD:');
        console.table(rows);

        const [sample] = await connection.execute('SELECT * FROM TCM_DEVICEINFO LIMIT 5');
        console.log('Sample devices:');
        console.table(sample);

        await connection.end();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkDevices();
