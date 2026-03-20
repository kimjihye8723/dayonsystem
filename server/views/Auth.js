import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Login API Endpoint - TCM_USERHDR 테이블 기준 (login_id, password_no)
router.post('/login', (req, res) => {
    const { account, password } = req.body;

    if (!account || !password) {
        return res.status(400).json({ success: false, message: 'ID와 비밀번호를 입력해주세요.' });
    }

    const query = 'SELECT * FROM TCM_USERHDR WHERE login_id = ? AND password_no = ?';
    db.query(query, [account, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err.message);
            return res.status(500).json({
                success: false,
                message: '서버 오류가 발생했습니다.',
                error: err.message,
                code: err.code
            });
        }

        if (results.length > 0) {
            const user = results[0];

            // 비밀번호 필드 제거 후 반환 (PASSWORD_NO 포함 모든 비밀번호 관련 키 삭제)
            delete user.PASSWORD_NO;
            delete user.password_no;
            res.json({ success: true, message: '로그인 성공', user });
        } else {
            res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }
    });
});

export default router;
