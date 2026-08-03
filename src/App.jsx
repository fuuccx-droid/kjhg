import React, { useState } from 'react';

const compressImage = (file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function App() {
  const [targetPreview, setTargetPreview] = useState(''); // 배경 및 몸체 사진
  const [facePreview, setFacePreview] = useState('');     // 합성할 얼굴 사진
  
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [swappedImageUrl, setSwappedImageUrl] = useState('');

  const handleTargetChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setTargetPreview(compressed);
    } catch (err) {
      setError('이미지 압축 중 오류가 발생했습니다.');
    }
  };

  const handleFaceChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setFacePreview(compressed);
    } catch (err) {
      setError('이미지 압축 중 오류가 발생했습니다.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!targetPreview || !facePreview) {
      setError('배경 사진과 내 얼굴 사진 두 개를 모두 올려주셔야 합성할 수 있습니다.');
      return;
    }

    setLoading(true);
    setStatusMessage('얼굴 이목구비(Face Landmark)를 감지하고 조명 및 피부톤을 정밀 합성하는 중입니다...');
    setSwappedImageUrl('');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetImage: targetPreview,
          faceImage: facePreview
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '페이스 스왑 합성 처리 중 오류가 발생했습니다.');
      }

      setSwappedImageUrl(data.imageUrl);
    } catch (err) {
      setError(err.message || '서버 연결 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="app-title">AIMAGE - AI 페이스 스왑</h1>
        <p className="app-subtitle">
          SNS 유행 AI 합성 방식! 원하는 사진의 인물 위치에 내 얼굴의 이목구비와 분위기를 **진짜 사진처럼** 교체 이식합니다.
        </p>
      </header>

      <main className="main-content">
        <form onSubmit={handleSubmit} className="input-form">
          <div className="form-group">
            <label className="form-label">1. 타겟 사진 (몸, 옷, 스타일 배경이 있는 사진)</label>
            <div className="file-upload-box">
              <input type="file" accept="image/*" id="target-upload" onChange={handleTargetChange} className="file-input" />
              <label htmlFor="target-upload" className="upload-button">
                🖼️ 배경/스타일 타겟 사진 선택
              </label>
            </div>
            {targetPreview && (
              <div className="preview-card">
                <img src={targetPreview} alt="타겟 사진" />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">2. 내 얼굴 사진 (이목구비를 가져올 원본 얼굴 사진)</label>
            <div className="file-upload-box">
              <input type="file" accept="image/*" id="face-upload" onChange={handleFaceChange} className="file-input" />
              <label htmlFor="face-upload" className="upload-button">
                👤 내 얼굴 사진 선택
              </label>
            </div>
            {facePreview && (
              <div className="preview-card">
                <img src={facePreview} alt="얼굴 원본" />
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'AI 정밀 얼굴 이식 합성 중...' : '✨ 진짜 같은 AI 페이스 스왑 실행'}
          </button>
        </form>

        <section className="status-section">
          {loading && (
            <div className="loading-box">
              <div className="spinner"></div>
              <p className="loading-text">{statusMessage}</p>
            </div>
          )}
        </section>

        <section className="result-section">
          <h2 className="result-title">📸 AI 페이스 스왑 결과물</h2>
          
          {swappedImageUrl ? (
            <div className="generated-image-box">
              <div className="image-wrapper">
                <img src={swappedImageUrl} alt="합성된 결과" className="generated-image" />
              </div>
              <a href={swappedImageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
                💾 고화질 페이스 스왑 이미지 저장하기
              </a>
            </div>
          ) : (
            <div className="placeholder-box">
              <p>두 장의 사진을 업로드하면 AI가 이목구비 위치, 조명, 피부톤을 계산해 극도로 자연스럽게 합성합니다.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}