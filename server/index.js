import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import 'dotenv/config';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Trigger Vite reload on backend restart
try {
    const refreshPath = path.join(process.cwd(), 'src', 'refresh-trigger.ts');
    fs.writeFileSync(refreshPath, `export const lastRestart = "${new Date().toISOString()}";`);
} catch (e) {
    console.error('Failed to update refresh-trigger.ts', e.message);
}

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

const PORT = process.env.PORT || 5001;

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
    if (endDate) { query += " AND d.INPUT_DT <= ?"; params.push(endDate); }
    if (vendorNm) { query += ' AND v.VENDOR_NM LIKE ?'; params.push(`%${vendorNm}%`); }

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
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const rnd = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
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

// 새 사용자 사번 자동 채번
app.get('/api/users/next-id', (req, res) => {
    const corpCd = '25001';
    const query = "SELECT MAX(USER_ID) as maxId FROM TCM_USERHDR WHERE CORP_CD = ?";
    db.query(query, [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const maxId = results[0].maxId;
        const nextId = maxId ? String(Number(maxId) + 1) : '2500001'; // 기본 시작값 설 정 가능
        res.json({ success: true, nextId });
    });
});

// 사용자 현황 조회 (부서/팀/직위/직책 코드명 포함)
app.get('/api/user-status', (req, res) => {
    const { startDate, endDate, userTyp, userNm, deptCd } = req.query;
    
    let query = `
        SELECT 
            h.USER_ID,
            h.USER_NM,
            DATE_FORMAT(h.REGISTDT, '%Y-%m-%d') AS REGISTDT,
            h.IPSA_DT,
            h.EXPIRE_DT,
            IFNULL(dept.CODE_NM, h.DEPT_CD) AS DEPT_NM,
            IFNULL(team.CODE_NM, h.TEAM_CD) AS TEAM_NM,
            IFNULL(pos.CODE_NM, h.POSITION_CD) AS POSITION_NM,
            IFNULL(duty.CODE_NM, h.DUTY_CD) AS DUTY_NM,
            h.USER_TEL,
            h.USER_HP,
            h.USER_EMAIL,
            h.BIRTH_DT,
            h.MARRIED_DT,
            h.ADDRESS_HDR,
            h.REMARK,
            h.USER_TYP
        FROM TCM_USERHDR h
        LEFT JOIN TCM_BASIC dept ON dept.GROUP_CD = 'DP001' AND dept.CODE_CD = h.DEPT_CD AND dept.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC team ON team.GROUP_CD = 'DP002' AND team.CODE_CD = h.TEAM_CD AND team.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC pos  ON pos.GROUP_CD = 'DP003'  AND pos.CODE_CD = h.POSITION_CD AND pos.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC duty ON duty.GROUP_CD = 'DP004' AND duty.CODE_CD = h.DUTY_CD AND duty.CORP_CD = h.CORP_CD
        WHERE h.CORP_CD = '25001'
    `;
    const params = [];

    if (startDate) {
        query += ' AND (h.IPSA_DT >= ? OR h.IPSA_DT IS NULL OR h.IPSA_DT = \'\')';
        params.push(startDate.replace(/-/g, ''));
    }
    if (endDate) {
        query += ' AND (h.IPSA_DT <= ? OR h.IPSA_DT IS NULL OR h.IPSA_DT = \'\')';
        params.push(endDate.replace(/-/g, ''));
    }
    if (deptCd) {
        query += ' AND h.DEPT_CD = ?';
        params.push(deptCd);
    }
    if (userTyp === 'S') {
        query += " AND h.USER_TYP = 'S'";
    } else if (userTyp === 'M') {
        query += " AND h.USER_TYP = 'M'";
    } else if (userTyp === 'A') {
        query += " AND h.USER_TYP = 'A'";
    }
    if (userNm) {
        query += ' AND (h.USER_NM LIKE ? OR h.USER_ID LIKE ?)';
        params.push(`%${userNm}%`, `%${userNm}%`);
    }

    query += ' ORDER BY h.SORT_SEQ, h.USER_ID';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

// 사용자 목록 조회 - TCM_USERHDR 기반
app.get('/api/users', (req, res) => {
    const { userTyp, userNm, userHp, remark } = req.query;

    let query = `
        SELECT DISTINCT h.USER_ID, h.USER_NM, h.REMARK, h.LOGIN_ID, h.USER_HP, h.USER_TYP, h.DEPT_CD, h.POSITION_CD, h.IPSA_DT, h.EMAIL_ID
        FROM TCM_USERHDR h   
        WHERE h.CORP_CD = '25001'
    `;
    const params = [];

    if (userTyp === 'S') {
        query += ' AND USER_TYP = ?';
        params.push('S');
    } else if (userTyp === 'U') {
        query += " AND USER_TYP != 'S'";
    }
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
        // 1. Vendor 테이블 갱신
        const currentVendorCodes = (vendors || []).map(v => v.VENDOR_CD).filter(cd => cd);
        
        // 목록에 없는 것 삭제
        if (currentVendorCodes.length > 0) {
            db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ? AND VENDOR_CD NOT IN (?)", [corpCd, userId, currentVendorCodes]);
        } else {
            db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        }

        // 목록에 있는 것 UPSERT
        if (vendors && vendors.length > 0) {
            vendors.forEach(v => {
                if (!v.VENDOR_CD) return;
                const sql = `
                    INSERT INTO TCM_USERVENDOR (CORP_CD, USER_ID, VENDOR_CD, REGISTUSER, REGISTDT)
                    VALUES (?, ?, ?, 'ADMIN', NOW())
                    ON DUPLICATE KEY UPDATE
                        MODIFYUSER = 'ADMIN',
                        MODIFYDT = NOW()
                `;
                db.query(sql, [corpCd, userId, v.VENDOR_CD]);
            });
        }

        // 2. Card 테이블 갱신
        const currentCardNos = (cards || []).map(c => c.CARD_NO).filter(no => no);
        
        // 목록에 없는 것 삭제
        if (currentCardNos.length > 0) {
            db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ? AND CARD_NO NOT IN (?)", [corpCd, userId, currentCardNos]);
        } else {
            db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        }

        // 목록에 있는 것 UPSERT
        if (cards && cards.length > 0) {
            cards.forEach(c => {
                if (!c.CARD_NO) return;
                const sql = `
                    INSERT INTO TCM_USERCARD 
                        (CORP_CD, USER_ID, CARD_NO, CARDGIVE_DT, COLLECT_DT, REMARK, PROPERTY_01, PROPERTY_02, PROPERTY_03, PROPERTY_04, REGISTUSER, REGISTDT)
                    VALUES 
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', NOW())
                    ON DUPLICATE KEY UPDATE
                        CARDGIVE_DT = VALUES(CARDGIVE_DT),
                        COLLECT_DT = VALUES(COLLECT_DT),
                        REMARK = VALUES(REMARK),
                        PROPERTY_01 = VALUES(PROPERTY_01),
                        PROPERTY_02 = VALUES(PROPERTY_02),
                        PROPERTY_03 = VALUES(PROPERTY_03),
                        PROPERTY_04 = VALUES(PROPERTY_04),
                        MODIFYUSER = 'ADMIN',
                        MODIFYDT = NOW()
                `;
                const vals = [
                    corpCd, userId, c.CARD_NO, c.CARDGIVE_DT, c.COLLECT_DT, c.REMARK,
                    c.CARD_NM, c.CARD_COMPANY, c.CARD_TYPE, c.EXPIRE_DT
                ];
                db.query(sql, vals);
            });
        }

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

// ========== Login Info APIs ==========

// 로그인 정보 조회 - TCM_LOGININFO 기반
app.get('/api/login-info', (req, res) => {
    const { startDate, endDate, loginYn } = req.query;
    
    // CORP_CD는 현재 고정값 '25001'로 사용 중 (요청에 따라 변경 가능)
    let query = `
        SELECT 
            LI.*,
            UH.USER_NM
        FROM TCM_LOGININFO LI
        LEFT JOIN TCM_USERHDR UH ON LI.CORP_CD = UH.CORP_CD AND LI.USER_ID = UH.USER_ID
        WHERE LI.CORP_CD = '25001'
    `;
    const params = [];

    if (startDate) {
        query += ' AND LI.LOGIN_DT >= ?';
        params.push(startDate.replace(/-/g, ''));
    }
    if (endDate) {
        query += ' AND LI.LOGIN_DT <= ?';
        params.push(endDate.replace(/-/g, ''));
    }
    if (loginYn && loginYn !== 'ALL') {
        query += ' AND LI.LOGIN_YN = ?';
        params.push(loginYn);
    }

    query += ' ORDER BY LI.LOGIN_TM DESC';

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Fetch login info error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, loginInfo: results });
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
    const { adminUserId } = req.query;

    // 1. 먼저 대상 사용자의 정보를 조회 (CORP_CD 확보용)
    db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [userId], (err, targetUserRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (targetUserRows.length === 0) return res.status(404).json({ success: false, message: '대상 사용자를 찾을 수 없습니다.' });

        const userCorpCd = targetUserRows[0].CORP_CD;

        // 2. 관리자(로그인 사용자)의 권한 레벨을 확인 (목록 노출 제한용)
        // 만약 adminUserId가 없으면 대상 사용자 본인의 레벨을 기준으로 함
        const requesterId = adminUserId || userId;

        db.query("SELECT USER_TYP FROM TCM_USERHDR WHERE USER_ID = ?", [requesterId], (err, requesterRows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            const requesterTyp = requesterRows.length > 0 ? requesterRows[0].USER_TYP : 'M';

            console.log(`[PERM_FETCH_RESTORE] Fetching exactly by assigned permissions for User: ${userId}, Corp: ${userCorpCd}`);

            const sql = `
                SELECT 
                    A.PROGRAM_ID AS PGM_ID,
                    B.MENU_NM AS PROGRAM_NM,
                    B.MENU_AUTH,
                    B.MENU_LVL,
                    B.WORK_SEC,
                    C.CODE_NM AS TASK_NM,
                    IFNULL(A.AUTH_MSKVAL, 0) AS AUTH_MSKVAL,
                    A.AUTH_APPDT AS START_DT,
                    A.AUTH_EPRDT AS END_DT
                FROM TCM_ROLEPGMUSERAUTH A
                LEFT JOIN TCM_MENUTREE B 
                    ON A.PROGRAM_ID = B.MENU_ID
                LEFT JOIN TCM_BASIC C 
                    ON C.CORP_CD = A.CORP_CD
                   AND C.GROUP_CD = 'CC001'
                   AND C.CODE_CD = B.WORK_SEC
                WHERE A.CORP_CD = ?
                  AND A.AUTH_USERID = ?
                  AND B.MENU_LVL IN (3, 5)
                ORDER BY B.DISPLAY_ORD
            `;

            db.query(sql, [userCorpCd, userId], (err, results) => {
                if (err) {
                    console.error('[PERM_FETCH_RESTORE] Error:', err.message);
                    return res.status(500).json({ success: false, error: err.message });
                }
                console.log(`[PERM_FETCH_RESTORE] Successfully retrieved ${results.length} assigned permissions for ${userId}`);

                const formatted = results.map(r => {
                    const val = Number(r.AUTH_MSKVAL) || 0;
                    const menuAuth = Number(r.MENU_AUTH) || 0;
                    return {
                        ...r,
                        AUTH_SEARCH: (val & 1) === 1,
                        AUTH_CONFIRM: (val & 2) === 2,
                        AUTH_SAVE: (val & 4) === 4,
                        AUTH_DELETE: (val & 8) === 8,
                        AUTH_PRINT: (val & 16) === 16,
                        AUTH_UPLOAD: (val & 32) === 32,
                        AUTH_EXCEL: (val & 64) === 64,
                        CAN_SEARCH: (menuAuth & 1) === 1 || (val & 1) === 1,
                        CAN_CONFIRM: (menuAuth & 2) === 2 || (val & 2) === 2,
                        CAN_SAVE: (menuAuth & 4) === 4 || (val & 4) === 4,
                        CAN_DELETE: (menuAuth & 8) === 8 || (val & 8) === 8,
                        CAN_PRINT: (menuAuth & 16) === 16 || (val & 16) === 16,
                        CAN_UPLOAD: (menuAuth & 32) === 32 || (val & 32) === 32,
                        CAN_EXCEL: (menuAuth & 64) === 64 || (val & 64) === 64
                    };
                });

                res.json({ success: true, permissions: formatted });
            });
        });
    });
});

app.get('/api/user-auth-copy-list', (req, res) => {
    // 시스템관리자(S)만 권한 복사 대상에서 제외하고, 나머지 모든 사용자(A, M, O 등 일반사용자 포함)를 표시
    db.query("SELECT USER_ID, USER_NM, USER_TYP FROM TCM_USERHDR WHERE CORP_CD = '25001' AND USER_TYP != 'S' ORDER BY USER_NM", (err, results) => {
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

    // 먼저 해당 사용자의 CORP_CD를 조회하여 정확한 삭제/저장을 보장
    db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [userId], (err, userRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (userRows.length === 0) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        const userCorpCd = userRows[0].CORP_CD;
        console.log(`[PERM_SAVE_DEBUG] userId: ${userId}, corpCd: ${userCorpCd}`);

        if (permissions && permissions.length > 0) {
            let completedCount = 0;
            let errorOccurred = false;

            permissions.forEach(p => {
                let msk = 0;
                if (p.AUTH_SEARCH) msk += 1;
                if (p.AUTH_CONFIRM) msk += 2;
                if (p.AUTH_SAVE) msk += 4;
                if (p.AUTH_DELETE) msk += 8;
                if (p.AUTH_PRINT) msk += 16;
                if (p.AUTH_UPLOAD) msk += 32;
                if (p.AUTH_EXCEL) msk += 64;

                const upsertSql = `
                    INSERT INTO TCM_ROLEPGMUSERAUTH 
                        (CORP_CD, AUTH_USERID, PROGRAM_ID, AUTH_MSKVAL, REGISTUSER, REGISTDT)
                    VALUES 
                        (?, ?, ?, ?, 'ADMIN', NOW())
                    ON DUPLICATE KEY UPDATE
                        AUTH_MSKVAL = VALUES(AUTH_MSKVAL),
                        MODIFYUSER = 'ADMIN',
                        MODIFYDT = NOW()
                `;
                
                db.query(upsertSql, [userCorpCd, userId, p.PGM_ID, msk], (err) => {
                    completedCount++;
                    if (err && !errorOccurred) {
                        errorOccurred = true;
                        return res.status(500).json({ success: false, error: err.message });
                    }
                    
                    if (completedCount === permissions.length && !errorOccurred) {
                        res.json({ success: true, message: '저장되었습니다.' });
                    }
                });
            });
        } else {
            res.json({ success: true, message: '저장할 권한 정보가 없습니다.' });
        }
    });
});

app.post('/api/user-permissions/copy', (req, res) => {
    const { sourceUserId, targetUserIds } = req.body;

    console.log(`[PERM_COPY_DEBUG] Start copy from ${sourceUserId} to [${targetUserIds}]`);

    if (!sourceUserId || !targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
        return res.status(400).json({ success: false, message: '원본 사용자 및 대상 사용자 목록이 필요합니다.' });
    }

    // 1. 원본 사용자의 권한 데이터 조회 (중복 방지를 위해 PROGRAM_ID로 그룹화)
    const getSourceSql = `
        SELECT PROGRAM_ID, MAX(AUTH_MSKVAL) as AUTH_MSKVAL, MAX(AUTH_APPDT) as AUTH_APPDT, MAX(AUTH_EPRDT) as AUTH_EPRDT 
        FROM TCM_ROLEPGMUSERAUTH 
        WHERE AUTH_USERID = ? 
        GROUP BY PROGRAM_ID
    `;
    db.query(getSourceSql, [sourceUserId], (err, sourcePerms) => {
        if (err) {
            console.error('[PERM_COPY_ERR] Fetch source error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }

        if (sourcePerms.length === 0) {
            console.warn('[PERM_COPY_WARN] No permissions found for source user:', sourceUserId);
            return res.status(400).json({ success: false, message: '복사할 권한 데이터가 없습니다. 원본 사용자의 권한을 먼저 저장해주세요.' });
        }

        console.log(`[PERM_COPY_DEBUG] Found ${sourcePerms.length} permissions for source user ${sourceUserId}`);

        // 2. 대상 사용자별로 처리
        let completedCount = 0;
        let errorOccurred = false;

        targetUserIds.forEach(targetId => {
            // 대상 사용자의 CORP_CD 조회
            db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [targetId], (err, targetRows) => {
                if (err || targetRows.length === 0) {
                    console.error(`[PERM_COPY_ERR] Target lookup failed for ${targetId}:`, err?.message || 'User not found');
                    if (!errorOccurred) {
                        errorOccurred = true;
                        res.status(500).json({ success: false, message: `대상 사용자(${targetId}) 정보 조회 실패` });
                    }
                    return;
                }

                const targetCorpCd = (targetRows && targetRows.length > 0 && targetRows[0].CORP_CD) ? targetRows[0].CORP_CD : '25001';
                console.log(`[PERM_COPY_DEBUG] Target User: ${targetId}, Identified Corp: ${targetCorpCd}`);

                // 대상 사용자의 기존 데이터를 모든 CORP_CD에 대해 일괄 삭제 (정상화 목적)
                db.query("DELETE FROM TCM_ROLEPGMUSERAUTH WHERE AUTH_USERID = ?", [targetId], (err) => {
                    if (err) {
                        console.error(`[PERM_COPY_ERR] GLOBAL DELETE failed for ${targetId}:`, err.message);
                    } else {
                        console.log(`[PERM_COPY_DEBUG] Global deleted previous permissions for ${targetId}`);
                    }

                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    const formattedToday = `${yyyy}${mm}${dd}`;

                    // 원본 데이터 삽입 (AUTH_APPDT는 오늘 날짜로, AUTH_EPRDT는 원본 그대로)
                    const values = sourcePerms.map(p => [
                        targetCorpCd, 
                        targetId, 
                        p.PROGRAM_ID, 
                        p.AUTH_MSKVAL, 
                        formattedToday, 
                        p.AUTH_EPRDT || '29991231', 
                        'ADMIN', 
                        new Date()
                    ]);
                    
                    const insertSql = "INSERT INTO TCM_ROLEPGMUSERAUTH (CORP_CD, AUTH_USERID, PROGRAM_ID, AUTH_MSKVAL, AUTH_APPDT, AUTH_EPRDT, REGISTUSER, REGISTDT) VALUES ?";
                    
                    db.query(insertSql, [values], (err, insertResult) => {
                        completedCount++;
                        if (err) {
                            console.error(`[PERM_COPY_ERR] INSERT failed for ${targetId}:`, err.message);
                        } else {
                            console.log(`[PERM_COPY_DEBUG] INSERT successful for ${targetId}: ${insertResult.affectedRows} rows added using CORP_CD: ${targetCorpCd}`);
                        }

                        if (completedCount === targetUserIds.length && !errorOccurred) {
                            res.json({ success: true, message: `${targetUserIds.length}명에게 권한이 복사되었습니다.` });
                        }
                    });
                });
            });
        });
    });
});

// ========== Contents File Management APIs ==========

// 등록일자별 요약 목록 조회 (좌측 리스트용)
app.get('/api/contents-files/dates', (req, res) => {
    const corpCd = '25001';
    const query = `
        SELECT 
            REG_DT, 
            COUNT(*) as count,
            GROUP_CONCAT(FILE_TITLE SEPARATOR ', ') as fileTitles
        FROM TCM_CONTENTS_FILE 
        WHERE CORP_CD = ?
        GROUP BY REG_DT 
        ORDER BY REG_DT DESC
    `;
    db.query(query, [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, dates: results });
    });
});


// ========== Ad Content Registration APIs ==========

// 특정 일자 또는 전체 파일 목록 조회
app.get('/api/contents-files', (req, res) => {
    const { regDt, fileTitle } = req.query;
    const corpCd = '25001';
    let query = "SELECT * FROM TCM_CONTENTS_FILE WHERE CORP_CD = ?";
    const params = [corpCd];

    if (regDt && regDt !== 'ALL') {
        query += " AND REG_DT = ?";
        params.push(regDt);
    }
    if (fileTitle) {
        query += " AND (FILE_TITLE LIKE ? OR FILE_NAME LIKE ?)";
        params.push(`%${fileTitle}%`, `%${fileTitle}%`);
    }

    query += " ORDER BY REGISTDT DESC, FILE_KEY DESC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, files: results });
    });
});

