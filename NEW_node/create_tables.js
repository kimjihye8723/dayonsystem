const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTables() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        // TCM_CCTV_RAW
        await pool.query(`
            CREATE TABLE IF NOT EXISTS TCM_CCTV_RAW (
                SEQ           BIGINT AUTO_INCREMENT PRIMARY KEY,
                CORP_CD       VARCHAR(10) NOT NULL DEFAULT '25001',
                CONNECT_INFO  VARCHAR(200) NOT NULL,
                INSERT_DT     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                MALE_IN       INT NOT NULL DEFAULT 0,
                MALE_OUT      INT NOT NULL DEFAULT 0,
                FEMALE_IN     INT NOT NULL DEFAULT 0,
                FEMALE_OUT    INT NOT NULL DEFAULT 0,
                TOTAL_IN      INT NOT NULL DEFAULT 0,
                TOTAL_OUT     INT NOT NULL DEFAULT 0,
                INDEX idx_insert_dt (INSERT_DT),
                INDEX idx_connect (CONNECT_INFO)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✓ TCM_CCTV_RAW 테이블 생성 완료');

        // TCM_CCTV_STATISTICS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS TCM_CCTV_STATISTICS (
                SEQ           BIGINT AUTO_INCREMENT PRIMARY KEY,
                CORP_CD       VARCHAR(10) NOT NULL DEFAULT '25001',
                CONNECT_INFO  VARCHAR(200) NOT NULL,
                INSERT_DT     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                MALE_IN       INT NOT NULL DEFAULT 0,
                MALE_OUT      INT NOT NULL DEFAULT 0,
                FEMALE_IN     INT NOT NULL DEFAULT 0,
                FEMALE_OUT    INT NOT NULL DEFAULT 0,
                TOTAL_IN      INT NOT NULL DEFAULT 0,
                TOTAL_OUT     INT NOT NULL DEFAULT 0,
                INDEX idx_insert_dt (INSERT_DT),
                INDEX idx_connect (CONNECT_INFO)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✓ TCM_CCTV_STATISTICS 테이블 생성 완료');

        // Verify
        const [rawCols] = await pool.query('DESCRIBE TCM_CCTV_RAW');
        console.log('\nTCM_CCTV_RAW 컬럼:', rawCols.map(c => c.Field).join(', '));

        const [statCols] = await pool.query('DESCRIBE TCM_CCTV_STATISTICS');
        console.log('TCM_CCTV_STATISTICS 컬럼:', statCols.map(c => c.Field).join(', '));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

createTables();
