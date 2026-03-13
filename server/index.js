import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import 'dotenv/config';
import * as XLSX from 'xlsx';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
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
        SELECT d.*, v.VENDOR_NM AS USE_VENDOR_NM
        FROM TCM_DEVICEINFO d
        LEFT JOIN TCM_VENDOR v ON d.CORP_CD = v.CORP_CD AND d.USE_VENDOR = v.VENDOR_CD
        WHERE d.CORP_CD = '25001'
    `;
    const params = [];

    if (startDate) { query += " AND d.INPUT_DT >= ?"; params.push(startDate); }
    if (endDate)   { query += " AND d.INPUT_DT <= ?"; params.push(endDate); }
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
        if (errors.length > 0) {
            res.status(500).json({ success: false, errors });
        } else {
            // Delete devices not in the current list (Sync)
            const currentIds = devices.map(d => d.DEVICE_ID).filter(id => id);
            if (currentIds.length > 0) {
                const placeholders = currentIds.map(() => '?').join(', ');
                const delSql = `DELETE FROM TCM_DEVICEINFO WHERE CORP_CD='25001' AND DEVICE_ID NOT IN (${placeholders})`;
                db.query(delSql, currentIds, (err) => {
                    if (err) res.status(500).json({ success: false, error: err.message });
                    else res.json({ success: true, message: '동기화되었습니다.' });
                });
            } else {
                res.json({ success: true, message: '저장되었습니다.' });
            }
        }
    };

    devices.forEach(d => {
        // Find if device already exists to decide between INSERT or UPDATE
        const checkSql = "SELECT DEVICE_ID FROM TCM_DEVICEINFO WHERE CORP_CD='25001' AND DEVICE_ID=?";
        db.query(checkSql, [d.DEVICE_ID], (err, results) => {
            if (err) {
                errors.push(err.message);
                if (++completed === devices.length) finalize();
                return;
            }

            if (results && results.length > 0) {
                // Update existing
                const sql = `UPDATE TCM_DEVICEINFO SET INPUT_DT=?, OUTPUT_DT=?, DISPOSE_DT=?, USE_VENDOR=?, USE_YN=?, REMARK=?, MODIFYDT=NOW(), MODIFYUSER='ADMIN'
                             WHERE CORP_CD='25001' AND DEVICE_ID=?`;
                db.query(sql, [d.INPUT_DT || '', d.OUTPUT_DT || '', d.DISPOSE_DT || '', d.USE_VENDOR || '', d.USE_YN, d.REMARK || '', d.DEVICE_ID], (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === devices.length) finalize();
                });
            } else {
                // Insert new
                const sql = `INSERT INTO TCM_DEVICEINFO (CORP_CD, DEVICE_ID, INPUT_DT, OUTPUT_DT, DISPOSE_DT, USE_VENDOR, USE_YN, REMARK, REGISTDT, REGISTUSER)
                             VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN')`;
                db.query(sql, [d.DEVICE_ID, d.INPUT_DT || '', d.OUTPUT_DT || '', d.DISPOSE_DT || '', d.USE_VENDOR || '', d.USE_YN || 'Y', d.REMARK || ''], (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === devices.length) finalize();
                });
            }
        });
    });
});

