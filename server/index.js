import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Login API Endpoint - TCM_USERHDR 테이블 기준 (login_id, password_no)
app.post('/api/login', (req, res) => {
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

// ========== Device Management APIs ==========

// 장비 목록 조회 - TCM_VENDOR_DEVICE 기반, TCM_VENDOR JOIN으로 거래처명 포함
app.get('/api/devices', (req, res) => {
    const { startDate, endDate, vendorNm } = req.query;

    let query = `
        SELECT d.*, v.VENDOR_NM
        FROM TCM_VENDOR_DEVICE d
        LEFT JOIN TCM_VENDOR v ON d.CORP_CD = v.CORP_CD AND d.VENDOR_CD = v.VENDOR_CD
        WHERE d.CORP_CD = '25001'
    `;
    const params = [];

    // REGISTDT(datetime) 기준 날짜 필터 - YYYYMMDD 형식 수신
    if (startDate) { query += " AND DATE_FORMAT(d.REGISTDT, '%Y%m%d') >= ?"; params.push(startDate); }
    if (endDate)   { query += " AND DATE_FORMAT(d.REGISTDT, '%Y%m%d') <= ?"; params.push(endDate); }
    if (vendorNm)  { query += ' AND v.VENDOR_NM LIKE ?'; params.push(`%${vendorNm}%`); }

    query += ' ORDER BY d.REGISTDT DESC';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, devices: results });
    });
});

// 장비 저장/수정 (배열) - DEVICE_KEY 기준 신규/수정 분기
// 신규: DEVICE_KEY 없음 → 서버에서 자동 채번(YYYYMMDDHHMMSS + 2자 랜덤)
app.post('/api/devices/save', (req, res) => {
    const devices = Array.isArray(req.body) ? req.body : req.body.devices;
    if (!Array.isArray(devices) || devices.length === 0)
        return res.status(400).json({ success: false, message: '저장할 데이터가 없습니다.' });

    let completed = 0;
    const errors = [];

    const generateKey = () => {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const rnd = String.fromCharCode(65 + Math.floor(Math.random()*26)) + String.fromCharCode(65 + Math.floor(Math.random()*26));
        return ts + rnd;
    };

    const finalize = () => {
        if (errors.length > 0) res.status(500).json({ success: false, errors });
        else res.json({ success: true, message: '저장되었습니다.' });
    };

    devices.forEach(d => {
        if (d.DEVICE_KEY) {
            // 기존 레코드 수정
            const sql = `UPDATE TCM_VENDOR_DEVICE SET DEVICE_ID=?, VENDOR_CD=?, DEVICE_NM=?, POSITION_NM=?, USE_YN=?, REMARK=?, MODIFYDT=NOW(), MODIFYUSER='ADMIN'
                         WHERE CORP_CD='25001' AND DEVICE_KEY=?`;
            db.query(sql, [d.DEVICE_ID, d.VENDOR_CD, d.DEVICE_NM, d.POSITION_NM, d.USE_YN, d.REMARK || '', d.DEVICE_KEY], (e) => {
                if (e) errors.push(e.message);
                if (++completed === devices.length) finalize();
            });
        } else {
            // 신규 레코드 삽입 - DEVICE_KEY 자동 채번
            const newKey = generateKey();
            const sql = `INSERT INTO TCM_VENDOR_DEVICE (CORP_CD, DEVICE_KEY, DEVICE_ID, VENDOR_CD, DEVICE_NM, POSITION_NM, USE_YN, REMARK, REGISTDT, REGISTUSER)
                         VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN')`;
            db.query(sql, [newKey, d.DEVICE_ID || '', d.VENDOR_CD || '', d.DEVICE_NM || '', d.POSITION_NM || '', d.USE_YN || 'Y', d.REMARK || ''], (e) => {
                if (e) errors.push(e.message);
                if (++completed === devices.length) finalize();
            });
        }
    });
});

