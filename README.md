# 대연시스템 (Dayon System)

React + TypeScript + Vite 프론트엔드와 Express + MySQL 백엔드로 구성된 웹 애플리케이션입니다.

---

## 📋 기술 스택

| 구분 | 기술 |
|------|------|
| **프론트엔드** | React 19, TypeScript, Vite |
| **백엔드** | Node.js, Express 5 |
| **데이터베이스** | MySQL (mysql2) |
| **차트** | ApexCharts |
| **라우팅** | React Router DOM v7 |
| **HTTP 클라이언트** | Axios |

---

## 🚀 빌드 및 실행 방법

### 1. 사전 요구사항

- **Node.js** v18 이상
- **npm** v9 이상
- **MySQL** 서버 (원격 또는 로컬)

### 2. 프로젝트 클론 및 의존성 설치

```bash
git clone <repository-url>
cd 2602-Dayonsystem
npm install
```

### 3. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 아래 항목을 설정합니다.

```env
DB_HOST=<데이터베이스 호스트 주소>
DB_USER=<데이터베이스 사용자명>
DB_PASS=<데이터베이스 비밀번호>
DB_NAME=<데이터베이스명>
PORT=5000
```

### 4. 데이터베이스 초기화

MySQL에 접속하여 `database.sql` 스크립트를 실행합니다.

```bash
mysql -u <사용자명> -p < database.sql
```

이 스크립트는 `godata` 데이터베이스와 `users` 테이블을 생성하고, 기본 관리자 계정을 추가합니다.

### 5. 개발 서버 실행

프론트엔드와 백엔드 서버를 각각 별도의 터미널에서 실행합니다.

```bash
# 터미널 1 - 프론트엔드 개발 서버 (Vite, 기본 포트: 5173)
npm run dev

# 터미널 2 - 백엔드 API 서버 (Express, 기본 포트: 5000)
npm run server
```

### 6. 로컬 접속 방법

두 서버가 모두 실행된 상태에서 브라우저를 열고 아래 주소로 접속합니다.

| 구분 | URL | 설명 |
|------|-----|------|
| **프론트엔드 (웹 화면)** | http://localhost:5173 | Vite 개발 서버 — 코드 수정 시 자동 반영(HMR) |
| **백엔드 API 서버** | http://localhost:5000 | Express API 서버 |
| **서버 상태 확인** | http://localhost:5000/api/health | API 서버 정상 동작 확인용 |

> **💡 Tip**
> - 프론트엔드에서 API를 호출할 때 백엔드 서버(`localhost:5000`)가 반드시 실행 중이어야 합니다.
> - 같은 네트워크의 다른 기기에서 접속하려면 `localhost` 대신 **PC의 내부 IP 주소**를 사용하세요.  
>   내부 IP 확인: `ipconfig` (Windows) → **IPv4 주소** 항목 확인  
>   예) `http://192.168.0.10:5173`

### 7. 프로덕션 빌드

```bash
# TypeScript 컴파일 + Vite 빌드
npm run build
```

빌드 결과물은 `dist/` 폴더에 생성됩니다.

### 8. 프로덕션 실행

```bash
# 빌드된 프론트엔드 + 백엔드 서버 동시 실행
npm start
```

---

## 📜 NPM 스크립트 요약

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | Vite 프론트엔드 개발 서버 실행 (HMR 지원) |
| `npm run server` | Express 백엔드 서버 실행 (파일 변경 시 자동 재시작) |
| `npm start` | 프로덕션용 백엔드 서버 실행 |
| `npm run build` | TypeScript 컴파일 및 Vite 프로덕션 빌드 |
| `npm run lint` | ESLint 코드 검사 |
| `npm run preview` | 빌드된 결과물 로컬 미리보기 |

---

## 📁 프로젝트 구조

```
2602-Dayonsystem/
├── public/              # 정적 파일
├── server/
│   └── index.js         # Express 백엔드 서버 (API)
├── src/
│   ├── assets/          # 이미지, 아이콘 등 리소스
│   ├── components/      # React 컴포넌트
│   ├── App.tsx          # 메인 앱 컴포넌트
│   ├── main.tsx         # 앱 진입점
│   └── index.css        # 글로벌 스타일
├── dist/                # 빌드 결과물 (git 미추적)
├── .env                 # 환경 변수 (git 미추적)
├── database.sql         # DB 초기화 스크립트
├── package.json         # 의존성 및 스크립트 정의
├── vite.config.ts       # Vite 설정
├── tsconfig.json        # TypeScript 설정
└── index.html           # HTML 진입점
```

---

## 🔗 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/health` | 서버 상태 확인 |
| `POST` | `/api/login` | 로그인 |
| `PUT` | `/api/user/update` | 회원정보 수정 |

---

## 📝 참고 사항

- IIS 배포 시에는 `IIS_DEPLOY.md` 문서를 참고하세요.
- `.env` 파일은 `.gitignore`에 포함되어 있으므로, 각 환경에 맞게 별도로 생성해야 합니다.
