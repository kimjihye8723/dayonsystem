# HDPlayer SDK 3.0 (SDK二次开发-250421) 분석 보고서

본 문서는 LED 제어기(Engineering Card) 제어를 위한 SDK 3.0 기술 문서의 내용을 요약하고 명시된 전체 API 목록을 분석한 결과입니다.

## 1. 통신 및 프로토콜 기본 규격
* **대상 기기:** 기기 ID 중간에 'D'가 포함된 공학용 카드(Engineering Card)만 이차 개발을 지원합니다.
* **통신 포트:** 기본 TCP 포트 `10001` (AxL, A7, A8 등 안드로이드 계열은 `20001`).
* **데이터 포맷:** 모든 SDK 데이터는 **UTF-8 인코딩**을 사용하며, 바이트 순서는 **리틀 엔디안(Little Endian)**을 따릅니다.
* **데이터 패킷 제한:** TCP 패킷의 최대 길이는 `9 * 1024` 바이트이며, 이를 초과할 경우 분할 처리(Chunking/분배)가 필요합니다.
* **기본 명령 구조:** 모든 SDK 요청은 `kSDKCmdAsk` 명령값을, 응답은 `kSDKCmdAnswer` 명령값을 사용하며, XML 포맷으로 실제 기능 제어 데이터를 교환합니다.

## 2. SDK 연결 및 인증 프로세스 (매우 중요)
파일 전송 등의 작업과 SDK 통신이 교차 전송되는 것을 허용하지 않습니다. (동기적 처리 권장)
1. **TCP 연결 수행**
2. **버전 협상 (Protocol Version Negotiation):** 연결 직후 기기가 지원하는 프로토콜 버전 확인.
3. **SDK 협상 (`GetIFVersion`):** 버전 협상 완료 후, `GetIFVersion` API를 호출하여 향후 통신에 사용할 **세션 `GUID`를 발급** 받습니다.
4. **명령 전송:** 이후 전송되는 모든 XML 요청의 `<sdk guid="...">` 속성에 위에서 발급받은 GUID를 넣어야 명령이 유효하게 처리됩니다.

## 3. 프로그램(콘텐츠) 구조 이해
제어기에 표출할 콘텐츠는 **프로그램(Program) > 영역(Area) > 리소스(Resources)** 의 계층 구조를 갖는 XML로 구성됩니다.
* **Program:** 하나의 화면 시나리오 (GUID 필수)
* **Area:** 화면을 분할한 표시 영역 (GUID, X, Y, Width, Height 필수)
* **Resources:** 실제 표출될 항목들. `text`(텍스트), `image`(이미지), `video`(비디오), `clock`(시계), `table`(표) 등의 요소가 포함되며, 각 요소는 고유의 식별자(GUID)와 애니메이션 효과(effect), 폰트(font) 설정 등을 가질 수 있습니다.

---

## 4. 카테고리별 전체 API 분석 (총 79개 API)

문서 내에 명시된 79개의 API를 논리적 기능 단위로 분류하여 분석했습니다.

### 4.1 연결 및 기본 설정 (Core & Authentication)
* `GetIFVersion`: SDK 버전을 확인하고, 세션 유지를 위한 GUID를 발급받는 가장 핵심적인 초기화 API입니다.
* `GetSDKTcpServer` / `SetSDKTcpServer`: 기기가 능동적으로 접속할 상위 TCP 서버의 주소와 포트를 조회/설정합니다.
* `GetLicense`: 기기의 라이선스 정보를 가져옵니다.
* `GetSocketTimeInfo` / `SetSocketTimeInfo`: 소켓 타임아웃 등 네트워크 소켓 세부 설정을 관리합니다 (수정 비권장).

