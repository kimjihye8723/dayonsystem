import mysql from 'mysql2';
import 'dotenv/config';

const db = mysql.createConnection({
    host: '103.218.158.42',
    user: 'dayonsystem',
    password: 'dayon1!!',
    database: 'dayonsystem'
});
db.query('DESCRIBE TCM_MENUTREE', (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Columns in TCM_MENUTREE:');
        rows.forEach(r => console.log(r.Field));
    }
    db.end();
});