// 파일 정보 저장/수정
app.post('/api/contents-files/save', (req, res) => {
    const files = Array.isArray(req.body) ? req.body : [req.body];
    const corpCd = '25001';
    
    if (files.length === 0) return res.status(400).json({ success: false, message: '데이터가 없습니다.' });

    let completed = 0;
    let errors = [];

    const finalize = () => {
        if (errors.length > 0) res.status(500).json({ success: false, errors });
        else res.json({ success: true, message: '저장되었습니다.' });
    };

    files.forEach(f => {
        const checkSql = "SELECT FILE_KEY FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? AND FILE_KEY = ?";
        db.query(checkSql, [corpCd, f.FILE_KEY], (err, results) => {
            if (err) {
                errors.push(err.message);
                if (++completed === files.length) finalize();
                return;
            }

            if (results.length > 0) {
                // Update
                const sql = `
                    UPDATE TCM_CONTENTS_FILE SET 
                        REG_DT = ?, FILE_NAME = ?, FILE_TITLE = ?, FTP_FILENAME = ?, 
                        FILE_MD5 = ?, FILE_SIZE = ?, FILE_TYP = ?, USE_YN = ?, 
                        REMARK = ?, ASPECTRATIO_YN = ?, SCREEN_WIDTH = ?, SCREEN_HEIGHT = ?, 
                        TEMP_USEYN = ?, MODIFYDT = NOW(), MODIFYUSER = 'ADMIN'
                    WHERE CORP_CD = ? AND FILE_KEY = ?
                `;
                const params = [
                    f.REG_DT, f.FILE_NAME, f.FILE_TITLE, f.FTP_FILENAME,
                    f.FILE_MD5, f.FILE_SIZE, f.FILE_TYP, f.USE_YN || 'Y',
                    f.REMARK, f.ASPECTRATIO_YN || 'N', f.SCREEN_WIDTH, f.SCREEN_HEIGHT,
                    f.TEMP_USEYN || 'N', corpCd, f.FILE_KEY
                ];
                db.query(sql, params, (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === files.length) finalize();
                });
            } else {
                // Insert
                const sql = `
                    INSERT INTO TCM_CONTENTS_FILE (
                        CORP_CD, REG_DT, FILE_KEY, FILE_NAME, FILE_TITLE, FTP_FILENAME,
                        FILE_MD5, FILE_SIZE, FILE_TYP, USE_YN, REMARK, REGISTDT, REGISTUSER,
                        ASPECTRATIO_YN, SCREEN_WIDTH, SCREEN_HEIGHT, TEMP_USEYN
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN', ?, ?, ?, ?)
                `;
                const params = [
                    corpCd, f.REG_DT, f.FILE_KEY, f.FILE_NAME, f.FILE_TITLE, f.FTP_FILENAME,
                    f.FILE_MD5, f.FILE_SIZE, f.FILE_TYP, f.USE_YN || 'Y', f.REMARK,
                    f.ASPECTRATIO_YN || 'N', f.SCREEN_WIDTH, f.SCREEN_HEIGHT, f.TEMP_USEYN || 'N'
                ];
                db.query(sql, params, (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === files.length) finalize();
                });
            }
        });
    });
});

