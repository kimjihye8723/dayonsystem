# 대연시스템 CMS 핵심 기능 및 기술 명세 (개발자용)

본 문서는 실시간 CCTV 영상 인공지능 분석과 Huidu LED 컨트롤러 간의 **제로 딜레이 스위칭(Zero-Delay Switching)** 아키텍처를 구현하기 위한 기술적 명세서입니다. 다운로드 지연시간(Timeout/Lag)을 원천적으로 막기 위한 트릭과 하드웨어 API 파편화 메커니즘을 주로 다룹니다.

---

## 1. Huidu SDK API 연동 명세

Huidu 하드웨어를 제어하기 위해 **[Huidu Network Communication Protocol SDK Manual V2.x]** 통신 규약을 참조하여 TCP Socket 통신을 구축했습니다.

### A. AddProgram API (사전 메모리 적재 / 캐싱)
> **문서 참고**: Huidu SDK Protocol Manual - Chapter 3 (Program Management) / `AddProgram` Section
> **기능**: 서버에 있는 미디어(비디오/이미지) 파일을 보드의 내부 Flash 메모리에 강제로 내려받게 하고, 새로운 프로그램을 덮어씌웁니다.

**구현 디테일 및 XML Payload**:
전통적인 방식인 "수시로 AddProgram 호출"은 패킷당 수십(N) 초의 I/O 딜레이를 유발합니다. 따라서 시스템 시작 시 혹은 스케줄 갱신 시 딱 한 번만 호출합니다.
이때 `playControl count` 값을 조작하여, 남녀 타겟 프로그램이 자동 재생되지 못하도록 공통 프로그램에 무한 루프 락(Lock)을 겁니다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<sdk guid="1234abcd...">
  <in method="AddProgram">
    <screen timeStamps="1775711312896">
      <!-- 1. 공통 영상 (count=99999로 무한 락다운) -->
      <program guid="prog_null" type="normal">
        <playControl count="99999"/>
        <area guid="area-prog_null" alpha="255">
          <resources><video guid="video-prog_null-0">...</video></resources>
        </area>
      </program>
      <!-- 2. 남성 영상 (개별 파편화 적재) -->
      <program guid="prog_male_0" type="normal">
        <playControl count="1"/>...
      </program>
    </screen>
  </in>
</sdk>
```

### B. SwitchProgram API (하드웨어 인터럽트 및 즉각 전환)
> **문서 참고**: Huidu SDK Protocol Manual - Chapter 4 (Screen Control) / `SwitchProgram` Section
> **기능**: 보드에 이미 다운로드 되어 있는 프로그램(GUID) 번호를 가리켜 즉각적으로 화면을 전환(Jump)시킵니다. 네트워크 다운로드가 일체 발생하지 않습니다.

**구현 디테일**:
CCTV 성별 이벤트 발동 시 사용되는 O(1) 복잡도의 핵심 명령입니다. 
서버가 카메라로부터 패킷을 받은 직후 호출하며 보드의 디스플레이를 0.1초 이내에 갈아끼웁니다. 난수 처리를 통해 `prog_male_X` 범위 중 랜덤 인덱스를 발송합니다.

```xml
<?xml version="1.0" encoding="utf-8"?>
<sdk guid="1234abcd...">
  <in method="SwitchProgram">
    <program guid="prog_male_1"/>
  </in>
</sdk>
```

---

## 2. CCTV 감지 API (TD2000 G3 API)

카메라 제조업체 API 프로토콜을 백엔드 Node.js Express 훅으로 구축하여 씁니다.

### RealTimeCount Push API
> **문서 참고**: TD2000 Series API Reference Guide - Section: Push Protocol (`ReportData > RealTimeReport`)
> **기능**: 지정된 HTTP URL로 실시간 통과 객체량의 "누적 통계치"를 POST 규격으로 전송합니다.

**기술 맹점 및 해결책 (Delta Algorithm)**:
제공되는 API 규격(`@EntersMaleCustomer`, `@ExitsMaleCustomer` 등)이 휘발성 이벤트가 아닌 **하드웨어 누적 카운트**이기 때문에, 단순히 값이 크다고 트리거시키면 심각한 무한 루프 버그가 발생합니다.
따라서 서버 인메모리 상에 `cctvPreviousCounts` 맵을 두어, `현재 누적값 - 과거 누적값(Prev)` 형태의 **순수 오프셋 델타(Delta)**만을 산출하여 정확히 통과 시점에만 트리거되도록 필터링 엔진을 구현했습니다.

```json
{
  "RealTimeCount": {
    "@EntersFemaleCustomer": "5",
    "@ExitsFemaleCustomer": "3",
    "@EntersMaleCustomer": "8"
  }
}
```

---

## 3. 백엔드(Node.js) 동시성 제어 및 상태 머신

### 타겟팅 락(Lock) 메커니즘 (`vendorRevertTimers`)
- **이슈**: 스위칭 명령어(`SwitchProgram`)를 쏘자마자 1초 뒤 또 다른 성별이 지나가면, LED 영상이 끊기면서 튀는(Flicker) 현상이 불가피합니다.
- **아키텍처 설계**: 
  - DB의 `IMAGE_DELAY` 타임스탬프 필드를 읽어온 뒤 `PlayDurationMs`로 변환합니다.
  - 전환 즉시 Node 내부 타이머 기반의 **Mutex 성격의 락(Revert Timer Lock)**을 겁니다. 
  - 락이 점유된 동안 들어오는 모든 CCTV Push Rest API는 `return;` 을 통해 강제 누락(Drop)시켜 영상의 온전한 노출을 100% 보장합니다.
  - 타이머가 끝남과 동시에 `switchProgram('prog_null')`로 복귀하고 비로소 락 상태를 `delete` 처리합니다.
- 타이머가 끝나고 안전하게 공통 영상으로 화면을 원상복구시킨 뒤에야, 드롭시켰던 방어막을 완전히 해제하여 다시 반응할 준비를 마칩니다.

---

## 4. 요약: 최종 연동 시나리오

1. **[CMS 웹 셋업]**: 사용자가 광고를 업로드하고 타겟 성별(남성/여성)과 송출 대기 시간(IMAGE_DELAY)을 입력하여 스케줄을 저장합니다.
2. **[백엔드 API 적재]**: Node.js 서버가 Huidu SDK API(`AddProgram`)를 호출하여 해당 영상들을 전부 LED 보드로 전송합니다. 공통 광고는 루프락(99,999회)을 걸고, 성별 광고들은 개별 채널들(`prog_male_0`, `prog_female_1` 등)로 쪼개 숨깁니다.
3. **[CCTV 감지 및 스위칭]**: 
   - 거리를 지나는 사람 발생 시 카메라가 `RealTimeCount` Push API를 노드로 발송합니다.
   - 노드에서 델타 필터링 후 성별을 알아내고, 해당 성별의 여러 하위 채널 중 하나를 난수 기법으로 선택합니다.
   - `SwitchProgram` API를 쏘아 0.1초 만에 화면을 강제 전환시킵니다.
4. **[방어막 해제]**: 정해진 송출 시간이 만료되면, 다시 `SwitchProgram('prog_null')` API를 쏘아 공통 영상으로 자연스럽게 화면을 돌려놓고, 걸어두었던 쿨타임 방어막을 삭제합니다.
