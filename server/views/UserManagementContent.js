import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Update User Info API Endpoint (Profile)
router.put('/user/update', (req, res) => {
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
            return res.status(500).json({ success: false, message: '정보 수정에 실패했습니다.' });
        }
        res.json({ success: true, message: '정보가 수정되었습니다.' });
    });
});

// 사용자 목록 조회 - TCM_USERHDR 기반
router.get('/users', (req, res) => {
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

// 특정 사용자 상세 조회
router.get('/users/:userId/details', (req, res) => {
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

// 다음 사용자 ID 조회
router.get('/users/next-id', (req, res) => {
    const corpCd = '25001';
    const query = "SELECT MAX(USER_ID) as maxId FROM TCM_USERHDR WHERE CORP_CD = ?";
    db.query(query, [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const maxId = results[0].maxId;
        const nextId = maxId ? String(Number(maxId) + 1) : '2500001';
        res.json({ success: true, nextId });
    });
});

// 사용자 등록/수정 저장
router.post('/users/save', (req, res) => {
    const { header, vendors, cards } = req.body;
    const corpCd = '25001';
    const userId = header.USER_ID;

    if (!userId) return res.status(400).json({ success: false, message: 'USER_ID가 필요합니다.' });

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
            const sql = `INSERT INTO TCM_USERHDR (CORP_CD, USER_ID, ${headerFields.join(', ')}, REGISTDT, REGISTUSER) 
                         VALUES (?, ?, ${headerFields.map(() => '?').join(', ')}, NOW(), 'ADMIN')`;
            db.query(sql, [corpCd, userId, ...headerValues], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                saveSubTables();
            });
        } else {
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
        const currentVendorCodes = (vendors || []).map(v => v.VENDOR_CD).filter(cd => cd);
        if (currentVendorCodes.length > 0) {
            db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ? AND VENDOR_CD NOT IN (?)", [corpCd, userId, currentVendorCodes]);
        } else {
            db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        }

        if (vendors && vendors.length > 0) {
            vendors.forEach(v => {
                if (!v.VENDOR_CD) return;
                const sql = `
                    INSERT INTO TCM_USERVENDOR (CORP_CD, USER_ID, VENDOR_CD, REGISTUSER, REGISTDT)
                    VALUES (?, ?, ?, 'ADMIN', NOW())
                    ON DUPLICATE KEY UPDATE MODIFYUSER = 'ADMIN', MODIFYDT = NOW()
                `;
                db.query(sql, [corpCd, userId, v.VENDOR_CD]);
            });
        }

        const currentCardNos = (cards || []).map(c => c.CARD_NO).filter(no => no);
        if (currentCardNos.length > 0) {
            db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ? AND CARD_NO NOT IN (?)", [corpCd, userId, currentCardNos]);
        } else {
            db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        }

        if (cards && cards.length > 0) {
            cards.forEach(c => {
                if (!c.CARD_NO) return;
                const sql = `
                    INSERT INTO TCM_USERCARD 
                        (CORP_CD, USER_ID, CARD_NO, CARDGIVE_DT, COLLECT_DT, REMARK, PROPERTY_01, PROPERTY_02, PROPERTY_03, PROPERTY_04, REGISTUSER, REGISTDT)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', NOW())
                    ON DUPLICATE KEY UPDATE
                        CARDGIVE_DT = VALUES(CARDGIVE_DT), COLLECT_DT = VALUES(COLLECT_DT),
                        REMARK = VALUES(REMARK), PROPERTY_01 = VALUES(PROPERTY_01),
                        PROPERTY_02 = VALUES(PROPERTY_02), PROPERTY_03 = VALUES(PROPERTY_03),
                        PROPERTY_04 = VALUES(PROPERTY_04), MODIFYUSER = 'ADMIN', MODIFYDT = NOW()
                `;
                const vals = [corpCd, userId, c.CARD_NO, c.CARDGIVE_DT, c.COLLECT_DT, c.REMARK, c.CARD_NM, c.CARD_COMPANY, c.CARD_TYPE, c.EXPIRE_DT];
                db.query(sql, vals);
            });
        }
        res.json({ success: true, message: '저장되었습니다.' });
    };
});

// 사용자 삭제
router.delete('/users/:userId', (req, res) => {
    const { userId } = req.params;
    const corpCd = '25001';
    db.query("DELETE FROM TCM_USERHDR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.query("DELETE FROM TCM_USERVENDOR WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        db.query("DELETE FROM TCM_USERCARD WHERE CORP_CD = ? AND USER_ID = ?", [corpCd, userId]);
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

// 사용자 현황 조회
router.get('/user-status', (req, res) => {
    const { startDate, endDate, userTyp, userNm, deptCd } = req.query;
    let query = `
        SELECT h.USER_ID, h.USER_NM, DATE_FORMAT(h.REGISTDT, '%Y-%m-%d') AS REGISTDT, h.IPSA_DT, h.EXPIRE_DT,
               IFNULL(dept.CODE_NM, h.DEPT_CD) AS DEPT_NM, IFNULL(team.CODE_NM, h.TEAM_CD) AS TEAM_NM,
               IFNULL(pos.CODE_NM, h.POSITION_CD) AS POSITION_NM, IFNULL(duty.CODE_NM, h.DUTY_CD) AS DUTY_NM,
               h.USER_TEL, h.USER_HP, h.USER_EMAIL, h.BIRTH_DT, h.MARRIED_DT, h.ADDRESS_HDR, h.REMARK, h.USER_TYP
        FROM TCM_USERHDR h
        LEFT JOIN TCM_BASIC dept ON dept.GROUP_CD = 'DP001' AND dept.CODE_CD = h.DEPT_CD AND dept.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC team ON team.GROUP_CD = 'DP002' AND team.CODE_CD = h.TEAM_CD AND team.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC pos  ON pos.GROUP_CD = 'DP003'  AND pos.CODE_CD = h.POSITION_CD AND pos.CORP_CD = h.CORP_CD
        LEFT JOIN TCM_BASIC duty ON duty.GROUP_CD = 'DP004' AND duty.CODE_CD = h.DUTY_CD AND duty.CORP_CD = h.CORP_CD
        WHERE h.CORP_CD = '25001'
    `;
    const params = [];
    if (startDate) { query += ' AND (h.IPSA_DT >= ? OR h.IPSA_DT IS NULL OR h.IPSA_DT = \'\')'; params.push(startDate.replace(/-/g, '')); }
    if (endDate) { query += ' AND (h.IPSA_DT <= ? OR h.IPSA_DT IS NULL OR h.IPSA_DT = \'\')'; params.push(endDate.replace(/-/g, '')); }
    if (deptCd) { query += ' AND h.DEPT_CD = ?'; params.push(deptCd); }
    if (userTyp === 'S') query += " AND h.USER_TYP = 'S'";
    else if (userTyp === 'M') query += " AND h.USER_TYP = 'M'";
    else if (userTyp === 'A') query += " AND h.USER_TYP = 'A'";
    if (userNm) { query += ' AND (h.USER_NM LIKE ? OR h.USER_ID LIKE ?)'; params.push(`%${userNm}%`, `%${userNm}%`); }
    query += ' ORDER BY h.SORT_SEQ, h.USER_ID';
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

export default router;
