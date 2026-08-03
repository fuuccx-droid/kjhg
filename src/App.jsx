import React, { useState, useRef, useEffect } from 'react';

export default function App() {
  const [stylePreview, setStylePreview] = useState('');
  const [characterPreview, setCharacterPreview] = useState('');
  const [requestText, setRequestText] = useState('');

  // 합성 조절 매개변수
  const [blendMode, setBlendMode] = useState('overlay');
  const [opacity, setOpacity] = useState(0.85);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [hueRotate, setHueRotate] = useState(0);
  const [sepia, setSepia] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultText, setResultText] = useState('');
  const [compositeDataUrl, setCompositeDataUrl] = useState('');

  const canvasRef = useRef(null);

  const handleStyleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setStylePreview(evt.target.result);
    reader.readAsDataURL(file);
  };

  const handleCharacterChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setCharacterPreview(evt.target.result);
    reader.readAsDataURL(file);
  };

  // 실시간 Canvas 그래픽 레이어 합성 함수
  const renderCompositeCanvas = () => {
    if (!stylePreview || !characterPreview) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const imgStyle = new Image();
    const imgChar = new Image();

    imgStyle.onload = () => {
      canvas.width = imgStyle.width || 800;
      canvas.height = imgStyle.height || 800;

      // 1. 배경 (스타일 이미지) 그리기
      ctx.drawImage(imgStyle, 0, 0, canvas.width, canvas.height);

      imgChar.onload = () => {
        ctx.save();

        // 2. 캐릭터 필터 및 혼합 모드 적용
        ctx.globalCompositeOperation = blendMode;
        ctx.globalAlpha = opacity;
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hueRotate}deg) sepia(${sepia}%)`;

        // 3. 캐릭터 이미지 상단에 100% 원본 픽셀로 합성
        ctx.drawImage(imgChar, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/png');
        setCompositeDataUrl(dataUrl);
      };
      imgChar.src = characterPreview;
    };
    imgStyle.src = stylePreview;
  };

  useEffect(() => {
    if (stylePreview && characterPreview) {
      renderCompositeCanvas();
    }
  }, [stylePreview, characterPreview, blendMode, opacity, brightness, contrast, saturate, hueRotate, sepia]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stylePreview || !characterPreview) {
      setError('스타일 이미지와 캐릭터 이미지를 모두 업로드해 주세요.');
      return;
    }

    setError('');
    setLoading(true);
    setResultText('');

    try {
      const payloadData = {
        styleImage: stylePreview,
        characterImage: characterPreview,
        requestText: requestText
      };

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: JSON.stringify(payloadData) })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '처리 중 오류가 발생했습니다.');

      // Gemini가 추천한 최적의 합성 및 색감 필터값 자동 반영
      if (data.blendMode) setBlendMode(data.blendMode);
      if (data.opacity !== undefined) setOpacity(data.opacity);
      if (data.filter) {
        if (data.filter.brightness !== undefined) setBrightness(data.filter.brightness);
        if (data.filter.contrast !== undefined) setContrast(data.filter.contrast);
        if (data.filter.saturate !== undefined) setSaturate(data.filter.saturate);
        if (data.filter.hueRotate !== undefined) setHueRotate(data.filter.hueRotate);
        if (data.filter.sepia !== undefined) setSepia(data.filter.sepia);
      }

      setResultText(data.result || 'AI가 최적의 스타일 색감 합성 파라미터를 계산하여 적용했습니다.');

    } catch (err) {
      setError(err.message || '서버 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 className="app-title">AIMAGE - 레이어 합성기</h1>
        <p className="app-subtitle">
          인공지능이 캐릭터를 새로 그리지 않고, **원본 캐릭터 사진을 100% 유지**하면서 배경 스타일과 직관적으로 합성합니다.
        </p>
      </header>

      <main className="main-content">
        <form onSubmit={handleSubmit} className="input-form">
          <div className="form-group">
            <label className="form-label">1. 입힐 드로잉 스타일 배경 이미지</label>
            <input type="file" accept="image/*" onChange={handleStyleChange} className="file-input-simple" />
            {stylePreview && (
              <div className="preview-card-simple">
                <img src={stylePreview} alt="스타일 배경" />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">2. 원본 유지 캐릭터 이미지 (얼굴/형태 100% 보존)</label>
            <input type="file" accept="image/*" onChange={handleCharacterChange} className="file-input-simple" />
            {characterPreview && (
              <div className="preview-card-simple">
                <img src={characterPreview} alt="캐릭터 원본" />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">3. 요청사항 (AI가 합성 색감을 분석하는 데 참고합니다)</label>
            <textarea
              className="text-input"
              rows="3"
              placeholder="예: 캐릭터의 원본 얼굴을 그대로 두고, 첫 번째 이미지의 따뜻한 오일 파스텔 톤과 자연스럽게 합성해 줘."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'AI 최적 색감 분석 & 합성 중...' : '🎨 AI 최적 색감 합성 실행하기'}
          </button>
        </form>

        {/* 합성 컨트롤러 (수동 미세조정 기능) */}
        {compositeDataUrl && (
          <section className="control-panel">
            <h3>🎛️ 레이어 합성 수동 미세조정</h3>
            <div className="control-grid">
              <label>
                합성 모드 (Blend Mode):
                <select value={blendMode} onChange={(e) => setBlendMode(e.target.value)}>
                  <option value="overlay">오버레이 (Overlay)</option>
                  <option value="soft-light">소프트 라이트 (Soft Light)</option>
                  <option value="multiply">곱하기 (Multiply)</option>

                  <option value="screen">스크린 (Screen)</option>
                  <option value="normal">원본 그대로 얹기 (Normal)</option>
                </select>
              </label>

              <label>
                불투명도 (Opacity): {Math.round(opacity * 100)}%
                <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} />
              </label>

              <label>
                밝기 (Brightness): {brightness}%
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} />
              </label>

              <label>
                대비 (Contrast): {contrast}%
                <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value))} />
              </label>

              <label>
                채도 (Saturation): {saturate}%
                <input type="range" min="0" max="200" value={saturate} onChange={(e) => setSaturate(parseInt(e.target.value))} />
              </label>

              <label>
                색상 회전 (Hue Rotate): {hueRotate}°
                <input type="range" min="0" max="360" value={hueRotate} onChange={(e) => setHueRotate(parseInt(e.target.value))} />
              </label>
            </div>
          </section>
        )}

        <section className="result-section">
          <h2 className="result-title">🖼️ 원본 100% 보존 그래픽 합성 결과</h2>
          
          {compositeDataUrl ? (
            <div className="generated-image-box">
              <div className="image-wrapper">
                <img src={compositeDataUrl} alt="그래픽 합성 결과" className="generated-image" />
              </div>
              <a href={compositeDataUrl} download="composite-artwork.png" className="download-btn">
                💾 완성된 고화질 합성 이미지 다운로드
              </a>
            </div>
          ) : (
            <div className="placeholder-box">
              <p>두 이미지를 업로드하면 원본 사진 손실 없이 레이어 합성 결과물이 생성됩니다.</p>
            </div>
          )}

          {resultText && (
            <div className="analysis-box">
              <h3>📝 AI 색감 분석 보고서</h3>
              <p className="analysis-content">{resultText}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}