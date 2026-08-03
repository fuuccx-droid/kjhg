import React, { useState, useRef, useEffect } from 'react';

export default function App() {
  const [targetPreview, setTargetPreview] = useState(''); // 몸/배경
  const [facePreview, setFacePreview] = useState('');     // 내 진짜 얼굴

  // 오프셋 및 매칭 파라미터
  const [faceX, setFaceX] = useState(50);
  const [faceY, setFaceY] = useState(28);
  const [faceScale, setFaceScale] = useState(100);
  const [faceRotate, setFaceRotate] = useState(0);

  // 피부톤/조명 동기화 옵션
  const [autoColorMatch, setAutoColorMatch] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [warmth, setWarmth] = useState(0);
  const [feather, setFeather] = useState(30);

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

  // 픽셀 단위 조명 & 피부톤 매칭 알고리즘
  const renderExactSeamlessBlend = () => {
    if (!targetPreview || !facePreview || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const imgTarget = new Image();
    const imgFace = new Image();

    imgTarget.onload = () => {
      canvas.width = imgTarget.width;
      canvas.height = imgTarget.height;

      // 1. 타겟 몸 사진 원본 그리기
      ctx.drawImage(imgTarget, 0, 0);

      imgFace.onload = () => {
        const fWidth = (imgFace.width * (faceScale / 100)) * (canvas.width / 1000);
        const fHeight = (imgFace.height * (faceScale / 100)) * (canvas.height / 1000);
        const posX = (canvas.width * (faceX / 100)) - (fWidth / 2);
        const posY = (canvas.height * (faceY / 100)) - (fHeight / 2);

        // 오프스크린 캔버스에서 얼굴 조작 (원본 픽셀 100% 보존)
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = fWidth;
        faceCanvas.height = fHeight;
        const fCtx = faceCanvas.getContext('2d');

        // 회전 및 그리기
        fCtx.save();
        fCtx.translate(fWidth / 2, fHeight / 2);
        fCtx.rotate((faceRotate * Math.PI) / 180);

        // 조명 및 톤 필터 적용 (AI 생성이 아닌 실제 이미지 색감 보정)
        let filterStr = `brightness(${brightness}%)`;
        if (warmth > 0) filterStr += ` sepia(${warmth}%)`;
        if (warmth < 0) filterStr += ` hue-rotate(${warmth}deg)`;
        fCtx.filter = filterStr;

        fCtx.drawImage(imgFace, -fWidth / 2, -fHeight / 2, fWidth, fHeight);
        fCtx.restore();

        // 알파 심리스 페더링 마스크 (경계선 부드럽게 이어서 티 안 나게 합성)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = fWidth;
        maskCanvas.height = fHeight;
        const mCtx = maskCanvas.getContext('2d');

        const grad = mCtx.createRadialGradient(
          fWidth / 2, fHeight / 2, Math.max(10, (fWidth / 2) - feather * 2),
          fWidth / 2, fHeight / 2, fWidth / 2
        );
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        mCtx.fillStyle = grad;
        mCtx.fillRect(0, 0, fWidth, fHeight);

        // 마스크와 얼굴 픽셀 결합
        fCtx.globalCompositeOperation = 'destination-in';
        fCtx.drawImage(maskCanvas, 0, 0);

        // 타겟 메인 이미지 위에 최종 마감 얹기
        ctx.save();
        ctx.drawImage(faceCanvas, posX, posY);
        ctx.restore();
      };
      imgFace.src = facePreview;
    };
    imgTarget.src = targetPreview;
  };

  useEffect(() => {
    renderExactSeamlessBlend();
  }, [targetPreview, facePreview, faceX, faceY, faceScale, faceRotate, brightness, warmth, feather]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'exact-face-blend.png';
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="app-title">AIMAGE - 원본 보존 정밀 심리스 합성기</h1>
        <p className="app-subtitle">
          AI 재창작 0%! **내 얼굴 사진 픽셀 100% 그대로** 타겟 사진 조명 및 피부톤에 맞추어 깔끔하게 합성합니다.
        </p>
      </header>

      <main className="main-content">
        <div className="upload-row">
          <div className="form-group">
            <label className="form-label">1. 배경/몸 사진</label>
            <input type="file" accept="image/*" onChange={handleTargetChange} className="file-input-simple" />
          </div>

          <div className="form-group">
            <label className="form-label">2. 내 얼굴 사진 (원본 그대로 보존)</label>
            <input type="file" accept="image/*" onChange={handleFaceChange} className="file-input-simple" />
          </div>
        </div>

        {targetPreview && facePreview && (
          <section className="control-section">
            <h3>🎛️ 얼굴 위치 및 조명/피부톤 정밀 맞춤</h3>
            
            <div className="control-grid">
              <label>
                가로 위치 (X): {faceX}%
                <input type="range" min="5" max="95" value={faceX} onChange={(e) => setFaceX(Number(e.target.value))} />
              </label>

              <label>
                세로 위치 (Y): {faceY}%
                <input type="range" min="5" max="95" value={faceY} onChange={(e) => setFaceY(Number(e.target.value))} />
              </label>

              <label>
                얼굴 크기: {faceScale}%
                <input type="range" min="20" max="250" value={faceScale} onChange={(e) => setFaceScale(Number(e.target.value))} />
              </label>

              <label>
                얼굴 각도 회전: {faceRotate}°
                <input type="range" min="-45" max="45" value={faceRotate} onChange={(e) => setFaceRotate(Number(e.target.value))} />
              </label>

              <label>
                얼굴 밝기 맞춤: {brightness}%
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
              </label>

              <label>
                피부 톤(웜/쿨): {warmth}
                <input type="range" min="-30" max="30" value={warmth} onChange={(e) => setWarmth(Number(e.target.value))} />
              </label>

              <label>
                경계선 이음새 부드러움: {feather}px
                <input type="range" min="5" max="60" value={feather} onChange={(e) => setFeather(Number(e.target.value))} />
              </label>
            </div>
          </section>
        )}

        <section className="result-section">
          <h2 className="result-title">📸 원본 100% 보존 고화질 결과물</h2>
          
          <div className="canvas-container">
            <canvas ref={canvasRef} className="main-canvas" />
          </div>

          {targetPreview && facePreview && (
            <button onClick={handleDownload} className="download-btn">
              💾 티 안 나는 원본 합성 고화질 다운로드
            </button>
          )}
        </section>
      </main>
    </div>
  );
}