### 4.2 프로그램 및 콘텐츠 제어 (Program & Content Management)
CMS 개발 시 가장 빈번하게 사용될 핵심 API 그룹입니다.
* `GetProgram`: 현재 기기에 저장된 프로그램(콘텐츠) 정보를 조회합니다.
* `AddProgram`: 새로운 프로그램을 추가합니다. 화면 구조, 리소스 종류, 재생 옵션(PlayControl) 등을 XML 구조로 함께 전송합니다.
* `InsertPlayProgram`: 일반 프로그램 재생 중간에 스케줄링 또는 특정 조건에 따라 삽입(끼워넣기) 재생할 프로그램을 추가합니다.
* `UpdateProgram`: 기존에 추가된 프로그램을 업데이트합니다 (GUID 매칭 방식).
* `DeleteProgram`: 특정 프로그램을 삭제합니다 (GUID 기준).
* `SwitchProgram`: 재생할 프로그램을 강제로 전환합니다 (인덱스 또는 GUID 사용). 다중 화면 동기화가 꺼져 있어야 합니다.
* `RealTimeUpdate`: 화면 전체가 아닌 특정 영역(Area)의 콘텐츠(예: 텍스트나 이미지)만 실시간으로 업데이트하여 화면 깜빡임을 방지합니다.
* `GetCurrentPlayProgramGUID`: 현재 화면에 재생 중인 프로그램의 GUID를 반환합니다.

### 4.3 미디어 파일 관리 (File & Storage Management)
프로그램(`AddProgram`)을 전송하기 전에, 해당 프로그램에서 사용할 이미지나 영상 파일은 먼저 기기에 업로드되어야 합니다.
* `AddFiles`: 기기의 스토리지(또는 메모리)로 미디어 파일(이미지, 비디오 등)을 전송합니다.
* `GetFiles`: 기기에 업로드되어 있는 미디어 파일의 목록 및 크기, MD5 등의 정보를 조회합니다.
* `DeleteFiles`: 기기의 파일을 삭제합니다 (이름 또는 MD5 기준 매칭).
* `GetRAMSize`: 빈번한 이미지 업데이트 시 플래시 메모리 마모를 방지하기 위해 사용되는 '임시 메모리(RAM)' 파일 시스템의 남은 용량 및 전체 용량을 조회합니다.

### 4.4 스크린 및 디스플레이 제어 (Screen & Display Control)
* `OpenScreen` / `CloseScreen`: 스크린 전원을 명시적으로 켜고 끕니다.
* `GetSwitchTime` / `SetSwitchTime`: 특정 시간대에 자동으로 스크린이 켜지거나 꺼지도록 스케줄(타이머)을 설정합니다.
* `ScreenRotation`: 화면 표시를 0도, 90도, 180도, 270도 회전시킵니다.
* `GetLuminancePloy` / `SetLuminancePloy`: 밝기를 설정합니다 (기본 고정 밝기, 밝기 센서에 의한 자동 조절, 시간대별 밝기 설정 등을 지원).
* `GetBootLogo` / `SetBootLogoName` / `ClearBootLogo`: 기기 부팅 시 나타나는 로고 이미지를 조회, 설정, 삭제합니다 (안드로이드 시리즈 미지원).
* `GetScreenshot`, `GetScreenshotStatus`, `GetScreenshotData`: 폴링 방식을 통한 화면 캡처 및 데이터(Base64 인코딩) 획득. (폐기 예정 API)
* `GetScreenshot2`: 비동기 방식을 이용해 화면 스크린샷 캡처 명령을 내리고 결과를 콜백(응답)으로 받아오는 개선된 API입니다.

### 4.5 디바이스 시스템 설정 (System & Device Info)
* `GetDeviceInfo`: 장비 모델, CPU, 시스템 펌웨어 버전, 해상도(Width, Height) 등을 조회합니다.
* `GetDeviceName` / `SetDeviceName`: 기기의 사용자 지정 이름을 설정하고 가져옵니다.
* `Reboot`: 기기를 재부팅합니다 (딜레이 시간 설정 가능).
* `GetSystemVolume` / `SetSystemVolume`: 기기 오디오 볼륨을 조회 및 설정하며, 시간대별 볼륨 스케줄(Ploy)도 설정 가능합니다.
* `GetTimeInfo` / `SetTimeInfo`: 기기의 현재 시간을 조회하거나, 시간 동기화(NTP 서버) 설정을 변경합니다.
* `GetAllFontInfo` / `ReloadAllFonts`: 기기에 설치된 폰트 목록을 가져오고 새로고침합니다.

