import mysql from 'mysql2';
import 'dotenv/config';

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

const startDate = '20230101';
const endDate = '20280101';

const query3 = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND REG_DT >= ? AND REG_DT <= ?";
db.query(query3, [startDate, endDate], (err2, results2) => {
    console.log("With dates:", results2 ? results2.length : err2);
    db.query("SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002'", (err3, results3) => {
        console.log("Corp 22002 total:", results3 ? results3.length : err3);
        const query4 = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND REG_DT >= ? AND REG_DT <= ? AND BOARD_SEC = ?";
        db.query(query4, [startDate, endDate, '01'], (err4, results4) => {
            console.log("With dates and sec 01:", results4 ? results4.length : err4);
            db.query(query4, [startDate, endDate, '02'], (err5, results5) => {
                console.log("With dates and sec 02:", results5 ? results5.length : err5);
                db.query(query4, [startDate, endDate, '03'], (err6, results6) => {
                    console.log("With dates and sec 03:", results6 ? results6.length : err6);
                    process.exit();
                });
            });
        });
    });
});
