import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// 사용자 권한 조회
router.get('/user-permissions/:userId', (req, res) => {
    const { userId } = req.params;
    
    db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [userId], (err, userRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (userRows.length === 0) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        const userCorpCd = userRows[0].CORP_CD;

        const sql = `
            SELECT 
                B.MENU_ID AS PGM_ID,
                B.MENU_NM AS PGM_NM,
                B.MENU_AUTH,
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
            if (err) return res.status(500).json({ success: false, error: err.message });
            
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

// 권한 복사 대상 사용자 목록 조회
router.get('/user-auth-copy-list', (req, res) => {
    db.query("SELECT USER_ID, USER_NM, USER_TYP FROM TCM_USERHDR WHERE CORP_CD = '25001' AND USER_TYP != 'S' ORDER BY USER_NM", (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: results });
    });
});

// 사용자 PC 권한 조회
router.get('/user-pc-auth/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = "SELECT USE_YN AS ALLOW_YN, HDD_SN AS DISK_INFO, MAC_ADDR, REMARK FROM TCM_USERAUTH WHERE CORP_CD = '25001' AND USER_ID = ?";
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, pcAuth: results.map(r => ({ ...r, ALLOW_YN: r.ALLOW_YN === 'Y' })) });
    });
});

// 사용자 권한 저장
router.post('/user-permissions/save', (req, res) => {
    const { userId, permissions } = req.body;
    db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [userId], (err, userRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (userRows.length === 0) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });

        const userCorpCd = userRows[0].CORP_CD;

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
                    VALUES (?, ?, ?, ?, 'ADMIN', NOW())
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

// 권한 복사
router.post('/user-permissions/copy', (req, res) => {
    const { sourceUserId, targetUserIds } = req.body;
    if (!sourceUserId || !targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
        return res.status(400).json({ success: false, message: '원본 사용자 및 대상 사용자 목록이 필요합니다.' });
    }

    const getSourceSql = `
        SELECT PROGRAM_ID, MAX(AUTH_MSKVAL) as AUTH_MSKVAL, MAX(AUTH_APPDT) as AUTH_APPDT, MAX(AUTH_EPRDT) as AUTH_EPRDT 
        FROM TCM_ROLEPGMUSERAUTH 
        WHERE AUTH_USERID = ? 
        GROUP BY PROGRAM_ID
    `;
    db.query(getSourceSql, [sourceUserId], (err, sourcePerms) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (sourcePerms.length === 0) return res.status(400).json({ success: false, message: '복사할 권한 데이터가 없습니다.' });

        let completedCount = 0;
        let errorOccurred = false;

        targetUserIds.forEach(targetId => {
            db.query("SELECT CORP_CD FROM TCM_USERHDR WHERE USER_ID = ?", [targetId], (err, targetRows) => {
                if (err || targetRows.length === 0) {
                    if (!errorOccurred) {
                        errorOccurred = true;
                        res.status(500).json({ success: false, message: `대상 사용자(${targetId}) 정보 조회 실패` });
                    }
                    return;
                }

                const targetCorpCd = targetRows[0].CORP_CD || '25001';
                db.query("DELETE FROM TCM_ROLEPGMUSERAUTH WHERE AUTH_USERID = ?", [targetId], (err) => {
                    if (err) console.error(`[PERM_COPY] Delete failed for ${targetId}:`, err.message);

                    const today = new Date();
                    const formattedToday = today.toISOString().slice(0, 10).replace(/-/g, '');

                    const values = sourcePerms.map(p => [
                        targetCorpCd, targetId, p.PROGRAM_ID, p.AUTH_MSKVAL, 
                        formattedToday, p.AUTH_EPRDT || '29991231', 'ADMIN', new Date()
                    ]);
                    
                    const insertSql = "INSERT INTO TCM_ROLEPGMUSERAUTH (CORP_CD, AUTH_USERID, PROGRAM_ID, AUTH_MSKVAL, AUTH_APPDT, AUTH_EPRDT, REGISTUSER, REGISTDT) VALUES ?";
                    db.query(insertSql, [values], (err) => {
                        completedCount++;
                        if (completedCount === targetUserIds.length && !errorOccurred) {
                            res.json({ success: true, message: `${targetUserIds.length}명에게 권한이 복사되었습니다.` });
                        }
                    });
                });
            });
        });
    });
});

export default router;
