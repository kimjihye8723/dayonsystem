-- GODATA 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS godata CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE godata;

-- 사용자(회원) 테이블 생성
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account VARCHAR(50) NOT NULL UNIQUE COMMENT '사용계정(User ID)',
    name VARCHAR(100) NOT NULL COMMENT '사용자명',
    password VARCHAR(255) NOT NULL COMMENT '비밀번호(해시 권장)',
    email VARCHAR(100) COMMENT '이메일 주소',
    phone VARCHAR(20) COMMENT '휴대폰 번호',
    company VARCHAR(100) DEFAULT '현대보안월드' COMMENT '소속기업',
    store VARCHAR(100) DEFAULT '-' COMMENT '소속매장',
    profile_img TEXT COMMENT '프로필 이미지 경로',
    last_login DATETIME COMMENT '최근 로그인 일시',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 기본 관리자 데이터 추가
INSERT INTO users (account, name, password, email, phone, company, store)
VALUES (
    'hdsw', 
    '관리자', 
    'admin1234', -- 실제 운영시에는 반드시 해시화하여 저장해야 합니다.
    'admin@godata.com', 
    '010-1234-5678', 
    '현대보안월드', 
    '-'
) ON DUPLICATE KEY UPDATE account=account;

-- 테이블 구조 확인
DESC users;
-- 데이터 확인
SELECT * FROM users;
