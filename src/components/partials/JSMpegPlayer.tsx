import React, { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        JSMpeg?: any;
    }
}

interface JSMpegPlayerProps {
    wsUrl: string;
    width?: string | number;
    height?: string | number;
}

export const JSMpegPlayer: React.FC<JSMpegPlayerProps> = ({
    wsUrl,
    width = '100%',
    height = '100%'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playerRef = useRef<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const loadScript = async () => {
            if (window.JSMpeg) return;

            const existing = document.querySelector('script[data-jsmpeg="true"]') as HTMLScriptElement | null;

            if (existing) {
                await new Promise<void>((resolve, reject) => {
                    if (window.JSMpeg) {
                        resolve();
                        return;
                    }

                    const handleLoad = () => {
                        resolve();
                        existing.removeEventListener('load', handleLoad);
                    };
                    const handleError = () => {
                        reject(new Error('JSMpeg 스크립트 로드 실패'));
                        existing.removeEventListener('error', handleError);
                    };

                    existing.addEventListener('load', handleLoad);
                    existing.addEventListener('error', handleError);
                });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/gh/phoboslab/jsmpeg@master/jsmpeg.min.js';
            script.async = true;
            script.dataset.jsmpeg = 'true';

            await new Promise<void>((resolve, reject) => {
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('JSMpeg 스크립트 로드 실패'));
                document.body.appendChild(script);
            });
        };

        const initPlayer = async () => {
            try {
                if (cancelled) return;
                setError('');
                setLoading(true);
                await loadScript();

                if (cancelled || !canvasRef.current || !window.JSMpeg) return;

                playerRef.current = new window.JSMpeg.Player(wsUrl, {
                    canvas: canvasRef.current,
                    autoplay: true,
                    audio: false,
                    pauseWhenHidden: false,
                    disableGl: false,
                    onVideoDecode: () => {
                        console.log('[JSMpeg] Video decode started');
                        setLoading(false);
                    },
                    onSourceEstablished: () => {
                        console.log('[JSMpeg] Source established');
                    },
                    onSourceCompleted: () => {
                        console.log('[JSMpeg] Source completed');
                    }
                });

                // WebSocket 에러를 감지하기 위해 source의 socket 객체에 접근 (JSMpeg 내부 구조 활용)
                if (playerRef.current.source && playerRef.current.source.socket) {
                    playerRef.current.source.socket.onerror = (e: any) => {
                        console.error('[JSMpeg] WebSocket Error:', e);
                        setError('WebSocket 연결 실패: 서버 상태나 네트워크를 확인하세요.');
                        setLoading(false);
                    };
                }

                // WebSocket 연결 시도 로그
                console.log(`[JSMpeg] Connecting to: ${wsUrl}`);
            } catch (err: any) {
                console.error('[JSMpeg] init error', err);
                setError(err?.message || '영상 플레이어 초기화 실패');
            }
        };

        initPlayer();

        const timeoutId = setTimeout(() => {
            if (!cancelled && loading) {
                setError('연결 타임아웃: 서버 응답이 없거나 네트워크 확인이 필요합니다.');
                setLoading(false);
            }
        }, 10000);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            if (playerRef.current) {
                playerRef.current.destroy?.();
                playerRef.current = null;
            }
        };
    }, [wsUrl]);

    return (
        <div
            style={{
                width,
                height,
                background: '#000',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    background: '#000'
                }}
            />
            {loading && !error && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        background: 'rgba(0,0,0,0.4)',
                        gap: '12px',
                        zIndex: 1
                    }}
                >
                    <div className="animate-spin" style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }}></div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Connecting to stream...</span>
                </div>
            )}
            {error && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        background: 'rgba(0,0,0,0.65)',
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        zIndex: 2
                    }}
                >
                    {error}
                </div>
            )}
        </div>
    );
};

export default JSMpegPlayer;