// 장비 삭제 - DEVICE_KEY 배열 기준 삭제
app.delete('/api/devices', (req, res) => {
    const { deviceKeys } = req.body;
    if (!deviceKeys || !Array.isArray(deviceKeys) || deviceKeys.length === 0)
        return res.status(400).json({ success: false, message: 'deviceKeys 배열이 필요합니다.' });
    const placeholders = deviceKeys.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_VENDOR_DEVICE WHERE CORP_CD = '25001' AND DEVICE_KEY IN (${placeholders})`;
    db.query(sql, deviceKeys, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// ========== User Management APIs ==========

// 사용자 목록 조회 - TCM_USERHDR 기반
app.get('/api/users', (req, res) => {
    const { userTyp, userNm, userHp, remark } = req.query;

    let query = `
        SELECT USER_ID, USER_NM, REMARK, LOGIN_ID, USER_HP, USER_TYP, DEPT_CD, POSITION_CD, IPSA_DT, EMAIL_ID
        FROM TCM_USERHDR
        WHERE CORP_CD = '25001'
    `;
    const params = [];

    if (userTyp) { query += ' AND USER_TYP = ?'; params.push(userTyp); }
    if (userNm) { query += ' AND USER_NM LIKE ?'; params.push(`%${userNm}%`); }
    if (userHp) { query += ' AND (USER_HP LIKE ? OR USER_TEL LIKE ?)'; params.push(`%${userHp}%`, `%${userHp}%`); }
    if (remark) { query += ' AND REMARK LIKE ?'; params.push(`%${remark}%`); }

    query += ' ORDER BY SORT_SEQ, USER_ID';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

// 사용자 상세 정보 조회 (Header + Vendor + Card)
app.get('/api/users/:userId/details', (req, res) => {
    const { userId } = req.params;
    const corpCd = '25001';

    // 1. Header 조회
    db.query("SELECT * FROM TCM_USERHDR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err, headerResults) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (headerResults.length === 0) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        // 2. Vendor 조회
        const vendorSql = `
            SELECT uv.*, v.VENDOR_NM
            FROM TCM_USERVENDOR uv
            LEFT JOIN TCM_VENDOR v ON uv.CORP_CD = v.CORP_CD AND uv.VENDOR_CD = v.VENDOR_CD
            WHERE uv.CORP_CD = ? AND uv.USER_ID = ?
        `;
        db.query(vendorSql, [corpCd, userId], (err, vendorResults) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            // 3. Card 조회
            db.query("SELECT * FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err, cardResults) => {
                if (err) return res.status(500).json({ success: false, error: err.message });

                res.json({
                    success: true,
                    header: headerResults[0],
                    vendors: vendorResults,
                    cards: cardResults
                });
            });
        });
    });
});

// 사용자 저장/수정 (통합 저장)
app.post('/api/users/save', (req, res) => {
    const { header, vendors, cards } = req.body;
    const corpCd = '25001';
    const userId = header.USER_ID;

    if (!userId) return res.status(400).json({ success: false, message: 'USER_ID가 필요합니다.' });

    // 트랜잭션 처리 (간소화된 형태)
    db.query("SELECT USER_ID FROM TCM_USERHDR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const isNew = results.length === 0;

        const headerFields = [
            'LOGIN_ID', 'USER_NM', 'USER_TYP', 'PASSWORD_NO', 'JUMIN_NO', 'IPSA_DT', 
            'DEPT_CD', 'TEAM_CD', 'POSITION_CD', 'DUTY_CD', 'USER_HP', 'USER_TEL', 'USER_EMAIL',
            'BIRTH_DT', 'MARRIED_DT', 'EXPIRE_DT', 'SORT_SEQ', 'EMAIL_ID', 'EMAIL_PW',
            'ACCOUNT_CD', 'ACCOUNT_NO', 'ACCOUNT_NM', 'ADDRESS_HDR', 'REMARK',
            'LINK_ID', 'INCENTIVE_RAT', 'POPUP_YN', 'SERVICE_USEYN', 'PROPERTY_01'
        ];
        const headerValues = headerFields.map(f => header[f] !== undefined ? header[f] : null);

        if (isNew) {
            // INSERT
            const sql = `INSERT INTO TCM_USERHDR (CORP_CD, USER_ID, ${headerFields.join(', ')}, REGISTDT, REGISTUSER) 
                         VALUES (?, ?, ${headerFields.map(() => '?').join(', ')}, NOW(), 'ADMIN')`;
            db.query(sql, [corpCd, userId, ...headerValues], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                saveSubTables();
            });
        } else {
            // UPDATE
            const setClause = headerFields.map(f => `${f} = ?`).join(', ');
            const sql = `UPDATE TCM_USERHDR SET ${setClause}, MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' 
                         WHERE CORP_CD = ? AND USER_ID = ?`;
            db.query(sql, [...headerValues, corpCd, userId], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                saveSubTables();
            });
        }
    });

    const saveSubTables = () => {
        // Vendor 테이블 갱신
        db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err) => {
            if (vendors && vendors.length > 0) {
                const vendorValues = vendors.map(v => [corpCd, userId, v.VENDOR_CD, 'ADMIN', new Date()]);
                db.query("INSERT INTO TCM_USERVENDOR (CORP_CD, USER_ID, VENDOR_CD, REGISTUSER, REGISTDT) VALUES ?", [vendorValues]);
            }
        });

        // Card 테이블 갱신 (이미지 항목 매핑: PROPERTY_01=카드명, 02=카드사, 03=종류, 04=유효일)
        db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err) => {
            if (cards && cards.length > 0) {
                const cardValues = cards.map(c => [
                    corpCd, userId, c.CARD_NO, c.CARDGIVE_DT, c.COLLECT_DT, c.REMARK, 
                    c.CARD_NM, c.CARD_COMPANY, c.CARD_TYPE, c.EXPIRE_DT, 'ADMIN', new Date()
                ]);
                db.query("INSERT INTO TCM_USERCARD (CORP_CD, USER_ID, CARD_NO, CARDGIVE_DT, COLLECT_DT, REMARK, PROPERTY_01, PROPERTY_02, PROPERTY_03, PROPERTY_04, REGISTUSER, REGISTDT) VALUES ?", [cardValues]);
            }
        });

        res.json({ success: true, message: '저장되었습니다.' });
    };
});

// 사용자 삭제
app.delete('/api/users/:userId', (req, res) => {
    const { userId } = req.params;
    const corpCd = '25001';

    db.query("DELETE FROM TCM_USERHDR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // 연관 데이터도 삭제
        db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);

        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// ========== Board Management APIs ==========

app.get('/api/boards', (req, res) => {
    const { startDate, endDate, title, boardSec } = req.query;
    let query = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002'";
    const params = [];
    if (startDate) { query += " AND REG_DT >= ?"; params.push(startDate); }
    if (endDate) { query += " AND REG_DT <= ?"; params.push(endDate); }
    if (title) { query += " AND TX_TITLE LIKE ?"; params.push(`%${title}%`); }
    if (boardSec) { query += " AND BOARD_SEC = ?"; params.push(boardSec); }

    query += " ORDER BY REG_DT DESC, BOARD_NO DESC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        // Convert BLOB to string
        const formattedBoards = results.map(b => ({
            ...b,
            TX_CONTENTS: b.TX_CONTENTS ? b.TX_CONTENTS.toString() : ''
        }));
        res.json({ success: true, boards: formattedBoards });
    });
});

// 게시글 상세 조회 - 게시글 클릭 시 상세 내용(TX_CONTENTS 포함) 반환
app.get('/api/boards/:boardNo', (req, res) => {
    const { boardNo } = req.params;
    const query = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND BOARD_NO = ?";
    db.query(query, [boardNo], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!results || results.length === 0) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
        
        const board = results[0];
        if (board.TX_CONTENTS) {
            board.TX_CONTENTS = board.TX_CONTENTS.toString();
        }
        res.json({ success: true, board });
    });
});

// 게시글 신규 등록 - BOARD_NO는 DB 자동 채번(AUTO_INCREMENT) 또는 MAX+1 방식
app.post('/api/boards', (req, res) => {
    const b = req.body;
    // BOARD_NO 최대값 기준 채번 (AUTO_INCREMENT 미사용 가정)
    const maxQuery = "SELECT IFNULL(MAX(CAST(BOARD_NO AS UNSIGNED)), 0) + 1 AS NEXT_NO FROM TCM_BOARD WHERE CORP_CD = '22002'";
    db.query(maxQuery, (err, maxResult) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        const nextNo = maxResult[0].NEXT_NO;
        const query = `
            INSERT INTO TCM_BOARD (
                CORP_CD, BOARD_NO, REG_DT, REG_USER, BOARD_SEC,
                TARGET_USERSEC, TARGET_YN, TOP_YN, START_DT, END_DT,
                TX_TITLE, TX_CONTENTS, POPUP_YN, USE_YN, REMARK,
                REGISTDT, REGISTUSER
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
        `;
        const params = [
            '22002',
            nextNo,
            b.REG_DT || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            b.REG_USER || 'ADMIN',
            b.BOARD_SEC || '01',
            b.TARGET_USERSEC || 'ALL',
            b.TARGET_YN || 'N',
            b.TOP_YN || 'N',
            b.START_DT,
            b.END_DT,
            b.TX_TITLE,
            b.TX_CONTENTS || '',
            b.POPUP_YN || 'N',
            b.USE_YN || 'Y',
            b.REMARK || '',
            'ADMIN'
        ];
        console.log('[API] Saving Board (POST):', { query, params });
        db.query(query, params, (e) => {
            if (e) return res.status(500).json({ success: false, message: e.message });
            res.json({ success: true, message: '등록되었습니다.', boardNo: nextNo });
        });
    });
});

// 게시글 수정 - BOARD_NO 기준으로 기존 글 업데이트
app.put('/api/boards', (req, res) => {
    const b = req.body;
    if (!b.BOARD_NO) return res.status(400).json({ success: false, message: 'BOARD_NO가 필요합니다.' });
    const query = `
        UPDATE TCM_BOARD SET
            BOARD_SEC = ?, TARGET_USERSEC = ?, TARGET_YN = ?, TOP_YN = ?,
            START_DT = ?, END_DT = ?, TX_TITLE = ?, TX_CONTENTS = ?,
            POPUP_YN = ?, USE_YN = ?, REMARK = ?,
            MODIFYDT = NOW(), MODIFYUSER = 'ADMIN'
        WHERE CORP_CD = '22002' AND BOARD_NO = ?
    `;
    const params = [
        b.BOARD_SEC || '01', 
        b.TARGET_USERSEC || 'ALL', 
        b.TARGET_YN || 'N', 
        b.TOP_YN || 'N',
        b.START_DT, 
        b.END_DT, 
        b.TX_TITLE, 
        b.TX_CONTENTS || '',
        b.POPUP_YN || 'N', 
        b.USE_YN || 'Y', 
        b.REMARK || '',
        b.BOARD_NO
    ];
    console.log('[API] Updating Board (PUT):', { query, params });
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

// 게시글 삭제 - boardNos 배열로 다중 삭제 지원
app.delete('/api/boards', (req, res) => {
    const { boardNos } = req.body;
    if (!boardNos || !Array.isArray(boardNos) || boardNos.length === 0)
        return res.status(400).json({ success: false, message: 'boardNos 배열이 필요합니다.' });
    const placeholders = boardNos.map(() => '?').join(', ');
    const query = `DELETE FROM TCM_BOARD WHERE CORP_CD = '22002' AND BOARD_NO IN (${placeholders})`;
    db.query(query, boardNos, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// ========== Basic Code Management APIs ==========

// Get codes by group name (Used for vendor dropdowns)
app.get('/api/basic-codes/by-name', (req, res) => {
    const { groupNm } = req.query;
    console.log('[API] Fetching basic codes for groupNm:', groupNm);
    if (!groupNm) return res.status(400).json({ success: false, message: 'groupNm is required' });

    // Explicitly use 25001 and handle exact match.
    const query = `
        SELECT CODE_CD, CODE_NM 
        FROM TCM_BASIC 
        WHERE CORP_CD = '25001' AND GROUP_NM = ? AND USE_YN = 'Y'
        ORDER BY SORT_SEQ, CODE_CD
    `;
    db.query(query, [groupNm], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        console.log(`[API] Found ${results ? results.length : 0} codes for ${groupNm}`);
        res.json({ success: true, codes: results });
    });
});

app.get('/api/basic-codes/groups', (req, res) => {
    const query = "SELECT GROUP_CD, MAX(GROUP_NM) AS GROUP_NM, COUNT(*) AS count FROM TCM_BASIC WHERE CORP_CD = '25001' GROUP BY GROUP_CD ORDER BY GROUP_CD";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, groups: results });
    });
});

// Get codes for a specific group
app.get('/api/basic-codes', (req, res) => {
    const { groupCd } = req.query;
    if (!groupCd) return res.status(400).json({ success: false, message: 'groupCd is required' });

    const query = "SELECT * FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? ORDER BY SORT_SEQ, CODE_CD";
    db.query(query, [groupCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

// Create new basic code
app.post('/api/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        INSERT INTO TCM_BASIC (
            CORP_CD, GROUP_CD, CODE_CD, GROUP_NM, CODE_NM, 
            CODE_PROP1, CODE_PROP2, CODE_PROP3, DESCRIPTION_TX, 
            DEFAULT_YN, USE_YN, SYSTEM_YN, RELATION_CD, SORT_SEQ, REMARK, REGISTUSER
        ) VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN')
    `;
    const params = [
        code.GROUP_CD, code.CODE_CD, code.GROUP_NM, code.CODE_NM,
        code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3, code.DESCRIPTION_TX,
        code.DEFAULT_YN || 'N', code.USE_YN || 'Y', code.SYSTEM_YN || 'N',
        code.RELATION_CD, code.SORT_SEQ || 0, code.REMARK
    ];

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '등록되었습니다.' });
    });
});

