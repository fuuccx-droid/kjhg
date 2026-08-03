import React, { useState, useRef, useEffect } from 'react';

export default function App() {
  const [targetPreview, setTargetPreview] = useState(''); // 몸/배경 사진
  const [facePreview, setFacePreview] = useState('');     // 얼굴 사진
  
  // 수동/자동 조절용 상태
  const [faceX, setFaceX] = useState(50);
  const [faceY, setFaceY] = useState(30);
  const [faceScale, setFaceScale] = useState(100);
  const [feather, setFeather] = useState(25); // 경계선 페더링(부드러움)

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [resultImageUrl, setResultImageUrl] = useState('');

  const canvasRef = useRef(null);

  const handleTargetChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setTargetPreview(evt.target.result);
    reader.readAsDataURL(file);
  };

  const handleFaceChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setFacePreview(evt.target.result);
    reader.readAsDataURL(file);
  };

  // 1차 캔버스 조합 (얼굴 배치 + 경계선 블러 처리)
  const drawCompositeBase = () => {
    return new Promise((resolve) => {
      if (!targetPreview || !facePreview) return resolve(null);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const imgTarget = new Image();
      const imgFace = new Image();

      imgTarget.onload = () => {
        canvas.width = imgTarget.width;
        canvas.height = imgTarget.height;

        // 1. 타겟 몸 사진 그리기
        ctx.drawImage(imgTarget, 0, 0);

        imgFace.onload = () => {
          // 2. 얼굴 오려내기 및 마스크 적용 (부드러운 경계)
          const fWidth = (imgFace.width * (faceScale / 100)) * (canvas.width / 1000);
          const fHeight = (imgFace.height * (faceScale / 100)) * (canvas.height / 1000);
          const posX = (canvas.width * (faceX / 100)) - (fWidth / 2);
          const posY = (canvas.height * (faceY / 100)) - (fHeight / 2);

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = fWidth;
          tempCanvas.height = fHeight;
          const tCtx = tempCanvas.getContext('2d');

          // 타원형 마스크 + 경계선 소프트 블러ing
          tCtx.save();
          tCtx.beginPath();
          tCtx.ellipse(fWidth / 2, fHeight / 2, fWidth / 2 - feather, fHeight / 2 - feather, 0, 0, Math.PI * 2);
          tCtx.clip();
          tCtx.drawImage(imgFace, 0, 0, fWidth, fHeight);
          tCtx.restore();

          // 메인 캔버스에 타원 얼굴 합성
          ctx.drawImage(tempCanvas, posX, posY);

          resolve({
            compositeDataUrl: canvas.toDataURL('image/jpeg', 0.95),
            maskDataUrl: createMaskDataUrl(canvas.width, canvas.height, posX, posY, fWidth, fHeight, feather)
          });
        };
        imgFace.src = facePreview;
      };
      imgTarget.src = targetPreview;
    });
  };

  // 경계선 부분만 AI가 피부톤/조명을 메우도록 만드는 마스크 이미지 생성
  const createMaskDataUrl = (w, h, x, y, fw, fh, featherSize) => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mCtx = maskCanvas.getContext('2d');

    // 전체 검은색
    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, w, h);

    // 경계선 띠 부분만 흰색(AI 보정 영역)으로 지정
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = featherSize * 2;
    mCtx.beginPath();
    mCtx.ellipse(x + fw / 2, y + fh / 2, fw / 2 - featherSize / 2, fh / 2 - featherSize / 2, 0, 0, Math.PI * 2);
    mCtx.stroke();

    return maskCanvas.toDataURL('image/png');
  };

  useEffect(() => {
    if (targetPreview && facePreview && canvasRef.current) {
      drawCompositeBase().then((res) => {
        if (res) {
          const previewImg = new Image();
          previewImg.onload = () => {
            const ctx = canvasRef.current.getContext('2d');
            canvasRef.current.width = previewImg.width;
            canvasRef.current.height = previewImg.height;
            ctx.drawImage(previewImg, 0, 0);
          };
          previewImg.src = res.compositeDataUrl;
        }
      });
    }
  }, [targetPreview, facePreview, faceX, faceY, faceScale, feather]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!targetPreview || !facePreview) {
      setError('배경 사진과 얼굴 사진을 모두 업로드해 주세요.');
      return;
    }

    setLoading(true);
    setStatusText('1단계: 얼굴 원본과 몸 형태를 1:1 결합 중...');

    try {
      const baseResult = await drawCompositeBase();
      if (!baseResult) throw new Error('이미지 캔버스 처리에 실패했습니다.');

      setStatusText('2단계: AI가 경계선/피부톤/조명 반사만 자연스럽게 지우개 보정(Inpainting) 중...');

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compositeImage: baseResult.compositeDataUrl,
          maskImage: baseResult.maskDataUrl
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI 보정 처리 중 오류가 발생했습니다.');

      setResultImageUrl(data.imageUrl);

    } catch (err) {
      setError(err.message || '처리 중 오차 발생');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="app-title">AIMAGE - AI 심리스 포토 합성기</h1>
        <p className="app-subtitle">
          표정 왜곡 없이 **내 사진 얼굴 원본 100% 그대로**! 몸 위에 얹고 **경계선/조명만 AI가 자연스럽게 마감**해 드립니다.
        </p>
      </header>

      <main className="main-content">
        <form onSubmit={handleSubmit} className="input-form">
          <div className="upload-row">
            <div className="form-group">
              <label className="form-label">1. 타겟 몸/배경 사진</label>
              <input type="file" accept="image/*" onChange={handleTargetChange} className="file-input-simple" />
            </div>

            <div className="form-group">
              <label className="form-label">2. 내 얼굴 원본 사진</label>
              <input type="file" accept="image/*" onChange={handleFaceChange} className="file-input-simple" />
            </div>
          </div>

          {targetPreview && facePreview && (
            <div className="position-controls">
              <h3>📍 얼굴 위치 및 크기 조절 (자연스러운 위치로 맞추기)</h3>
              <div className="slider-grid">
                <label>
                  가로 위치 (X): {faceX}%
                  <input type="range" min="10" max="90" value={faceX} onChange={(e) => setFaceX(Number(e.target.value))} />
                </label>

                <label>
                  세로 위치 (Y): {faceY}%
                  <input type="range" min="10" max="90" value={faceY} onChange={(e) => setFaceY(Number(e.target.value))} />
                </label>

                <label>
                  얼굴 크기 Scale: {faceScale}%
                  <input type="range" min="30" max="200" value={faceScale} onChange={(e) => setFaceScale(Number(e.target.value))} />
                </label>

                <label>
                  경계 소프트 블러: {feather}px
                  <input type="range" min="5" max="50" value={feather} onChange={(e) => setFeather(Number(e.target.value))} />
                </label>
              </div>

              <div className="canvas-preview-box">
                <p className="preview-tag">👁️ 1차 합성 실시간 미리보기 (AI 처리 전)</p>
                <canvas ref={canvasRef} className="preview-canvas" />
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading || !targetPreview || !facePreview}>
            {loading ? statusText : '✨ AI 경계선 & 조명 자연스러운 마감 실행하기'}
          </button>
        </form>

        <section className="result-section">
          <h2 className="result-title">🖼️ 최종 자연스러운 AI 마감 결과</h2>
          
          {resultImageUrl ? (
            <div className="generated-image-box">
              <div className="image-wrapper">
                <img src={resultImageUrl} alt="자연스럽게 보정된 완성작" className="generated-image" />
              </div>
              <a href={resultImageUrl} download="seamless-photo.png" target="_blank" rel="noopener noreferrer" className="download-btn">
                💾 티 안 나는 최종 고화질 합성 사진 다운로드
              </a>
            </div>
          ) : (
            <div className="placeholder-box">
              <p>원하는 위치에 얼굴을 맞춘 뒤 [AI 마감 실행하기]를 누르면, AI가 이목구비나 표정 변화 없이 **경계선과 피부톤, 조명만 자연스럽게 결합**해 드립니다.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}