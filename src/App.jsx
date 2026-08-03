import React, { useState } from 'react';

export default function App() {
  const [styleFiles, setStyleFiles] = useState([]);
  const [stylePreviews, setStylePreviews] = useState([]);
  const [characterFile, setCharacterFile] = useState(null);
  const [characterPreview, setCharacterPreview] = useState('');
  const [requestText, setRequestText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultText, setResultText] = useState('');

  const handleStyleImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const newFiles = [...styleFiles, ...files];
    setStyleFiles(newFiles);

    const newPreviews = [];
    let loadedCount = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        newPreviews.push(event.target.result);
        loadedCount++;
        if (loadedCount === files.length) {
          setStylePreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeStyleImage = (index) => {
    setStyleFiles((prev) => prev.filter((_, i) => i !== index));
    setStylePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCharacterImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCharacterFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCharacterPreview(event.target.result);
    };
    reader.readAsDataURL(file);
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '처리 중 오류가 발생했습니다.');
      }

      setResultText(data.result);
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
          참고 드로잉 스타일과 캐릭터 사진을 업로드하고 원하는 요청사항을 입력하여 AI 캐릭터 재해석 드로잉 결과를 생성해 보세요.
        </p>
      </header>

      <main className="main-content">
        <form onSubmit={handleSubmit} className="input-form">
          <div className="form-group">
            <label className="form-label">
              1. 드로잉 스타일 이미지 (여러 개 업로드 가능)
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
              2. 캐릭터 이미지 (1개 업로드)
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
              placeholder="예: 첫 번째 사진의 오일 파스텔 드로잉 스타일로 두 번째 캐릭터가 카페에서 책을 읽고 있는 모습을 그려줘."
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
            {loading ? 'AI 드로잉 처리 중...' : 'AI 실행하기'}
          </button>
        </form>

        <section className="status-section">
          {loading && (
            <div className="loading-box">
              <div className="spinner"></div>
              <p className="loading-text">Gemini AI가 스타일 분석 및 캐릭터 드로잉 프롬프트를 생성하고 있습니다...</p>
            </div>
          )}
        </section>

        <section className="result-section">
          <h2 className="result-title">AI 결과 영역</h2>
          
          {!loading && !resultText && (
            <div className="placeholder-box">
              <p>위 입력창에 이미지를 업로드하고 요청사항을 작성한 후 [AI 실행하기] 버튼을 누르면 결과가 이곳에 표시됩니다.</p>
            </div>
          )}

          {!loading && resultText && (
            <div className="cards-container">
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
        </section>
      </main>
    </div>
  );
}