// Update basic code
app.put('/api/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        UPDATE TCM_BASIC SET 
            CODE_NM = ?, CODE_PROP1 = ?, CODE_PROP2 = ?, CODE_PROP3 = ?, 
            DESCRIPTION_TX = ?, DEFAULT_YN = ?, USE_YN = ?, SYSTEM_YN = ?, 
            RELATION_CD = ?, SORT_SEQ = ?, REMARK = ?, MODIFYUSER = 'ADMIN'
        WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?
    `;
    const params = [
        code.CODE_NM, code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3,
        code.DESCRIPTION_TX, code.DEFAULT_YN, code.USE_YN, code.SYSTEM_YN,
        code.RELATION_CD, code.SORT_SEQ, code.REMARK, code.GROUP_CD, code.CODE_CD
    ];

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

// Delete basic code
app.delete('/api/basic-codes', (req, res) => {
    const { GROUP_CD, CODE_CD } = req.body;
    if (!GROUP_CD || !CODE_CD) return res.status(400).json({ success: false, message: 'GROUP_CD and CODE_CD required' });

    const query = "DELETE FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?";
    db.query(query, [GROUP_CD, CODE_CD], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// Reorder basic codes
app.put('/api/basic-codes/reorder', (req, res) => {
    const { GROUP_CD, orders } = req.body;
    if (!GROUP_CD || !Array.isArray(orders)) return res.status(400).json({ success: false, message: 'Invalid data' });

    let completed = 0;
    let errors = [];

    if (orders.length === 0) return res.json({ success: true });

    orders.forEach(order => {
        const query = "UPDATE TCM_BASIC SET SORT_SEQ = ? WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?";
        db.query(query, [order.SORT_SEQ, GROUP_CD, order.CODE_CD], (err) => {
            if (err) errors.push(err.message);
            completed++;
            if (completed === orders.length) {
                if (errors.length > 0) res.status(500).json({ success: false, errors });
                else res.json({ success: true });
            }
        });
    });
});

// ========== Vendor Management APIs ==========

app.get('/api/vendors', (req, res) => {
    const { vendorNm, bizNo, useYn, vendorSec, vendorType } = req.query;
    let query = "SELECT * FROM TCM_VENDOR WHERE CORP_CD = '25001'";
    const params = [];

    if (vendorNm) { query += " AND VENDOR_NM LIKE ?"; params.push(`%${vendorNm}%`); }
    if (bizNo) { query += " AND BIZ_NO LIKE ?"; params.push(`%${bizNo}%`); }
    if (useYn && useYn !== 'ALL') { query += " AND STOP_YN = ?"; params.push(useYn === 'Y' ? 'Y' : 'N'); }
    if (vendorSec) { query += " AND VENDOR_SEC = ?"; params.push(vendorSec); }
    if (vendorType) { query += " AND VENDOR_TYPE = ?"; params.push(vendorType); }

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, vendors: results });
    });
});

app.post('/api/vendors/save', (req, res) => {
    const v = req.body;
    if (!v.VENDOR_CD || !v.VENDOR_NM) return res.status(400).json({ success: false, message: 'Code and Name required' });

    const checkQuery = "SELECT * FROM TCM_VENDOR WHERE CORP_CD = '25001' AND VENDOR_CD = ?";
    db.query(checkQuery, [v.VENDOR_CD], (err, results) => {
        if (results && results.length > 0) {
            const updateQuery = `
                UPDATE TCM_VENDOR SET 
                    VENDOR_NM=?, VENDOR_SNAME=?, VENDOR_SEC=?, VENDOR_TYPE=?, BIZ_NO=?, CORP_NO=?, BIZ_SEC=?, BIZ_TYPE=?, 
                    CEO_NM=?, TEL_NO=?, HP_NO=?, FAX_NO=?, CEO_EMAIL=?, BILL_EMAIL=?, START_DT=?, END_DT=?, 
                    PAY_METHOD=?, BANK_NM=?, ACCOUNT_NO=?, ACCOUNT_NM=?, PAY_DAY=?, BILL_TAX=?, STOP_YN=?, STORE_STATUS=?, 
                    ADDR=?, MAIN_VENDOR=?, IS_STORE=?, IS_ADVERTISER=?, IS_PARTNER=?, OPEN_TIME=?, CLOSE_TIME=?, 
                    BT_MODULE_YN=?, REGION_SEC=?, ROUND_TYPE=?, REPORT_EMAIL=?, DAILY_REPORT_YN=?, AD_SEC=?, 
                    AD_START_DT=?, AD_AMOUNT=?, REP_NAME=?, REP_TEL=?, HQ_NAME=?, SALES_NAME=?, UNPAID_SMS_YN=?, 
                    UNPAID_SMS_DAY=?, REMARK=?, MODIFYUSER='ADMIN'
                WHERE CORP_CD='25001' AND VENDOR_CD=?
            `;
            const params = [
                v.VENDOR_NM, v.VENDOR_SNAME, v.VENDOR_SEC, v.VENDOR_TYPE, v.BIZ_NO, v.CORP_NO, v.BIZ_SEC, v.BIZ_TYPE,
                v.CEO_NM, v.TEL_NO, v.HP_NO, v.FAX_NO, v.CEO_EMAIL, v.BILL_EMAIL, v.START_DT, v.END_DT,
                v.PAY_METHOD, v.BANK_NM, v.ACCOUNT_NO, v.ACCOUNT_NM, v.PAY_DAY, v.BILL_TAX, v.STOP_YN, v.STORE_STATUS,
                v.ADDR, v.MAIN_VENDOR, v.IS_STORE, v.IS_ADVERTISER, v.IS_PARTNER, v.OPEN_TIME, v.CLOSE_TIME,
                v.BT_MODULE_YN, v.REGION_SEC, v.ROUND_TYPE, v.REPORT_EMAIL, v.DAILY_REPORT_YN, v.AD_SEC,
                v.AD_START_DT, v.AD_AMOUNT, v.REP_NAME, v.REP_TEL, v.HQ_NAME, v.SALES_NAME, v.UNPAID_SMS_YN,
                v.UNPAID_SMS_DAY, v.REMARK, v.VENDOR_CD
            ];
            db.query(updateQuery, params, (e) => {
                if (e) return res.status(500).json({ success: false, error: e.message });
                res.json({ success: true, message: '저장되었습니다.' });
            });
        } else {
            const insertQuery = `
                INSERT INTO TCM_VENDOR (
                    CORP_CD, VENDOR_CD, VENDOR_NM, VENDOR_SNAME, VENDOR_SEC, VENDOR_TYPE, BIZ_NO, CORP_NO, BIZ_SEC, BIZ_TYPE, 
                    CEO_NM, TEL_NO, HP_NO, FAX_NO, CEO_EMAIL, BILL_EMAIL, START_DT, END_DT, 
                    PAY_METHOD, BANK_NM, ACCOUNT_NO, ACCOUNT_NM, PAY_DAY, BILL_TAX, STOP_YN, STORE_STATUS, 
                    ADDR, MAIN_VENDOR, IS_STORE, IS_ADVERTISER, IS_PARTNER, OPEN_TIME, CLOSE_TIME, 
                    BT_MODULE_YN, REGION_SEC, ROUND_TYPE, REPORT_EMAIL, DAILY_REPORT_YN, AD_SEC, 
                    AD_START_DT, AD_AMOUNT, REP_NAME, REP_TEL, HQ_NAME, SALES_NAME, UNPAID_SMS_YN, 
                    UNPAID_SMS_DAY, REMARK, REGISTUSER
                ) VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN')
            `;
            const params = [
                v.VENDOR_CD, v.VENDOR_NM, v.VENDOR_SNAME, v.VENDOR_SEC, v.VENDOR_TYPE, v.BIZ_NO, v.CORP_NO, v.BIZ_SEC, v.BIZ_TYPE,
                v.CEO_NM, v.TEL_NO, v.HP_NO, v.FAX_NO, v.CEO_EMAIL, v.BILL_EMAIL, v.START_DT, v.END_DT,
                v.PAY_METHOD, v.BANK_NM, v.ACCOUNT_NO, v.ACCOUNT_NM, v.PAY_DAY, v.BILL_TAX, v.STOP_YN, v.STORE_STATUS,
                v.ADDR, v.MAIN_VENDOR, v.IS_STORE, v.IS_ADVERTISER, v.IS_PARTNER, v.OPEN_TIME, v.CLOSE_TIME,
                v.BT_MODULE_YN, v.REGION_SEC, v.ROUND_TYPE, v.REPORT_EMAIL, v.DAILY_REPORT_YN, v.AD_SEC,
                v.AD_START_DT, v.AD_AMOUNT, v.REP_NAME, v.REP_TEL, v.HQ_NAME, v.SALES_NAME, v.UNPAID_SMS_YN,
                v.UNPAID_SMS_DAY, v.REMARK
            ];
            db.query(insertQuery, params, (e) => {
                if (e) return res.status(500).json({ success: false, error: e.message });
                res.json({ success: true, message: '등록되었습니다.' });
            });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
