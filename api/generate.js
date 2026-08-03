export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userInput } = req.body || {};

    if (!userInput || (typeof userInput === 'string' && !userInput.trim())) {
      return res.status(400).json({ error: '입력 내용이 없습니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is missing in environment variables.');
      return res.status(500).json({ error: '서버 환경 설정에 문제가 있습니다.' });
    }

    let parsedInput = {};
    let isStructured = false;

    try {
      if (typeof userInput === 'string' && userInput.startsWith('{')) {
        parsedInput = JSON.parse(userInput);
        isStructured = true;
      }
    } catch (e) {
      isStructured = false;
    }

    const styleImages = isStructured && Array.isArray(parsedInput.styleImages) ? parsedInput.styleImages : [];
    const characterImage = isStructured && parsedInput.characterImage ? parsedInput.characterImage : '';
    const userRequestText = isStructured ? (parsedInput.requestText || '') : userInput;

    const parts = [];

    const systemPrompt = `
[AI의 역할]
너는 드로잉 스타일 분석 및 최적의 이미지 생성 프롬프트(Prompt)를 설계하는 시각 디자이너이다.

[수행해야 할 일]
1. 첫 번째 이미지들의 드로잉 스타일(질감, 채색, 선 느낌, 분위기 등)과 두 번째 이미지의 캐릭터 외형(머리스타일, 얼굴, 의상 등)을 정밀 분석하라.
2. 분석 내용과 사용자의 요청사항을 종합하여, AI 이미지 생성 모델(Flux / SDXL)이 고품질 이미지를 생성할 수 있는 상세한 [영문 이미지 생성 프롬프트(English Image Generation Prompt)]를 작성하라.
3. 한국어 분석 보고서도 함께 작성하라.

[결과 형식]
반드시 다음 JSON 형식만 정확히 출력하라 (마크다운 코드블록 없이 오직 유효한 JSON만 반환):
{
  "englishPrompt": "A highly detailed English image generation prompt combining the artwork style from image 1 and character traits from image 2...",
  "analysis": "1. 드로잉 스타일 분석\n- ...\n\n2. 캐릭터 특징 분석\n- ...\n\n3. 스타일 변환 캐릭터 드로잉 상세 묘사\n- ...\n\n4. 주의사항 및 추가 안내\n- ..."
}

[사용자 입력 내용]
요청사항: ${userRequestText || '요청사항 없음'}
`;

    parts.push({ text: systemPrompt });

    const extractBase64Data = (dataUrl) => {
      if (!dataUrl || typeof dataUrl !== 'string') return null;
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], data: match[2] };
      }
      return null;
    };

    if (styleImages.length > 0) {
      parts.push({ text: "\n[첫 번째 업로드 이미지: 드로잉 스타일 참고 이미지들]" });
      styleImages.forEach((imgUrl) => {
        const extracted = extractBase64Data(imgUrl);
        if (extracted) {
          parts.push({
            inlineData: {
              mimeType: extracted.mimeType,
              data: extracted.data
            }
          });
        }
      });
    }

    if (characterImage) {
      parts.push({ text: "\n[두 번째 업로드 이미지: 캐릭터 참고 이미지]" });
      const extracted = extractBase64Data(characterImage);
      if (extracted) {
        parts.push({
          inlineData: {
            mimeType: extracted.mimeType,
            data: extracted.data
          }
        });
      }
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: parts
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error('Gemini API Error:', errorData);
      return res.status(geminiResponse.status || 500).json({
        error: 'AI 응답 생성 중 오류가 발생했습니다.'
      });
    }

    const data = await geminiResponse.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 마크다운 코드블록 제거
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let englishPrompt = 'A stylized digital artwork of a character in standard anime style';
    let analysisText = rawText;

    try {
      const jsonParsed = JSON.parse(rawText);
      if (jsonParsed.englishPrompt) englishPrompt = jsonParsed.englishPrompt;
      if (jsonParsed.analysis) analysisText = jsonParsed.analysis;
    } catch (e) {
      console.log('JSON 파싱 실패, 기본 텍스트 반환으로 대체합니다.');
    }

    // Flux AI 모델 기반 실시간 이미지 생성 URL 생성 (Pollinations AI 사용 - 무료 및 별도 API 키 불필요)
    const randomSeed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(englishPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&model=flux&nologo=true`;

    return res.status(200).json({ 
      result: analysisText,
      imageUrl: imageUrl 
    });

  } catch (error) {
    console.error('Server Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 처리 중 오류가 발생했습니다.' });
  }
}