import React, { useRef, useState, useEffect } from 'react';
import { User, Camera, Trash2 } from 'lucide-react';
import axios from 'axios';

const UserInfoContent: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [profileImg, setProfileImg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            setName(userData.name || '');
            setEmail(userData.email || '');
            setPhone(userData.phone || '');
            setProfileImg(userData.profile_img || null);
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert('이미지 파일 크기는 2MB 이하여야 합니다.');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImg(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeletePhoto = () => {
        if (window.confirm('프로필 사진을 삭제하시겠습니까?')) {
            setProfileImg(null);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password && password !== confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.put('/api/user/update', {
                account: user.account,
                name,
                password: password || undefined,
                email,
                phone,
                profile_img: profileImg
            });

            if (response.data.success) {
                const updatedUser = response.data.user;
                // Update local storage
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setUser(updatedUser);

                // Dispatch custom event to notify other components (like Dashboard Header)
                window.dispatchEvent(new Event('userUpdated'));

                alert('회원정보 수정이 완료되었습니다.');
                setPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            console.error('Update error:', error);
            const message = error.response?.data?.message || error.message || '정보 수정 중 오류가 발생했습니다.';
            alert(message);
        } finally {
            setLoading(false);
        }
    };

    if (!user) return <div style={{ padding: '2rem', color: '#94a3b8' }}>사용자 정보를 불러오는 중...</div>;

    return (
        <div className="animate-fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '2rem', color: '#f1f5f9', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>회원정보 관리</h2>

            <div style={{ maxWidth: '700px' }}>
                <form onSubmit={handleUpdate}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        accept="image/*"
                    />

                    {/* Affiliate & Profile Section */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '1rem 2rem', alignItems: 'center' }}>
                            <span className="modal-label" style={{ marginBottom: 0 }}>소속기업</span>
                            <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.1rem' }}>현대보안월드</span>

                            <span className="modal-label" style={{ marginBottom: 0 }}>소속매장</span>
                            <span style={{ color: '#94a3b8' }}>-</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                            <div className="profile-img-placeholder" style={{
                                width: '100px',
                                height: '100px',
                                background: 'rgba(30, 41, 59, 0.5)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                {profileImg ? (
                                    <img src={profileImg} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <User size={50} color="#94a3b8" />
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    style={{
                                        background: '#22d3ee',
                                        color: 'white',
                                        padding: '0.4rem 0.8rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        borderRadius: '0.375rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        border: 'none'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Camera size={14} /> {profileImg ? '변경' : '등록'}
                                </button>
                                {profileImg && (
                                    <button
                                        type="button"
                                        className="btn"
                                        style={{
                                            background: '#ef4444',
                                            color: 'white',
                                            padding: '0.4rem 0.8rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            borderRadius: '0.375rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            border: 'none'
                                        }}
                                        onClick={handleDeletePhoto}
                                    >
                                        <Trash2 size={14} /> 삭제
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Form Section */}
                    <div className="modal-form-grid" style={{ gridTemplateColumns: '120px 1fr', gap: '1.25rem 2rem' }}>
                        <span className="modal-label">사용계정</span>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                className="modal-input"
                                value={user.account}
                                readOnly
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    cursor: 'not-allowed',
                                    color: '#64748b',
                                    paddingRight: '2.5rem'
                                }}
                            />
                            <span style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '0.7rem',
                                color: '#ef4444',
                                fontWeight: 600
                            }}>수정불가</span>
                        </div>

                        <span className="modal-label">사용자명</span>
                        <input
                            type="text"
                            className="modal-input"
                            placeholder="사용자명을 입력해 주세요."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />

                        <span className="modal-label">비밀번호</span>
                        <input
                            type="password"
                            className="modal-input"
                            placeholder="변경할 비밀번호를 입력하세요 (미입력 시 유지)."
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        <span className="modal-label">비번확인</span>
                        <input
                            type="password"
                            className="modal-input"
                            placeholder="입력한 비밀번호를 다시 입력해 주세요."
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />

                        <span className="modal-label">이메일</span>
                        <input
                            type="email"
                            className="modal-input"
                            placeholder="이메일 주소를 입력하세요."
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <span className="modal-label">휴대번호</span>
                        <input
                            type="tel"
                            className="modal-input"
                            placeholder="휴대폰 번호를 입력하세요."
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>

                    <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'center' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ padding: '0.875rem 4rem', fontSize: '1rem', fontWeight: 700, borderRadius: '0.5rem' }}
                            disabled={loading}
                        >
                            {loading ? '처리 중...' : '정보 저장'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserInfoContent;