// 파일 삭제
app.delete('/api/contents-files', (req, res) => {
    const { fileKeys } = req.body;
    const corpCd = '25001';
    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0)
        return res.status(400).json({ success: false, message: 'fileKeys 배열이 필요합니다.' });

    const placeholders = fileKeys.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? AND FILE_KEY IN (${placeholders})`;
    db.query(sql, [corpCd, ...fileKeys], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// 공통 코드 조회
app.get('/api/common/codes/:groupCd', (req, res) => {
    const { groupCd } = req.params;
    const query = "SELECT CORP_CD, CODE_CD, CODE_NM FROM TCM_BASIC WHERE GROUP_CD = ? AND USE_YN = 'Y' ORDER BY SORT_SEQ";
    db.query(query, [groupCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

// 광고 컨텐츠 요약 목록 조회 (좌측 리스트용)
app.get('/api/ad-contents', (req, res) => {
    const { startDate, endDate, advertiser } = req.query;
    const corpCd = '25001';
    
    let query = `
        SELECT 
            C.REG_DT,
            V.VENDOR_NM AS ADVERTISER,
            C.CONTENTS_NM AS TITLE,
            C.CONTENTS_KEY AS CONTENTS_ID,
            C.USE_YN,
            (SELECT COUNT(*) FROM TCM_CONTENTS_LIST WHERE CORP_CD = C.CORP_CD AND CONTENTS_KEY = C.CONTENTS_KEY) as FILE_COUNT
        FROM TCM_CONTENTS C
        LEFT JOIN TCM_VENDOR V ON C.CORP_CD = V.CORP_CD AND C.VENDOR_CD = V.VENDOR_CD
        WHERE C.CORP_CD = ?
    `;
    const params = [corpCd];

    if (startDate) { query += " AND C.REG_DT >= ?"; params.push(startDate.replace(/-/g, '')); }
    if (endDate) { query += " AND C.REG_DT <= ?"; params.push(endDate.replace(/-/g, '')); }
    if (advertiser) { query += " AND (V.VENDOR_NM LIKE ? OR C.CONTENTS_NM LIKE ?)"; params.push(`%${advertiser}%`, `%${advertiser}%`); }

    query += " ORDER BY C.REG_DT DESC, C.CONTENTS_KEY DESC";

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('[ERROR_AD] Fetch ad contents failed:', err.message);
            fs.appendFileSync('ad_error.log', `[${new Date().toISOString()}] LEFT_LIST: ${err.message}\n`);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, contents: results });
    });
});

// 특정 광고 컨텐츠의 파일 목록 조회 (우측 리스트용)
app.get('/api/ad-contents/files', (req, res) => {
    const { contentsId } = req.query;
    const corpCd = '25001';
    
    if (!contentsId) return res.status(400).json({ success: false, message: 'contentsId가 필요합니다.' });

    const query = `
        SELECT
            A.CONTENTS_KEY AS EDT_CONTENTS_KEY,
            A.CONTENTS_NM AS edt_Contents_NM,
            A.REG_DT AS dtp_Reg_DT,
            A.USE_YN AS chk_UseYn,
            FCM_GET_CORPNM(A.CORP_CD, 'F') AS edt_Company,
            FCM_GET_VENDORNM(A.CORP_CD, A.VENDOR_CD, 'F') AS edt_Vendor,
            CASE
                WHEN (ROUND((C.FILE_SIZE / 1024) * 0.1, 2) >= 1)
                    THEN CONCAT(ROUND((C.FILE_SIZE / 1024) * 0.001, 2), 'MB')
                ELSE CONCAT(ROUND((C.FILE_SIZE / 1024), 2), 'KB')
            END AS FILE_SIZE_STR,
            C.FTP_FILENAME AS DB_FTP_FILENAME,
            C.FILE_NAME AS DB_FILE_NAME,
            C.FILE_KEY AS DB_FILE_KEY,
            C.FILE_MD5 AS DB_FILE_MD5,
            C.FILE_SIZE AS DB_FILE_SIZE,
            B.DISP_SEQ AS PLAY_SEQ,
            B.IMAGE_DELAY AS DELAY_TIME,
            B.IN_EFFECT AS EFFECT_IN,
            B.OUT_EFFECT AS EFFECT_OUT,
            B.USE_YN,
            B.REMARK,
            C.FILE_KEY,
            C.FILE_NAME,
            C.FILE_TITLE,
            C.FILE_SIZE,
            C.FILE_MD5
        FROM TCM_CONTENTS A
        LEFT OUTER JOIN TCM_CONTENTS_LIST B
            ON A.CORP_CD = B.CORP_CD
           AND A.CONTENTS_KEY = B.CONTENTS_KEY
        JOIN TCM_CONTENTS_FILE C
            ON B.CORP_CD = C.CORP_CD
           AND B.FILE_KEY = C.FILE_KEY
        WHERE A.CORP_CD = ?
          AND A.CONTENTS_KEY = ?
        ORDER BY B.DISP_SEQ
    `;
    db.query(query, [corpCd, contentsId], (err, results) => {
        if (err) {
            console.error('[ERROR_AD] Fetch ad files failed:', err.message);
            fs.appendFileSync('ad_error.log', `[${new Date().toISOString()}] RIGHT_LIST: ${err.message}\n SQL: ${query}\n`);
            
            // 만약 전용 함수(FCM_GET_...)가 없어서 에러난 경우를 대비해 단순 쿼리로 재시도
            const fallbackQuery = `
                SELECT 
                    L.FILE_KEY, F.FILE_NAME, F.FILE_TITLE, L.USE_YN, L.DISP_SEQ AS PLAY_SEQ,
                    L.IMAGE_DELAY AS DELAY_TIME, L.IN_EFFECT AS EFFECT_IN, L.OUT_EFFECT AS EFFECT_OUT,
                    F.FILE_SIZE, F.FILE_MD5, L.REMARK
                FROM TCM_CONTENTS_LIST L
                JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY
                WHERE L.CORP_CD = ? AND L.CONTENTS_KEY = ?
                ORDER BY L.DISP_SEQ ASC
            `;
            db.query(fallbackQuery, [corpCd, contentsId], (err2, results2) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({ success: true, files: results2 });
            });
            return;
        }
        res.json({ success: true, files: results });
    });
});

// 광고 컨텐츠 및 상세 파일 속성 저장/수정
app.post('/api/ad-contents/save', (req, res) => {
    const { content, files } = req.body; 
    const corpCd = '25001';

    if (!content || !content.CONTENTS_ID) {
        return res.status(400).json({ success: false, message: '컨텐츠 정보(CONTENTS_ID)가 없습니다.' });
    }

    const contentsId = content.CONTENTS_ID;

    // 1. 광고 기본 정보 업데이트 (TCM_CONTENTS)
    const updateContentSql = `
        UPDATE TCM_CONTENTS 
        SET CONTENTS_NM = ?, USE_YN = ?, MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' 
        WHERE CORP_CD = ? AND CONTENTS_KEY = ?
    `;
    
    db.query(updateContentSql, [content.TITLE, content.USE_YN, corpCd, contentsId], (err) => {
        if (err) return res.status(500).json({ success: false, error: '광고 기본 정보 저장 실패: ' + err.message });

        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.json({ success: true, message: '기본 정보가 저장되었습니다.' });
        }

        // 2. 상세 파일 속성 업데이트 (TCM_CONTENTS_LIST & TCM_CONTENTS_FILE)
        let completed = 0;
        let errors = [];

        files.forEach(f => {
            // TCM_CONTENTS_LIST 업데이트 (매핑 속성)
            const updateListSql = `
                UPDATE TCM_CONTENTS_LIST 
                SET DISP_SEQ = ?, IMAGE_DELAY = ?, IN_EFFECT = ?, OUT_EFFECT = ?, USE_YN = ?, REMARK = ?, MODIFYDT = NOW()
                WHERE CORP_CD = ? AND CONTENTS_KEY = ? AND FILE_KEY = ?
            `;
            const listParams = [
                f.PLAY_SEQ, f.DELAY_TIME, f.EFFECT_IN, f.EFFECT_OUT, f.USE_YN, f.REMARK,
                corpCd, contentsId, f.FILE_KEY
            ];

            db.query(updateListSql, listParams, (err1) => {
                if (err1) errors.push(`LIST(${f.FILE_KEY}) error: ${err1.message}`);

                // TCM_CONTENTS_FILE 업데이트 (파일명 등 공유 속성 - 필요시)
                const updateFileSql = `
                    UPDATE TCM_CONTENTS_FILE 
                    SET FILE_NAME = ?, MODIFYDT = NOW()
                    WHERE CORP_CD = ? AND FILE_KEY = ?
                `;
                db.query(updateFileSql, [f.FILE_NAME, corpCd, f.FILE_KEY], (err2) => {
                    if (err2) errors.push(`FILE(${f.FILE_KEY}) error: ${err2.message}`);
                    
                    completed++;
                    if (completed === files.length) {
                        if (errors.length > 0) {
                            res.status(500).json({ success: false, errors });
                        } else {
                            res.json({ success: true, message: '모든 수정한 정보가 저장되었습니다.' });
                        }
                    }
                });
            });
        });
    });
});


// ========== Ad Schedule Setting APIs ==========

// 스케쥴 목록 조회 (좌측 리스트)
app.get('/api/ad-schedules', (req, res) => {
    const { startDate, endDate, vendorCd } = req.query;
    const corpCd = '25001';
    
    // 사용자가 제공한 SQL 기반 쿼리
    let query = `
        SELECT
            A.REG_DT,
            FCM_GET_CODENM(A.CORP_CD, 'PR010', A.SCHEDULE_SEC, 'N') AS SCH_TYPE_NM,
            (
                SELECT COUNT(DISTINCT VENDOR_CD)
                FROM TCM_VENDOR_SCH
                WHERE CORP_CD = A.CORP_CD
                  AND SCHEDULE_KEY = A.SCHEDULE_KEY
            ) AS VENDOR_COUNT,
            A.SCHEDULE_KEY
        FROM TCM_VENDOR_SCH A
        WHERE A.CORP_CD = ?
    `;
    const params = [corpCd];

    if (startDate && endDate) {
        query += " AND A.REG_DT BETWEEN ? AND ?";
        params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, ''));
    }

    if (vendorCd) {
        query += " AND A.VENDOR_CD = ?";
        params.push(vendorCd);
    }

    query += `
        GROUP BY A.SCHEDULE_KEY, A.REG_DT, A.SCHEDULE_SEC, A.CORP_CD
        ORDER BY A.REG_DT, A.SCHEDULE_KEY
    `;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Ad Schedule Query Error:', err.message);
            // 함수 오류, 프로시저 테이블 오류 등 모든 SQL 오류 시 폴백 실행
            const isFunctionError = err.message.includes('FCM_GET_CODENM') || 
                                   err.message.includes('does not exist') || 
                                   err.message.includes('mysql.proc');
            
            if (isFunctionError) {
                let fallbackQuery = `
                    SELECT
                        A.REG_DT,
                        CASE WHEN A.SCHEDULE_SEC = '01' THEN '개별매장' ELSE A.SCHEDULE_SEC END AS SCH_TYPE_NM,
                        (
                            SELECT COUNT(DISTINCT VENDOR_CD)
                            FROM TCM_VENDOR_SCH
                            WHERE CORP_CD = A.CORP_CD
                              AND SCHEDULE_KEY = A.SCHEDULE_KEY
                        ) AS VENDOR_COUNT,
                        A.SCHEDULE_KEY
                    FROM TCM_VENDOR_SCH A
                    WHERE A.CORP_CD = ?
                `;
                const fallbackParams = [corpCd];
                if (startDate && endDate) {
                    fallbackQuery += " AND A.REG_DT BETWEEN ? AND ?";
                    fallbackParams.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, ''));
                }
                if (vendorCd) {
                    fallbackQuery += " AND A.VENDOR_CD = ?";
                    fallbackParams.push(vendorCd);
                }
                fallbackQuery += " GROUP BY A.SCHEDULE_KEY, A.REG_DT, A.SCHEDULE_SEC, A.CORP_CD ORDER BY A.REG_DT, A.SCHEDULE_KEY";
                
                db.query(fallbackQuery, fallbackParams, (err2, results2) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    res.json({ success: true, schedules: results2 });
                });
            } else {
                return res.status(500).json({ success: false, error: err.message });
            }
        } else {
            res.json({ success: true, schedules: results });
        }
    });
});

// 특정 스케쥴의 할당 점포 및 그리드 데이터 조회
app.get('/api/ad-schedules/detail', (req, res) => {
    const { scheduleKey } = req.query;
    const corpCd = '25001';

    if (!scheduleKey) return res.status(400).json({ success: false, message: 'scheduleKey가 필요합니다.' });

    // 점포 목록과 그리드 1개(보통 요일별로 여러개일 수 있으나 일단 해당 키의 전체 데이터)
    const query = `
        SELECT S.*, V.VENDOR_NM 
        FROM TCM_VENDOR_SCH S
        LEFT JOIN TCM_VENDOR V ON S.CORP_CD = V.CORP_CD AND S.VENDOR_CD = V.VENDOR_CD
        WHERE S.CORP_CD = ? AND S.SCHEDULE_KEY = ?
    `;

    db.query(query, [corpCd, scheduleKey], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, details: results });
    });
});

// 일괄 적용용 스케쥴 템플릿 목록 조회 (대표 점포명 포함)
app.get('/api/ad-schedules/templates', (req, res) => {
    const corpCd = '25001';
    const query = `
        SELECT A.SCHEDULE_KEY, A.REG_DT, 
               (SELECT VENDOR_NM FROM TCM_VENDOR WHERE CORP_CD = A.CORP_CD AND VENDOR_CD = MIN(A.VENDOR_CD)) as REPRESENTATIVE_VENDOR_NM
        FROM TCM_VENDOR_SCH A
        WHERE A.CORP_CD = ?
        GROUP BY A.SCHEDULE_KEY, A.REG_DT
        ORDER BY A.REG_DT DESC
    `;
    db.query(query, [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, templates: results });
    });
});

// 스케쥴 저장
app.post('/api/ad-schedules/save', (req, res) => {
    const { schedule, vendorCodes, gridData } = req.body; // gridData: [{ DAY_SEC: '1', SCH_00: '...', ... }, ...]
    const corpCd = '25001';

    if (!vendorCodes || !Array.isArray(vendorCodes) || vendorCodes.length === 0) {
        return res.status(400).json({ success: false, message: '대상 점포가 선택되지 않았습니다.' });
    }

    const scheduleKey = schedule.SCHEDULE_KEY || `SC${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(2, 16)}`;
    const regDt = schedule.REG_DT?.replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const startDt = schedule.START_DT?.replace(/-/g, '') || regDt;
    const endDt = schedule.END_DT?.replace(/-/g, '') || '20301231';
    
    let totalRequests = vendorCodes.length * gridData.length;
    let completed = 0;
    let errors = [];

    const handleFinalize = () => {
        if (completed === totalRequests) {
            if (errors.length > 0) return res.status(500).json({ success: false, errors });
            res.json({ success: true, message: '저장되었습니다.', scheduleKey });
        }
    };

    vendorCodes.forEach(vCd => {
        gridData.forEach(day => {
            const sql = `
                INSERT INTO TCM_VENDOR_SCH (
                    CORP_CD, SCHEDULE_KEY, REG_DT, SCHEDULE_SEC, VENDOR_CD, START_DT, END_DT, DAY_SEC, USE_YN,
                    SCH_00, SCH_01, SCH_02, SCH_03, SCH_04, SCH_05, SCH_06, SCH_07, SCH_08, SCH_09, SCH_10, SCH_11,
                    SCH_12, SCH_13, SCH_14, SCH_15, SCH_16, SCH_17, SCH_18, SCH_19, SCH_20, SCH_21, SCH_22, SCH_23,
                    REGISTDT, REGISTUSER
                ) VALUES (?, ?, ?, '01', ?, ?, ?, ?, 'Y', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), 'ADMIN')
                ON DUPLICATE KEY UPDATE 
                    SCH_00=VALUES(SCH_00), SCH_01=VALUES(SCH_01), SCH_02=VALUES(SCH_02), SCH_03=VALUES(SCH_03), 
                    SCH_04=VALUES(SCH_04), SCH_05=VALUES(SCH_05), SCH_06=VALUES(SCH_06), SCH_07=VALUES(SCH_07),
                    SCH_08=VALUES(SCH_08), SCH_09=VALUES(SCH_09), SCH_10=VALUES(SCH_10), SCH_11=VALUES(SCH_11),
                    SCH_12=VALUES(SCH_12), SCH_13=VALUES(SCH_13), SCH_14=VALUES(SCH_14), SCH_15=VALUES(SCH_15),
                    SCH_16=VALUES(SCH_16), SCH_17=VALUES(SCH_17), SCH_18=VALUES(SCH_18), SCH_19=VALUES(SCH_19),
                    SCH_20=VALUES(SCH_20), SCH_21=VALUES(SCH_21), SCH_22=VALUES(SCH_22), SCH_23=VALUES(SCH_23),
                    MODIFYDT=NOW(), MODIFYUSER='ADMIN'
            `;
            
            const params = [
                corpCd, scheduleKey, regDt, vCd, startDt, endDt, day.DAY_SEC,
                day.SCH_00 || '', day.SCH_01 || '', day.SCH_02 || '', day.SCH_03 || '',
                day.SCH_04 || '', day.SCH_05 || '', day.SCH_06 || '', day.SCH_07 || '',
                day.SCH_08 || '', day.SCH_09 || '', day.SCH_10 || '', day.SCH_11 || '',
                day.SCH_12 || '', day.SCH_13 || '', day.SCH_14 || '', day.SCH_15 || '',
                day.SCH_16 || '', day.SCH_17 || '', day.SCH_18 || '', day.SCH_19 || '',
                day.SCH_20 || '', day.SCH_21 || '', day.SCH_22 || '', day.SCH_23 || ''
            ];

            db.query(sql, params, (err) => {
                if (err) errors.push(`${vCd} day ${day.DAY_SEC} error: ${err.message}`);
                completed++;
                handleFinalize();
            });
        });
    });
});

// 당일 적용 스케쥴 조회
app.get('/api/today-applied-schedules', (req, res) => {
    const { vendorNm } = req.query;
    const corpCd = '25001';
    const today = new Date();
    const daySec = today.getDay().toString(); // 0(일) ~ 6(토)

    const query = `
        SELECT 
            V.VENDOR_CD,
            V.VENDOR_NM,
            V.OPEN_TIME,
            V.CLOSE_TIME,
            S.SCH_00, S.SCH_01, S.SCH_02, S.SCH_03, S.SCH_04, S.SCH_05, S.SCH_06, S.SCH_07, S.SCH_08, S.SCH_09, S.SCH_10, S.SCH_11,
            S.SCH_12, S.SCH_13, S.SCH_14, S.SCH_15, S.SCH_16, S.SCH_17, S.SCH_18, S.SCH_19, S.SCH_20, S.SCH_21, S.SCH_22, S.SCH_23
        FROM TCM_VENDOR V
        LEFT JOIN TCM_VENDOR_SCH S ON V.CORP_CD = S.CORP_CD 
            AND V.VENDOR_CD = S.VENDOR_CD 
            AND S.DAY_SEC = ? 
            AND S.USE_YN = 'Y'
            AND DATE_FORMAT(NOW(), '%Y%m%d') BETWEEN S.START_DT AND S.END_DT
        WHERE V.CORP_CD = ?
          AND V.VENDOR_SEC = '2' -- 점포
    `;
    
    let sql = query;
    const params = [daySec, corpCd];
    if (vendorNm) {
        sql += " AND V.VENDOR_NM LIKE ?";
        params.push(`%${vendorNm}%`);
    }
    sql += " ORDER BY V.VENDOR_NM ASC";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Fetch today schedules error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, schedules: results });
    });
});

// ========== Vendor Status APIs ==========

// 거래처 현황 조회 - TCM_VENDOR 기반
app.get('/api/vendor-status', (req, res) => {
    const { vendorSec, vendorNm, closeYn, dealSec } = req.query;
    const corpCd = '25001';
    
    let query = `
        SELECT 
            V.*,
            (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD005' AND CODE_CD = V.VENDOR_SEC) AS VENDOR_SEC_NM,
            (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD020' AND CODE_CD = V.VENDOR_TYP) AS VENDOR_TYP_NM,
            (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD022' AND CODE_CD = V.MAINTENANCE_SEC) AS DEAL_SEC_NM,
            V.ADDRESS_HDR, V.ADDRESS_DET, V.MAINTENANCE_AMT,
            (V.MAINTENANCE_AMT / 12) AS MONTH_AMT,
            (V.MAINTENANCE_AMT * 1) AS YEAR_AMT,
            V.MAINTENANCE_DAY
        FROM TCM_VENDOR V
        WHERE V.CORP_CD = ?
    `;
    const params = [corpCd];

    if (vendorSec && vendorSec !== 'ALL') {
        query += " AND V.VENDOR_SEC = ?";
        params.push(vendorSec);
    }
    if (vendorNm) {
        query += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)";
        params.push(`%${vendorNm}%`, `%${vendorNm}%`);
    }
    if (closeYn && closeYn !== 'ALL') {
        query += " AND V.CLOSE_YN = ?";
        params.push(closeYn);
    }
    if (dealSec && dealSec !== 'ALL') {
        query += " AND V.MAINTENANCE_SEC = ?";
        params.push(dealSec);
    }

    query += " ORDER BY V.VENDOR_SEC ASC, V.VENDOR_NM ASC";

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Fetch vendor status error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, vendors: results });
    });
});

// ========== Store Status Verification APIs ==========

// 점포 상태 확인 조회 - TCM_VENDOR, TCM_VENDOR_DEVICE, TPR_DPLOG 조합
app.get('/api/store-status', (req, res) => {
    const { vendorNm, area1, area2, area3, status } = req.query;
    const corpCd = '25001';

    // 점포 상태 확인을 위한 통합 쿼리
    // TCM_VENDOR: 기본 점포 정보
    // TCM_VENDOR_DEVICE: 장비 상태 정보 (ON/OFF 용)
    // TPR_DPLOG: 현재 송출 중인 정보 및 마지막 접속 정보
    let query = `
        SELECT 
            V.VENDOR_CD,
            V.VENDOR_NM,
            V.OPEN_TIME,
            V.CLOSE_TIME,
            V.ADDR_AREA1,
            V.ADDR_AREA2,
            V.ADDR_AREA3,
            VD.DEVICE_ID,
            VD.USE_YN AS DEVICE_USE_YN,
            CASE 
                WHEN L.REGISTDT >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'ON'
                ELSE 'OFF'
            END AS STATUS,
            L.REGISTDT AS LAST_CONN_DT,
            L.CUR_PROGRAM AS PGM_NM,
            L.CUR_FILE AS FILE_NM,
            L.OPEN_TIME AS START_TM,
            L.CLOSE_TIME AS END_TM,
            '' AS PLAY_TIME,
            L.FILE_LIST AS CT_FILE
        FROM TCM_VENDOR V
        LEFT JOIN TCM_VENDOR_DEVICE VD ON V.CORP_CD = VD.CORP_CD AND V.VENDOR_CD = VD.VENDOR_CD
        LEFT JOIN (
            -- 최신 로그 1건만 조인 (REGISTDT 필드가 타임스탬프)
            SELECT t.* FROM TPR_DPLOG t
            INNER JOIN (
                SELECT CORP_CD, VENDOR_CD, DEVICE_ID, MAX(REGISTDT) as MAX_REGISTDT
                FROM TPR_DPLOG
                GROUP BY CORP_CD, VENDOR_CD, DEVICE_ID
            ) m ON t.CORP_CD = m.CORP_CD AND t.VENDOR_CD = m.VENDOR_CD AND t.DEVICE_ID = m.DEVICE_ID AND t.REGISTDT = m.MAX_REGISTDT
        ) L ON V.CORP_CD = L.CORP_CD AND V.VENDOR_CD = L.VENDOR_CD AND VD.DEVICE_ID = L.DEVICE_ID
        WHERE V.CORP_CD = ? AND V.VENDOR_SEC = '2'
    `;
    
    const params = [corpCd];

    if (vendorNm) {
        query += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)";
        params.push(`%${vendorNm}%`, `%${vendorNm}%`);
    }
    if (area1 && area1 !== 'ALL') {
        query += " AND V.ADDR_AREA1 = ?";
        params.push(area1);
    }
    if (area2 && area2 !== 'ALL') {
        query += " AND V.ADDR_AREA2 = ?";
        params.push(area2);
    }
    if (area3 && area3 !== 'ALL') {
        query += " AND V.ADDR_AREA3 = ?";
        params.push(area3);
    }

    query += " ORDER BY V.VENDOR_NM ASC, VD.DEVICE_ID ASC";

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('[ERROR_STORE_STATUS] Fetch failed:', err.message);
            // 테이블이 없는 경우 등을 대비한 에러 처리
            return res.status(500).json({ 
                success: false, 
                message: '데이터를 불러오는 중 오류가 발생했습니다. (테이블 정의 확인 필요)',
                error: err.message 
            });
        }

        // 상태값(ON/OFF) 필터링 (메모리 필터링 또는 쿼리 추가 가능하나 일단 수동 필터링 지원)
        let filteredResults = results;
        if (status && status !== 'ALL') {
            filteredResults = results.filter(r => r.STATUS === status);
        }

        res.json({ success: true, statusList: filteredResults });
    });
});

// 광고송출 로그조회 - TPR_DPLOG 메인 (페이징 추가)
app.get('/api/ad-play-logs', (req, res) => {
    const { startDate, endDate, vendorNm, area1, area2, area3, page = 1, pageSize = 100 } = req.query;
    const corpCd = '25001';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    let baseQuery = `
        FROM TPR_DPLOG L
        LEFT JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD
        WHERE L.CORP_CD = ?
    `;
    
    let whereClause = "";
    const params = [corpCd];

    if (startDate && endDate) {
        whereClause += " AND L.LOG_DT BETWEEN ? AND ?";
        params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, ''));
    } else {
        whereClause += " AND L.LOG_DT >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 60 DAY), '%Y%m%d')";
    }

    if (vendorNm) {
        whereClause += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)";
        params.push(`%${vendorNm}%`, `%${vendorNm}%`);
    }

    if (area1 && area1 !== 'ALL') {
        whereClause += " AND V.ADDR_AREA1 = ?";
        params.push(area1);
    }
    if (area2 && area2 !== 'ALL') {
        whereClause += " AND V.ADDR_AREA2 = ?";
        params.push(area2);
    }
    if (area3 && area3 !== 'ALL') {
        whereClause += " AND V.ADDR_AREA3 = ?";
        params.push(area3);
    }

    // 1. 전체 건수 조회
    const countQuery = `SELECT COUNT(*) as totalCount ` + baseQuery + whereClause;
    
    db.query(countQuery, params, (err, countResult) => {
        if (err) {
            console.error('[ERROR_AD_PLAY_LOG_COUNT] Count failed:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        const totalCount = countResult[0].totalCount;

        // 2. 페이징 데이터 조회
        const dataQuery = `
            SELECT 
                V.VENDOR_NM, L.DEVICE_ID, L.DEVICE_NM,
                V.OPEN_TIME AS VENDOR_OPEN_TIME, V.CLOSE_TIME AS VENDOR_CLOSE_TIME,
                L.LOG_DT, L.LOG_TIME, L.CT_TIME, L.CT_TIMELOC,
                L.CT_OPENTIME, L.CT_CLOSETIME, L.IP_ADDRESS,
                L.CUR_PROGRAM, L.CUR_FILE
            ` + baseQuery + whereClause + `
            ORDER BY L.LOG_DT DESC, L.LOG_TIME DESC 
            LIMIT ? OFFSET ?
        `;
        
        db.query(dataQuery, [...params, limit, offset], (err2, results) => {
            if (err2) {
                console.error('[ERROR_AD_PLAY_LOG_DATA] Data fetch failed:', err2.message);
                return res.status(500).json({ success: false, error: err2.message });
            }
            
            res.json({ 
                success: true, 
                logs: results,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: parseInt(page)
            });
        });
    });
});

// 컨텐츠별 집계조회
app.get('/api/content-agg', (req, res) => {
    const { startDate, endDate, area1, advertiser, content } = req.query;
    const corpCd = '25001';

    // 1. 브랜드 목록(점포그룹) 가져오기 (VENDOR_SEC = '1' 인 것들이 그룹 헤더가 됨)
    const brandQuery = `
        SELECT DISTINCT VENDOR_NM as BRAND
        FROM TCM_VENDOR
        WHERE CORP_CD = ? AND VENDOR_SEC = '1'
        ORDER BY BRAND
    `;

    db.query(brandQuery, [corpCd], (err, brandsResults) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        const brands = brandsResults.map(b => b.BRAND).filter(b => b);
        
        // 2. 피벗 컬럼 생성 (브랜드명으로 시작하는 점포의 로그를 카운트)
        let pivotCols = "";
        brands.forEach(brand => {
            pivotCols += `, SUM(CASE WHEN V.VENDOR_NM LIKE CONCAT(${db.escape(brand)}, '%') THEN 1 ELSE 0 END) AS ${db.escape(brand)}`;
        });

        // 3. 메인 집계 쿼리
        let query = `
            SELECT 
                L.LOG_DT,
                L.CUR_PROGRAM AS CONTENTS_KEY,
                C.CONTENTS_NM,
                ADV.VENDOR_NM AS ADVERTISER_NM
                ${pivotCols}
            FROM TPR_DPLOG L
            JOIN TCM_CONTENTS C ON L.CORP_CD = C.CORP_CD AND L.CUR_PROGRAM = C.CONTENTS_KEY
            JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD
            LEFT JOIN TCM_VENDOR ADV ON C.CORP_CD = ADV.CORP_CD AND C.VENDOR_CD = ADV.VENDOR_CD
            WHERE L.CORP_CD = ?
        `;
        
        const params = [corpCd];

        if (startDate && endDate) {
            query += " AND L.LOG_DT BETWEEN ? AND ?";
            params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, ''));
        } else {
            query += " AND L.LOG_DT >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 60 DAY), '%Y%m%d')";
        }

        if (advertiser) {
            query += " AND ADV.VENDOR_NM LIKE ?";
            params.push(`%${advertiser}%`);
        }
        if (content) {
            query += " AND C.CONTENTS_NM LIKE ?";
            params.push(`%${content}%`);
        }
        if (area1 && area1 !== 'ALL') {
            query += " AND V.ADDR_AREA1 = ?";
            params.push(area1);
        }

        query += " GROUP BY L.LOG_DT, L.CUR_PROGRAM ORDER BY L.LOG_DT DESC, C.CONTENTS_NM ASC";

        db.query(query, params, (err2, results) => {
            if (err2) {
                console.error('[ERROR_CONTENT_AGG] Fetch failed:', err2.message);
                return res.status(500).json({ success: false, error: err2.message });
            }
            res.json({ 
                success: true, 
                data: results,
                brands: brands
            });
        });
    });
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

// --------------------------------------------------------------------------
// 인원 계수측정 집계 APIs
// --------------------------------------------------------------------------

// 1. 요약 목록 조회
app.get('/api/ble-logs', (req, res) => {
    const { startDate, endDate, vendorGroup, onlyUnknown } = req.query;
    const corpCd = '25001';

    let whereClause = `WHERE L.CORP_CD = ? AND L.LOG_DT BETWEEN ? AND ?`;
    const params = [corpCd, startDate?.replace(/-/g, '') || '', endDate?.replace(/-/g, '') || ''];

    if (onlyUnknown === 'true') {
        whereClause += ` AND L.DEVICE_NM = 'Unknown'`;
    }

    const query = `
        SELECT 
            L.LOG_DT,
            V.VENDOR_NM,
            L.DEVICE_MAC,
            L.DEVICE_NM,
            ROUND(AVG(L.DEVICE_RSSI), 1) as DEVICE_RSSI,
            ROUND(AVG(L.DEVICE_DISTANCE), 2) as DEVICE_DISTANCE,
            MIN(L.LOG_TIME) as FIRST_HH,
            MAX(L.LOG_TIME) as LAST_HH,
            MIN(L.FIRST_SEEN) as FIRST_IN_TIME,
            MAX(L.LAST_SEEN) as LAST_IN_TIME,
            TIME_FORMAT(SEC_TO_TIME(SUM(TIME_TO_SEC(L.OBSERVED_TM))), '%H:%i:%s') as TOTAL_OBSERVED,
            L.VENDOR_CD
        FROM TPR_BLELOG L
        JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD
        ${whereClause}
        GROUP BY L.LOG_DT, V.VENDOR_NM, L.DEVICE_MAC, L.DEVICE_NM, L.VENDOR_CD
        ORDER BY L.LOG_DT DESC, L.FIRST_SEEN DESC
    `;

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        let filtered = results;
        if (vendorGroup && vendorGroup !== 'ALL') {
            filtered = results.filter(r => r.VENDOR_NM.startsWith(vendorGroup));
        }

        res.json({ success: true, data: filtered });
    });
});

// 2. 상세 시퀀스 조회
app.get('/api/ble-logs/details', (req, res) => {
    const { date, mac, vendorCd } = req.query;
    const corpCd = '25001';

    const query = `
        SELECT 
            LOG_TIME,
            DEVICE_MAC,
            DEVICE_NM,
            DEVICE_RSSI,
            DEVICE_DISTANCE,
            FIRST_SEEN,
            LAST_SEEN,
            OBSERVED_TM
        FROM TPR_BLELOG
        WHERE CORP_CD = ? AND LOG_DT = ? AND DEVICE_MAC = ? AND VENDOR_CD = ?
        ORDER BY LOG_TIME ASC
    `;

    db.query(query, [corpCd, date, mac, vendorCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: results });
    });
});