### 4.6 네트워크 통신 환경 설정 (Network Configuration)
* `GetNetworkInfo`: 전체적인 네트워크 상태 및 우선 연결 방식(eth0, pppoe, wifi)을 확인합니다.
* `GetEth0Info` / `SetEth0Info`: 유선 LAN(이더넷)의 IP, 서브넷마스크, 게이트웨이, DNS 등을 조회/설정합니다.
* `GetWifiInfo` / `SetWifiInfo`: 기기를 AP 모드로 작동하거나 스캔된 주변 WIFI 정보를 조회하고 접속 설정을 변경합니다.
* `GetPppoeInfo`: 모바일 네트워크(3G/4G/LTE 모듈)의 상태와 정보(신호 강도, IMEI, 통신사 등)를 확인합니다.
* `SetApn`: 모바일 네트워크용 APN을 설정합니다.

### 4.7 펌웨어 및 시스템 업데이트 (Firmware Upgrades)
* `FirmwareUpgrade`: 펌웨어 파일을 직접 전송하여 업데이트를 시작합니다.
* `ExcuteUpgradeShell` / `ExcuteUpgradeShellHttp`: 이미 기기에 전송된 펌웨어 파일이나 외부 HTTP 링크를 이용하여 펌웨어 업데이트를 수행합니다.
* `GetUpgradeResult`: 펌웨어 업데이트의 진행 상태 및 성공 여부를 확인합니다.

### 4.8 외부 센서 및 하드웨어 연동 (Sensors, Hardware & Serial / 485)
* `Set485Param` / `Get485Param`: RS485 및 직렬(Serial/UART) 통신에 필요한 포트 파라미터(Baud Rate, Data bits 등)를 설정합니다.
* `SendDataTo485` / `ReadDataFrom485`: 485 포트를 통해 외부 기기에 Base64 형태로 데이터를 송신하거나, 버퍼(1KB)에 수신된 데이터를 읽어옵니다.
* `GetSensorInfo` / `GetCurrentSensorValue`: 기기에 연결된 각종 센서(온습도, 밝기, 바람, 소음 등)의 실시간 값을 읽어옵니다.
* `GetGPSInfo` / `GetGpsRespondEnable` / `SetGpsRespondEnable`: GPS 센서를 통한 위도, 경도 정보 및 GPS 연동 활성화 상태를 관리합니다.
* `GetRelayInfo` / `SetRelayInfo`: 릴레이 스위치(전원 제어기 등)의 상태를 관리합니다.
* `CheckUDiskInsert` / `GetEnableUDiskFunction` / `SetEnableUDiskFunction` / `DisableUDiskFunction`: USB 플래시 드라이브의 삽입 상태 및 USB를 통한 프로그램 업데이트 기능의 활성/비활성 여부를 관리합니다.
* `GetMulScreenSync` / `SetMulScreenSync`: 복수의 디스플레이를 연동하는 다중 화면 동기화 모드를 제어합니다.
* `GetPlayProgramCountsEnable` / `SetPlayProgramCountsEnable` / `GetPlayProgramCountsFileName`: 콘텐츠 재생 횟수 카운트 활성화 여부 및 기록 파일 관련 기능입니다.
* `PushStatus`: 푸시 알림 및 이벤트 상태와 관련된 기능으로 보입니다.

---

## 요약 및 제언 (CMS 연동 측면)
* **파일 및 프로그램 흐름:** 일반적인 시스템과 달리, 이 장비는 미디어 파일을 업로드(`AddFiles`)한 후에 화면 구성 정보(`AddProgram`)를 별도의 XML 명령으로 전송하는 2-Step 방식으로 동작합니다.
* **실시간성 확보:** 성별이나 CCTV 데이터를 기반으로 즉각적인 콘텐츠 변환을 하려면 매번 `AddProgram`을 하는 것 보다, 모든 리소스를 기기에 올려두고 `SwitchProgram`으로 전환하거나, 기존 레이아웃 안에서 텍스트/이미지만 바꾸는 `RealTimeUpdate`를 사용하는 것이 시스템 및 EMMC 메모리 부하를 줄이는 가장 효과적인 방법입니다.
* **세션 관리:** 반드시 초기 TCP 연결 후 `GetIFVersion`을 통한 GUID 발급 단계가 성공해야만 나머지 모든 API 사용이 가능합니다. 이 부분에 대한 소켓 연결 관리가 견고해야 합니다.
