# IIS 배포 가이드 (Windows Server)

이 프로젝트는 React(Vite) 프론트엔드와 Node.js 백엔드로 구성되어 있습니다.

## 1. 사전 준비
- **IIS 설치**: 'World Wide Web 서비스' 및 'URL 재작성(URL Rewrite)' 모듈이 설치되어 있어야 합니다.
- **Node.js 설치**: 백엔드 실행을 위해 서버에 Node.js가 설치되어 있어야 합니다.

## 2. 프로젝트 빌드 및 파일 준비
로컬 개발 PC에서 다음 단계를 수행하여 배포용 파일을 준비합니다.

### 2.1 프론트엔드 빌드 (Static Files)
- **명령어**: `npm run build`
- **결과물 위치**: `d:\Project-Ing\2602-Dayonsystem\dist`
- **구성**: `index.html`, `web.config`, `assets/` 폴더 등

### 2.2 백엔드 준비 (API Server)
- **준비물**: 아래 항목들을 서버로 복사할 준비를 합니다.
  - `server/` 폴더 전체
  - `.env` 파일 (DB 접속 정보 포함)
  - `package.json` 파일

## 3. 서버 파일 배치 및 IIS 설정 (통합형)

프론트엔드(`dist`)와 백엔드 파일을 프로젝트 루트 폴더 하나에 모두 모아서 관리합니다.

### 3.1 서버 경로 생성 및 파일 복사
1. **서버 경로 생성**: 서버의 적절한 위치에 웹사이트 폴더를 만듭니다.
   - 예: `C:\inetpub\wwwroot\dayon-system`
2. **파일 통합 복사**: 아래 항목들을 **모두 같은 폴더**(`C:\inetpub\wwwroot\dayon-system`) 안에 넣습니다.
   - 로컬 `dist/` 폴더 내의 **모든 파일** (`index.html`, `web.config`, `assets/` 등)
   - 로컬 `server/` 폴더 전체
   - 로컬 `.env` 파일 및 `package.json`

**최종 서버 폴더 구조 예시:**
```text
C:\inetpub\wwwroot\dayon-system\
  ├── assets/          (프론트엔드 자산)
  ├── server/          (백엔드 소스)
  ├── index.html       (메인 페이지)
  ├── web.config       (IIS 설정)
  ├── .env             (DB 환경설정)
  └── package.json     (의존성 정의)
```

### 3.2 IIS 사이트 설정
1. **사이트 추가**: IIS 관리자에서 새로운 웹 사이트를 추가합니다.
2. **사이트 이름**: `DayonSystem`
3. **물리적 경로**: 위에서 만든 폴더(`C:\inetpub\wwwroot\dayon-system`)를 지정합니다.
4. **포트**: `80` (기본 웹 포트)

### 3.3 백엔드 서비스 구동 및 자동 실행 설정 (PM2)
백엔드 서버를 백그라운드에서 실행하고, 서버가 재시작되어도 자동으로 실행되도록 설정합니다.

1.  **PM2 설치**:
    ```bash
    npm install pm2 -g
    ```
2.  **서비스 실행**:
    ```bash
    cd C:\inetpub\wwwroot\dayon-system
    pm2 start server/index.js --name "dayon-api"
    ```
3.  **Windows 서비스 등록 (자동 시작)**:
    Windows에서는 PM2가 재부팅 시 자동 실행되도록 추가 라이브러리가 필요합니다.
    ```bash
    npm install pm2-windows-startup -g
    pm2-startup install
    pm2 save
    ```
    (성공적으로 설치되면 재부팅 시에도 `dayon-api`가 자동으로 실행됩니다.)

---

## 4. 가비아 도메인 연결 및 외부 접속 세팅

구매하신 가비아 도메인을 서버에 연결하는 방법입니다.

### 4.1 가비아 DNS 설정 (도메인 업체)
1. **가비아 DNS 관리** 페이지에 접속합니다.
2. **A 레코드 추가**:
   - 호스트: `@` (또는 `www`)
   - 값 (IP): **서버의 공인 IP 주소**를 입력합니다.

### 4.2 IIS 바인딩 설정
1. **IIS 관리자**에서 해당 사이트를 선택합니다.
2. 오른쪽 **[바인딩...]** 메뉴를 클릭합니다.
3. **추가** 버튼을 누르고 아래와 같이 입력합니다.
   - 종류: `http`
   - 호스트 이름: `구매하신도메인.com` (예: `dayon.co.kr`)
4. 필요한 경우 `www.구매하신도메인.com`도 추가합니다.

### 4.3 IIS 리버스 프록시 설정 (중요)
상대 경로(`/api`)가 작동하려면 IIS에서 `/api`로 들어오는 요청을 백엔드(5000 포트)로 전달해줘야 합니다.

> [!IMPORTANT]
> **ARR(Application Request Routing)의 Proxy 기능이 꺼져있으면 404 에러가 발생합니다.** 아래 설정을 반드시 확인해 주세요.

1.  **ARR 프록시 활성화 (최우선 확인)**:
    - **IIS(인터넷 정보 서비스) 관리자** 실행
    - 왼쪽 트리에서 가장 상위의 **서버 이름(노드)** 선택
    - 중앙 화면의 'IIS' 섹션에서 **Application Request Routing Cache** (응용 프로그램 요청 라우팅 캐시) 아이콘 더블 클릭
    - 오른쪽 '작업' 패널에서 **Server Proxy Settings...** (서버 프록시 설정...) 클릭
    - **Enable proxy** (프록시 사용) 항목에 **체크** -> 오른쪽 상단의 **Apply** (적용) 클릭
2.  **URL 재작성 (URL Rewrite) 규칙**:
    - `DayonSystem` 사이트 선택 -> **URL 재작성** 아이콘 더블 클릭
    - 제가 전달해드린 `web.config`에 의해 **Reverse Proxy to Backend** 규칙이 가장 위에 있어야 합니다.
3.  **web.config 확인**: `dist/web.config`의 `Rewrite` 주소가 `http://127.0.0.1:5000/api/{R:1}`인지 확인합니다.

---
**주의:** 80번 포트(웹)는 외부에서 접속 가능해야 하지만, 5000번 포트는 이제 IIS가 내부적으로만 호출하므로 보안을 위해 방화벽에서 외부 접속을 차단해도 무방합니다.

### 4.4 백엔드 API 주소 확인 (중요)
- 도메인을 연결하면 프론트엔드에서 API(5000번 포트)를 호출할 때 서버의 공인 IP 대신 **도메인**을 사용할 수 있습니다.
- 예: `.env` 파일의 포트가 `5000`이라면, API 호출 주소는 `http://구매하신도메인.com:5000`이 됩니다. (이 주소가 방화벽에서 허용되어 있어야 함)
