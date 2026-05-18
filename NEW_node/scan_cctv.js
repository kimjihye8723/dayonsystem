const http = require('http');
const os = require('os');

// 내 PC의 로컬 네트워크 대역폭(서브넷) 찾기
function getLocalSubnets() {
    const interfaces = os.networkInterfaces();
    const subnets = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const parts = iface.address.split('.');
                parts.pop(); // 마지막 자리 제거 (예: 192.168.1)
                subnets.push(parts.join('.'));
            }
        }
    }
    return [...new Set(subnets)];
}

// 특정 IP가 CCTV 센서인지 찔러보기
function checkIp(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}/api/statistics/query`, {
            timeout: 2000 // 2초 타임아웃
        }, (res) => {
            // CCTV 센서(TD2000)는 인증 없이 해당 경로에 접근하면 무조건 401(Unauthorized)을 반환해야 함.
            // 200 OK를 반환하는 것은 개발용 서버나 가짜 서버일 확률이 높음.
            if (res.statusCode === 401) {
                console.log(`\n[발견!] CCTV 센서 확인 IP: ${ip} (HTTP 상태 코드: 401 인증필요)`);
                resolve(ip);
            } else {
                resolve(null);
            }
            res.resume(); // 메모리 릭 방지
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function scan() {
    const subnets = getLocalSubnets();
    console.log(`[CCTV 센서 스캐너 시작]`);
    console.log(`스캔 대상 서브넷: ${subnets.join(', ')} (총 ${subnets.length * 254}개 IP 검색 중...)`);
    console.log(`잠시만 기다려주세요...\n`);

    const promises = [];
    for (const subnet of subnets) {
        for (let i = 1; i <= 254; i++) {
            const ip = `${subnet}.${i}`;
            promises.push(checkIp(ip));
        }
    }

    const results = await Promise.all(promises);
    const found = results.filter(ip => ip !== null);

    console.log(`\n[스캔 종료] 총 ${found.length}개의 CCTV 센서를 찾았습니다.`);
    if (found.length > 0) {
        console.log(`=> 확인된 IP 리스트: ${found.join(', ')}`);
        console.log(`\n위 IP를 브라우저에 입력하여 센서 관리자 페이지(TD2000 G3)가 뜨는지 확인하세요.`);
    } else {
        console.log(`=> CCTV 센서를 찾지 못했습니다. 기기가 같은 공유기(네트워크)에 물려있는지 확인해주세요.`);
    }
}

scan();