// 장비 삭제 - DEVICE_KEY 배열 기준 삭제
app.delete('/api/devices', (req, res) => {
    const { deviceKeys } = req.body;
    if (!deviceKeys || !Array.isArray(deviceKeys) || deviceKeys.length === 0)
        return res.status(400).json({ success: false, message: 'deviceKeys 배열이 필요합니다.' });
    const placeholders = deviceKeys.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_DEVICEINFO WHERE CORP_CD = '25001' AND DEVICE_ID IN (${placeholders})`;
    db.query(sql, deviceKeys, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// 장비 업로드용 엑셀 템플릿 다운로드
app.get('/api/device-template', (req, res) => {
    try {
        const headers = ['장비ID', '입고일자', '사용일자', '폐기일자', '점포코드', '사용가능여부', '비고'];
        const data = [
            ['DEVICE001', '20240101', '20240105', '', '25001', 'Y', '신규장비'],
            ['DEVICE002', '20240201', '', '', '22002', 'Y', '테스트용']
        ];
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Device_Template.xlsx');
        res.send(buf);
    } catch (err) {
        console.error('Template error:', err);
        res.status(500).json({ success: false, message: '템플릿 생성 실패' });
    }
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
    let query = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND USE_YN = 'Y'";
    const params = [];
    if (startDate) { query += " AND REG_DT >= ?"; params.push(startDate); }
    if (endDate) { query += " AND REG_DT <= ?"; params.push(endDate); }
    if (title) { query += " AND TX_TITLE LIKE ?"; params.push(`%${title}%`); }
    if (boardSec) { query += " AND BOARD_SEC = ?"; params.push(boardSec); }

    query += " ORDER BY REG_DT DESC, BOARD_NO DESC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
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

// 게시글 신규 등록
app.post('/api/boards', (req, res) => {
    const b = req.body;
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
            '22002', nextNo, b.REG_DT || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            b.REG_USER || 'ADMIN', b.BOARD_SEC || '01', b.TARGET_USERSEC || 'ALL', b.TARGET_YN || 'N',
            b.TOP_YN || 'N', b.START_DT, b.END_DT, b.TX_TITLE, b.TX_CONTENTS || '', b.POPUP_YN || 'N',
            b.USE_YN || 'Y', b.REMARK || '', 'ADMIN'
        ];
        db.query(query, params, (e) => {
            if (e) return res.status(500).json({ success: false, message: e.message });
            res.json({ success: true, message: '등록되었습니다.', boardNo: nextNo });
        });
    });
});

// 게시글 수정
app.put('/api/boards', (req, res) => {
    const b = req.body;
    const query = `
        UPDATE TCM_BOARD SET
            BOARD_SEC = ?, TARGET_USERSEC = ?, TARGET_YN = ?, TOP_YN = ?,
            START_DT = ?, END_DT = ?, TX_TITLE = ?, TX_CONTENTS = ?,
            POPUP_YN = ?, USE_YN = ?, REMARK = ?,
            MODIFYDT = NOW(), MODIFYUSER = 'ADMIN'
        WHERE CORP_CD = '22002' AND BOARD_NO = ?
    `;
    const params = [
        b.BOARD_SEC || '01', b.TARGET_USERSEC || 'ALL', b.TARGET_YN || 'N', b.TOP_YN || 'N',
        b.START_DT, b.END_DT, b.TX_TITLE, b.TX_CONTENTS || '', b.POPUP_YN || 'N', b.USE_YN || 'Y',
        b.REMARK || '', b.BOARD_NO
    ];
    db.query(query, params, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

// 게시글 삭제
app.delete('/api/boards', (req, res) => {
    const { boardNos } = req.body;
    const placeholders = boardNos.map(() => '?').join(', ');
    const query = `UPDATE TCM_BOARD SET USE_YN = 'N', MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' WHERE CORP_CD = '22002' AND BOARD_NO IN (${placeholders})`;
    db.query(query, boardNos, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// ========== Basic Code Management APIs ==========
app.get('/api/basic-codes/by-name', (req, res) => {
    const { groupNm } = req.query;
    const query = "SELECT CODE_CD, CODE_NM FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_NM = ? AND USE_YN = 'Y' ORDER BY SORT_SEQ, CODE_CD";
    db.query(query, [groupNm], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
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

app.get('/api/basic-codes', (req, res) => {
    const { groupCd } = req.query;
    const query = "SELECT * FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? ORDER BY SORT_SEQ, CODE_CD";
    db.query(query, [groupCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

app.post('/api/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        INSERT INTO TCM_BASIC (CORP_CD, GROUP_CD, CODE_CD, GROUP_NM, CODE_NM, CODE_PROP1, CODE_PROP2, CODE_PROP3, DESCRIPTION_TX, DEFAULT_YN, USE_YN, SYSTEM_YN, RELATION_CD, SORT_SEQ, REMARK, REGISTUSER, REGISTDT)
        VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', NOW())
    `;
    db.query(query, [code.GROUP_CD, code.CODE_CD, code.GROUP_NM, code.CODE_NM, code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3, code.DESCRIPTION_TX, code.DEFAULT_YN || 'N', code.USE_YN || 'Y', code.SYSTEM_YN || 'N', code.RELATION_CD, code.SORT_SEQ || 0, code.REMARK], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '등록되었습니다.' });
    });
});

app.put('/api/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        UPDATE TCM_BASIC SET CODE_NM = ?, CODE_PROP1 = ?, CODE_PROP2 = ?, CODE_PROP3 = ?, DESCRIPTION_TX = ?, DEFAULT_YN = ?, USE_YN = ?, SYSTEM_YN = ?, RELATION_CD = ?, SORT_SEQ = ?, REMARK = ?, MODIFYUSER = 'ADMIN', MODIFYDT = NOW()
        WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?
    `;
    db.query(query, [code.CODE_NM, code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3, code.DESCRIPTION_TX, code.DEFAULT_YN, code.USE_YN, code.SYSTEM_YN, code.RELATION_CD, code.SORT_SEQ, code.REMARK, code.GROUP_CD, code.CODE_CD], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

app.delete('/api/basic-codes', (req, res) => {
    const { GROUP_CD, CODE_CD } = req.body;
    db.query("DELETE FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?", [GROUP_CD, CODE_CD], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

app.put('/api/basic-codes/reorder', (req, res) => {
    const { GROUP_CD, orders } = req.body;
    let completed = 0;
    orders.forEach(order => {
        db.query("UPDATE TCM_BASIC SET SORT_SEQ = ? WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?", [order.SORT_SEQ, GROUP_CD, order.CODE_CD], () => {
            if (++completed === orders.length) res.json({ success: true });
        });
    });
});

// ========== Vendor Management APIs ==========
app.get('/api/vendors', (req, res) => {
    const { vendorNm, bizNo, useYn, vendorSec, vendorType, adSec } = req.query;
    let query = "SELECT * FROM TCM_VENDOR WHERE CORP_CD = '25001'";
    const params = [];
    if (vendorNm) { query += " AND (VENDOR_NM LIKE ? OR VENDOR_CD LIKE ?)"; params.push(`%${vendorNm}%`, `%${vendorNm}%`); }
    if (bizNo) { query += " AND BUSINESS_NO LIKE ?"; params.push(`%${bizNo}%`); }
    if (useYn && useYn !== 'ALL') { query += " AND CLOSE_YN = ?"; params.push(useYn); }
    if (vendorSec) { query += " AND VENDOR_SEC = ?"; params.push(vendorSec); }
    if (vendorType) { query += " AND VENDOR_TYP = ?"; params.push(vendorType); }
    if (adSec) { query += " AND DEAL_SEC = ?"; params.push(adSec); }
    query += " ORDER BY VENDOR_SEC ASC, VENDOR_CD ASC";
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, vendors: results });
    });
});

app.post('/api/vendors/save', (req, res) => {
    const v = req.body;
    db.query("SELECT * FROM TCM_VENDOR WHERE CORP_CD = '25001' AND VENDOR_CD = ?", [v.VENDOR_CD], (err, results) => {
        if (results && results.length > 0) {
            const sql = `UPDATE TCM_VENDOR SET VENDOR_NM=?, VENDOR_SHTNM=?, VENDOR_SEC=?, VENDOR_TYP=?, BUSINESS_NO=?, CORPORATE_NO=?, BUSINESS_SEC=?, BUSINESS_KND=?, PRESIDENT_NM=?, TEL_NO=?, HP_NO=?, FAX_NO=?, EMAIL=?, TAX_EMAIL=?, OPEN_DT=?, END_DT=?, PAYMENT_TYP=?, PAYMENT_BANK=?, ACCOUNT_NO=?, PAYMENT_NM=?, PAYMENT_DT=?, BILL_TYP=?, CLOSE_YN=?, DEAL_TYP=?, ADDRESS_HDR=?, ADDRESS_DET=?, VENDOR_REP=?, SALES_VENDOR=?, INPUT_VENDOR=?, OUTPUT_VENDOR=?, OPEN_TIME=?, CLOSE_TIME=?, BLE_USEYN=?, ADDR_AREA1=?, ADDR_AREA2=?, ADDR_AREA3=?, DECIMAL_SEC=?, MAINTENANCE_EMAIL=?, DAILYREPORT_YN=?, DEAL_SEC=?, PROPERTY_01=?, MAINTENANCE_AMT=?, RESPONSE_NM=?, RESPONSE_TEL=?, HEADUSER_ID=?, SALEUSER_ID=?, SMS_ALERTYN=?, SMS_ALERTDAY=?, REMARK=?, MODIFYUSER='ADMIN', MODIFYDT=NOW() WHERE CORP_CD='25001' AND VENDOR_CD=?`;
            const params = [v.VENDOR_NM, v.VENDOR_SHTNM, v.VENDOR_SEC, v.VENDOR_TYP, v.BUSINESS_NO, v.CORPORATE_NO, v.BUSINESS_SEC, v.BUSINESS_KND, v.PRESIDENT_NM, v.TEL_NO, v.HP_NO, v.FAX_NO, v.EMAIL, v.TAX_EMAIL, v.OPEN_DT, v.END_DT, v.PAYMENT_TYP, v.PAYMENT_BANK, v.ACCOUNT_NO, v.PAYMENT_NM, v.PAYMENT_DT, v.BILL_TYP, v.CLOSE_YN, v.DEAL_TYP, v.ADDRESS_HDR, v.ADDRESS_DET, v.VENDOR_REP, v.SALES_VENDOR, v.INPUT_VENDOR, v.OUTPUT_VENDOR, v.OPEN_TIME, v.CLOSE_TIME, v.BLE_USEYN, v.ADDR_AREA1, v.ADDR_AREA2, v.ADDR_AREA3, v.DECIMAL_SEC, v.MAINTENANCE_EMAIL, v.DAILYREPORT_YN, v.DEAL_SEC, v.PROPERTY_01, v.MAINTENANCE_AMT, v.RESPONSE_NM, v.RESPONSE_TEL, v.HEADUSER_ID, v.SALEUSER_ID, v.SMS_ALERTYN, v.SMS_ALERTDAY, v.REMARK, v.VENDOR_CD];
            db.query(sql, params, () => res.json({ success: true }));
        } else {
            const sql = `INSERT INTO TCM_VENDOR (CORP_CD, VENDOR_CD, VENDOR_NM, VENDOR_SHTNM, VENDOR_SEC, VENDOR_TYP, BUSINESS_NO, CORPORATE_NO, BUSINESS_SEC, BUSINESS_KND, PRESIDENT_NM, TEL_NO, HP_NO, FAX_NO, EMAIL, TAX_EMAIL, OPEN_DT, END_DT, PAYMENT_TYP, PAYMENT_BANK, ACCOUNT_NO, PAYMENT_NM, PAYMENT_DT, BILL_TYP, CLOSE_YN, DEAL_TYP, ADDRESS_HDR, ADDRESS_DET, VENDOR_REP, SALES_VENDOR, INPUT_VENDOR, OUTPUT_VENDOR, OPEN_TIME, CLOSE_TIME, BLE_USEYN, ADDR_AREA1, ADDR_AREA2, ADDR_AREA3, DECIMAL_SEC, MAINTENANCE_EMAIL, DAILYREPORT_YN, DEAL_SEC, PROPERTY_01, MAINTENANCE_AMT, RESPONSE_NM, RESPONSE_TEL, HEADUSER_ID, SALEUSER_ID, SMS_ALERTYN, SMS_ALERTDAY, REMARK, REGISTUSER, REGISTDT) VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', NOW())`;
            const params = [v.VENDOR_CD, v.VENDOR_NM, v.VENDOR_SHTNM, v.VENDOR_SEC, v.VENDOR_TYP, v.BUSINESS_NO, v.CORPORATE_NO, v.BUSINESS_SEC, v.BUSINESS_KND, v.PRESIDENT_NM, v.TEL_NO, v.HP_NO, v.FAX_NO, v.EMAIL, v.TAX_EMAIL, v.OPEN_DT, v.END_DT, v.PAYMENT_TYP, v.PAYMENT_BANK, v.ACCOUNT_NO, v.PAYMENT_NM, v.PAYMENT_DT, v.BILL_TYP, v.CLOSE_YN, v.DEAL_TYP, v.ADDRESS_HDR, v.ADDRESS_DET, v.VENDOR_REP, v.SALES_VENDOR, v.INPUT_VENDOR, v.OUTPUT_VENDOR, v.OPEN_TIME, v.CLOSE_TIME, v.BLE_USEYN, v.ADDR_AREA1, v.ADDR_AREA2, v.ADDR_AREA3, v.DECIMAL_SEC, v.MAINTENANCE_EMAIL, v.DAILYREPORT_YN, v.DEAL_SEC, v.PROPERTY_01, v.MAINTENANCE_AMT, v.RESPONSE_NM, v.RESPONSE_TEL, v.HEADUSER_ID, v.SALEUSER_ID, v.SMS_ALERTYN, v.SMS_ALERTDAY, v.REMARK];
            db.query(sql, params, () => res.json({ success: true }));
        }
    });
});

// ========== User Permission Management APIs ==========

// 프로그램 권한 설정 조회
app.get('/api/user-permissions/:userId', (req, res) => {
    const { userId } = req.params;
    console.log(`[DEBUG] Fetching permissions for userId: ${userId}`);
    const sql = `
        SELECT 
            m.MENU_ID AS PGM_ID,
            m.MENU_NM AS PROGRAM_NM,
            m.WORK_SEC AS TASK_NM,
            IFNULL(a.AUTH_MSKVAL, '0000000') AS AUTH_MSKVAL,
            a.AUTH_APPDT AS START_DT,
            a.AUTH_EPRDT AS END_DT
        FROM TCM_MENUTREE m
        LEFT JOIN TCM_ROLEPGMUSERAUTH a ON m.MENU_ID = a.PROGRAM_ID AND a.AUTH_USERID = ?
        WHERE (m.CORP_CD = '*' OR m.CORP_CD = '25001')
        ORDER BY m.DISPLAY_ORD, m.MENU_ID
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('[DEBUG] DB Error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log(`[DEBUG] Found ${results.length} menu items for ${userId}`);
        const formatted = results.map(r => {
            const msk = r.AUTH_MSKVAL || '0000000';
            return {
                ...r,
                AUTH_SEARCH: msk[0] === '1', AUTH_CONFIRM: msk[1] === '1', AUTH_SAVE: msk[2] === '1', 
                AUTH_DELETE: msk[3] === '1', AUTH_PRINT: msk[4] === '1', AUTH_EXCEL: msk[5] === '1', 
                AUTH_UPLOAD: msk[6] === '1'
            };
        });
        res.json({ success: true, permissions: formatted });
    });
});

app.get('/api/user-auth-copy-list', (req, res) => {
    db.query("SELECT USER_ID, USER_NM, USER_TYP FROM TCM_USERHDR WHERE CORP_CD = '25001' ORDER BY USER_NM", (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

app.get('/api/user-pc-auth/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = "SELECT USE_YN AS ALLOW_YN, HDD_SN AS DISK_INFO, MAC_ADDR, REMARK FROM TCM_USERAUTH WHERE CORP_CD = '25001' AND USER_ID = ?";
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, pcAuth: results.map(r => ({ ...r, ALLOW_YN: r.ALLOW_YN === 'Y' })) });
    });
});

app.post('/api/user-permissions/save', (req, res) => {
    const { userId, permissions } = req.body;
    db.query("DELETE FROM TCM_ROLEPGMUSERAUTH WHERE AUTH_USERID = ?", [userId], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (permissions.length > 0) {
            const values = permissions.map(p => {
                const msk = [p.AUTH_SEARCH?'1':'0', p.AUTH_CONFIRM?'1':'0', p.AUTH_SAVE?'1':'0', p.AUTH_DELETE?'1':'0', p.AUTH_PRINT?'1':'0', p.AUTH_EXCEL?'1':'0', p.AUTH_UPLOAD?'1':'0'].join('');
                return ['', userId, p.PGM_ID, msk, 'ADMIN', new Date()];
            });
            db.query("INSERT INTO TCM_ROLEPGMUSERAUTH (CORP_CD, AUTH_USERID, PROGRAM_ID, AUTH_MSKVAL, REGISTUSER, REGISTDT) VALUES ?", [values], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: '저장되었습니다.' });
            });
        } else res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
