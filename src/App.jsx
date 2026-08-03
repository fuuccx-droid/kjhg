import React, { useState } from 'react';

const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
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
  const [styleFiles, setStyleFiles] = useState([]);
  const [stylePreviews, setStylePreviews] = useState([]);
  const [characterFile, setCharacterFile] = useState(null);
  const [characterPreview, setCharacterPreview] = useState('');
  const [requestText, setRequestText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultText, setResultText] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');

  const handleStyleImagesChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    try {
      const compressedPreviews = await Promise.all(
        files.map((file) => compressImage(file, 800, 800, 0.7))
      );
      setStyleFiles((prev) => [...prev, ...files]);
      setStylePreviews((prev) => [...prev, ...compressedPreviews]);
    } catch (err) {
      setError('이미지를 처리하는 중 오류가 발생했습니다.');
    }
  };

  const removeStyleImage = (index) => {
    setStyleFiles((prev) => prev.filter((_, i) => i !== index));
    setStylePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCharacterImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const compressedPreview = await compressImage(file, 800, 800, 0.7);
      setCharacterFile(file);
      setCharacterPreview(compressedPreview);
    } catch (err) {
      setError('이미지를 처리하는 중 오류가 발생했습니다.');
    }
  };

  const removeCharacterImage = () => {
    setCharacterFile(null);
    setCharacterPreview('');
  };

  const parseResultToCards = (text) => {
    if (!text) return [];

    const sectionRegex = /(?:^|\n)(?:[1-4]\.\s*|\*\*[1-4]\.\s*\*?)([^\n]+)\n([\s\S]*?)(?=(?:\n(?:[1-4]\.\s*|\*\*[1-4]\.\s*\*?)|$))/g;
    const cards = [];
    let match;

    while ((match = sectionRegex.exec(text)) !== null) {
      const title = match[1].replace(/\*\*/g, '').trim();
      const content = match[2].trim();
      if (title || content) {
        cards.push({ title, content });
      }
    }

    if (cards.length === 0) {
      const fallbackParagraphs = text.split('\n\n').filter((p) => p.trim().length > 0);
      return fallbackParagraphs.map((p, idx) => ({
        title: `결과 항목 ${idx + 1}`,
        content: p.trim()
      }));
    }

    return cards;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (stylePreviews.length === 0 && !characterPreview && !requestText.trim()) {
      setError('정확한 결과를 위해 정보를 조금 더 입력해 주세요.');
      return;
    }

    if (!requestText.trim()) {
      setError('요청 내용을 입력해 주세요.');
      return;
    }

    setLoading(true);
    setResultText('');
    setGeneratedImageUrl('');

    try {
      const payloadData = {
        styleImages: stylePreviews,
        characterImage: characterPreview,
        requestText: requestText
      };

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userInput: JSON.stringify(payloadData)
        })
      });

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        if (response.status === 413) {
          throw new Error('전송된 이미지 용량이 너무 큽니다. 스타일 이미지 개수를 줄여주세요.');
        }
        throw new Error('서버에서 올바르지 않은 응답이 반환되었습니다.');
      }

      if (!response.ok) {
        throw new Error(data.error || '처리 중 오류가 발생했습니다.');
      }

      setResultText(data.result);
      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
      }
    } catch (err) {
      setError(err.message || '서버와 통신하는 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const parsedCards = parseResultToCards(resultText);

  return (
    <div className="container">
      <header className="header">
        <h1 className="app-title">AIMAGE</h1>
        <p className="app-subtitle">
          캐릭터의 형태와 얼굴 구조를 고정한 상태에서 드로잉 스타일을 자연스럽게 덮어씌우는 Img2Img AI 변환기입니다.
        </p>
      </header>

      <main className="main-content">
        <form onSubmit={handleSubmit} className="input-form">
          <div className="form-group">
            <label className="form-label">
              1. 입힐 드로잉 스타일 이미지 (여러 개 업로드 가능)
            </label>
            <div className="file-upload-box">
              <input
                type="file"
                accept="image/*"
                multiple
                id="style-upload"
                onChange={handleStyleImagesChange}
                className="file-input"
              />
              <label htmlFor="style-upload" className="upload-button">
                📷 스타일 사진 선택하기
              </label>
            </div>
            {stylePreviews.length > 0 && (
              <div className="image-grid">
                {stylePreviews.map((src, idx) => (
                  <div key={idx} className="preview-card">
                    <img src={src} alt={`스타일 이미지 ${idx + 1}`} className="preview-img" />
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeStyleImage(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              2. 원본 유지 캐릭터 이미지 (1개 필수)
            </label>
            <div className="file-upload-box">
              <input
                type="file"
                accept="image/*"
                id="character-upload"
                onChange={handleCharacterImageChange}
                className="file-input"
              />
              <label htmlFor="character-upload" className="upload-button">
                👤 캐릭터 사진 선택하기
              </label>
            </div>
            {characterPreview && (
              <div className="single-preview">
                <div className="preview-card">
                  <img src={characterPreview} alt="캐릭터 이미지" className="preview-img" />
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={removeCharacterImage}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="request-text">
              3. 요청 내용
            </label>
            <textarea
              id="request-text"
              className="text-input"
              rows="4"
              placeholder="예: 첫 번째 사진의 수채화 스타일 느낌으로 두 번째 캐릭터 사진의 얼굴과 구도를 그대로 유지하면서 합성해 줘."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? '원본 구조 유지하며 스타일 합성 중...' : 'AI 합성 실행하기'}
          </button>
        </form>

        <section className="status-section">
          {loading && (
            <div className="loading-box">
              <div className="spinner"></div>
              <p className="loading-text">Gemini가 원본 구도를 템플릿화하고 Img2Img AI가 캐릭터 형태에 스타일을 합성 중입니다...</p>
            </div>
          )}
        </section>

        <section className="result-section">
          <h2 className="result-title">AI 결과 영역</h2>
          
          {!loading && !resultText && (
            <div className="placeholder-box">
              <p>위 입력창에 이미지를 업로드하고 요청사항을 작성한 후 [AI 합성 실행하기] 버튼을 누르면 결과가 이곳에 표시됩니다.</p>
            </div>
          )}

          {!loading && (generatedImageUrl || resultText) && (
            <div className="result-container">
              {generatedImageUrl && (
                <div className="generated-image-box">
                  <h3 className="generated-image-title">🖼️ 원본 구조 유지 Img2Img 합성 결과</h3>
                  <div className="image-wrapper">
                    <img src={generatedImageUrl} alt="AI Img2Img 합성 이미지" className="generated-image" />
                  </div>
                  <a href={generatedImageUrl} target="_blank" rel="noopener noreferrer" className="download-btn">
                    🔍 고화질 원본 이미지 보기 / 다운로드
                  </a>
                </div>
              )}

              {parsedCards.length > 0 && (
                <div className="cards-container">
                  <h3 className="analysis-section-title">📝 AI 상세 분석 보고서</h3>
                  {parsedCards.map((card, idx) => (
                    <div key={idx} className="result-card">
                      <div className="card-header">
                        <span className="card-badge">{idx + 1}</span>
                        <h3 className="card-title">{card.title}</h3>
                      </div>
                      <p className="card-body">{card.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}