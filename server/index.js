import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});


const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test DB Connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to the remote MySQL database (Pool).');
        connection.release();
    }
});

// Login API Endpoint
app.post('/api/login', (req, res) => {
    const { account, password } = req.body;

    if (!account || !password) {
        return res.status(400).json({ success: false, message: 'ID와 비밀번호를 입력해주세요.' });
    }

    const query = 'SELECT * FROM users WHERE account = ? AND password = ?';
    db.query(query, [account, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err.message);
            // Return internal error message only for debugging
            return res.status(500).json({
                success: false,
                message: '서버 오류가 발생했습니다.',
                error: err.message, // 상세 에러 원인 포함 (운영 시 제거 권장)
                code: err.code
            });
        }

        if (results.length > 0) {
            const user = results[0];

            // Update last login time
            db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id], (updateErr) => {
                if (updateErr) console.error('Failed to update last login:', updateErr.message);
            });

            // Don't send password back
            if (user.password) delete user.password;
            res.json({ success: true, message: '로그인 성공', user });
        } else {
            res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }
    });
});

// Update User Info API Endpoint
app.put('/api/user/update', (req, res) => {
    const { account, name, password, email, phone, profile_img } = req.body;

    if (!account) {
        return res.status(400).json({ success: false, message: '계정 정보가 필요합니다.' });
    }

    let query = 'UPDATE users SET name = ?, email = ?, phone = ?, profile_img = ?';
    let params = [name, email, phone, profile_img];

    if (password) {
        query += ', password = ?';
        params.push(password);
    }

    query += ' WHERE account = ?';
    params.push(account);

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Update query error:', err.message);
            return res.status(500).json({
                success: false,
                message: '서버 오류가 발생했습니다.',
                error: err.message,
                code: err.code
            });
        }

        if (results.affectedRows > 0) {
            // Fetch updated user info to return
            db.query('SELECT id, account, name, email, phone, profile_img, last_login FROM users WHERE account = ?', [account], (fetchErr, fetchResults) => {
                if (fetchErr) {
                    console.error('Fetch updated user error:', fetchErr.message);
                    return res.json({ success: true, message: '정보가 수정되었으나 최신 정보를 불러오지 못했습니다.' });
                }
                res.json({ success: true, message: '회원정보가 성공적으로 수정되었습니다.', user: fetchResults[0] });
            });
        } else {
            res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
