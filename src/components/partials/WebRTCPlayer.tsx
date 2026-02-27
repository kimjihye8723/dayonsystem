import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface WebRTCPlayerProps {
    streamUrl?: string; // Example: http://localhost:1984/api/webrtc?src=cam01
    width?: string | number;
    height?: string | number;
}

const WebRTCPlayer: React.FC<WebRTCPlayerProps> = ({
    streamUrl = '',
    width = '100%',
    height = '100%'
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const monitorRef = useRef<any>(null);
    const lastVideoTimeRef = useRef<number>(0);
    const sameTimeCountRef = useRef<number>(0);

    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const quality = {
        maxBitrate: 2000000,
        maxFramerate: 30,
        width: 1280,
        height: 720
    };

    const startConnection = async () => {
        if (!streamUrl) {
            setStatus('error');
            setErrorMessage('Stream URL is not configured.');
            return;
        }

        try {
            setStatus('connecting');
            console.log(`[WebRTC] Starting connection to: ${streamUrl}`);

            // 1. Create RTCPeerConnection
            const pc = new RTCPeerConnection({});
            pcRef.current = pc;

            // 2. Handle tracks
            pc.ontrack = (event) => {
                console.log('[WebRTC] Track received:', event.track.kind);
                if (videoRef.current && event.streams[0]) {
                    videoRef.current.srcObject = event.streams[0];

                    videoRef.current.play().then(() => {
                        console.log('[WebRTC] Playback started');
                        setStatus('connected');
                        startTrackMonitor();
                    }).catch((e) => {
                        console.warn('[WebRTC] Playback failed, retrying...', e);
                    });
                }
            };

            pc.oniceconnectionstatechange = () => {
                const state = pc.iceConnectionState;
                console.log('[WebRTC] ICE State Changed:', state);
                if (state === 'failed' || state === 'disconnected') {
                    console.warn(`[WebRTC] Connection ${state}, restarting in 2s...`);
                    stopConnection();
                    setTimeout(startConnection, 2000);
                } else if (state === 'connected') {
                    console.log('[WebRTC] ICE Connected!');
                    applySenderParams(pc);
                }
            };

            // 3. Add transceiver for video
            pc.addTransceiver('video', { direction: 'sendrecv' });

            // 4. Create Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // 5. Send Offer to server (Using provided format: BASE64 encoded SDP)
            const urlWithParams = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}quality=high` +
                `&width=${quality.width}` +
                `&height=${quality.height}` +
                `&bitrate=${quality.maxBitrate}` +
                `&fps=${quality.maxFramerate}`;

            console.log(`[WebRTC] Negotiating with: ${urlWithParams}`);

            const response = await fetch(urlWithParams, {
                method: 'POST',
                body: new URLSearchParams({
                    data: btoa(pc.localDescription!.sdp)
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`게이트웨이 응답 오류 (${response.status}): ${errorText || '상세 정보 없음'}`);
            }

            const rawAnswer = await response.text();
            if (!rawAnswer) throw new Error('게이트웨이로부터 SDP Answer를 받지 못했습니다.');

            const answerSdp = atob(rawAnswer.trim());
            console.log('[WebRTC] Received Answer Answer, setting remote description...');

            // 6. Set Remote Description
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: answerSdp
            }));
            console.log('[WebRTC] Remote description set successfully');

        } catch (err: any) {
            console.error('[WebRTC] Error:', err);
            setStatus('error');
            setErrorMessage(err.message || 'Failed to connect to video stream.');
        }
    };

    const applySenderParams = async (pc: RTCPeerConnection) => {
        try {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (!sender) return;

            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];

            params.encodings[0].maxBitrate = quality.maxBitrate;
            params.encodings[0].maxFramerate = quality.maxFramerate;

            await sender.setParameters(params);
            console.log('[WebRTC] Sender parameters applied');
        } catch (e) {
            console.error('[WebRTC] Failed to apply sender params', e);
        }
    };

    const startTrackMonitor = () => {
        if (monitorRef.current) clearInterval(monitorRef.current);

        monitorRef.current = setInterval(() => {
            const video = videoRef.current;
            if (video && video.currentTime > 0 && !video.paused && !video.ended) {
                if (video.currentTime === lastVideoTimeRef.current) {
                    sameTimeCountRef.current++;
                } else {
                    sameTimeCountRef.current = 0;
                    lastVideoTimeRef.current = video.currentTime;
                }

                // 3초 이상 화면이 멈춰있으면 재접속 시도
                if (sameTimeCountRef.current > 3) {
                    console.log("[WebRTC] Video frozen detected, restarting...");
                    stopConnection();
                    setTimeout(startConnection, 1000);
                }
            }
        }, 1000); // 1초마다 검사
    };

    const stopConnection = () => {
        if (monitorRef.current) {
            clearInterval(monitorRef.current);
            monitorRef.current = null;
        }
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStatus('idle');
        sameTimeCountRef.current = 0;
    };

    useEffect(() => {
        startConnection();
        return () => stopConnection();
    }, [streamUrl]);

    return (
        <div style={{
            width,
            height,
            background: '#000',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            overflow: 'hidden'
        }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: (status === 'connected') ? 'block' : 'none'
                }}
            />

            {(status === 'connecting' || status === 'idle') && (
                <div style={{ textAlign: 'center' }}>
                    <RefreshCw size={32} style={{ animation: 'spin 2s linear infinite', marginBottom: '1rem' }} />
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>CCTV 연결 중...</p>
                </div>
            )}

            {status === 'error' && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <AlertCircle size={32} color="#ef4444" style={{ marginBottom: '1rem' }} />
                    <p style={{ fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.5rem' }}>영상을 불러올 수 없습니다</p>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{errorMessage}</p>
                    <button
                        onClick={startConnection}
                        style={{
                            marginTop: '1rem',
                            padding: '6px 16px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                        }}
                    >
                        재접속 시도
                    </button>
                </div>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default WebRTCPlayer;
