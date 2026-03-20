import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// 거래처 목록 조회
router.get('/vendors', (req, res) => {
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

// 거래처 저장/수정
router.post('/vendors/save', (req, res) => {
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

// 거래처 현황 조회
router.get('/vendor-status', (req, res) => {
    const { vendorSec, vendorNm, closeYn, dealSec } = req.query;
    const corpCd = '25001';
    let query = `
        SELECT V.*,
               (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD005' AND CODE_CD = V.VENDOR_SEC) AS VENDOR_SEC_NM,
               (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD020' AND CODE_CD = V.VENDOR_TYP) AS VENDOR_TYP_NM,
               (SELECT CODE_NM FROM TCM_BASIC WHERE CORP_CD = V.CORP_CD AND GROUP_CD = 'VD022' AND CODE_CD = V.MAINTENANCE_SEC) AS DEAL_SEC_NM,
               V.ADDRESS_HDR, V.ADDRESS_DET, V.MAINTENANCE_AMT,
               (V.MAINTENANCE_AMT / 12) AS MONTH_AMT, (V.MAINTENANCE_AMT * 1) AS YEAR_AMT, V.MAINTENANCE_DAY
        FROM TCM_VENDOR V WHERE V.CORP_CD = ?
    `;
    const params = [corpCd];
    if (vendorSec && vendorSec !== 'ALL') { query += " AND V.VENDOR_SEC = ?"; params.push(vendorSec); }
    if (vendorNm) { query += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)"; params.push(`%${vendorNm}%`, `%${vendorNm}%`); }
    if (closeYn && closeYn !== 'ALL') { query += " AND V.CLOSE_YN = ?"; params.push(closeYn); }
    if (dealSec && dealSec !== 'ALL') { query += " AND V.MAINTENANCE_SEC = ?"; params.push(dealSec); }
    query += " ORDER BY V.VENDOR_SEC ASC, V.VENDOR_NM ASC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, vendors: results });
    });
});

export default router;
