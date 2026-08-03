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
너는 드로잉 스타일 분석 및 캐릭터 재해석 전문 AI 디자이너이다.

[수행해야 할 일]
1. 사용자가 전달한 첫 번째 사진들의 드로잉 스타일(선 느낌, 채색 스타일, 빛과 질감, 색감 등)을 정밀 분석하라.
2. 사용자가 전달한 두 번째 사진의 캐릭터 외형(헤어스타일, 의상, 표정, 포즈 등)과 특징을 분석하라.
3. 사용자의 요청사항을 반영하여, 첫 번째 스타일로 두 번째 캐릭터를 완벽히 재해석한 드로잉 결과물 상세 묘사 및 이미지 프롬프트를 작성하라.

[응답 기준]
- 첫 번째 이미지들의 드로잉 스타일 분석
- 두 번째 이미지의 캐릭터 특징 분석
- 요청사항을 반영하여 첫 번째 스타일로 두 번째 캐릭터를 드로잉하는 상세 묘사 작성
- 정보가 부족하거나 정확하게 판단하기 어려운 경우에는 내용을 임의로 만들어내지 말고 반드시 정확히 다음 문장만 답변하라:
  "정확한 결과를 위해 정보를 조금 더 입력해 주세요."
- 앱의 목적(드로잉 스타일 변환 및 캐릭터 드로잉)과 관계없는 내용이 입력된 경우 잘못된 결과를 만들지 말고, 다음과 같이 입력 예시를 안내하라:
  "드로잉 스타일 참고 사진과 캐릭터 사진, 그리고 요청사항을 입력해 주세요. 예시: 첫 번째 스타일로 캐릭터가 책을 읽는 모습을 그려줘."

[답변 분량 및 창의성 설정]
- temperature: 0.7
- 각 항목당 2~3문장 내외로 명확히 작성하라.

[결과 형식]
반드시 다음 순서와 항목 번호, 제목을 변경하지 말고 동일하게 작성하라:

1. 드로잉 스타일 분석
2. 캐릭터 특징 분석
3. 스타일 변환 캐릭터 드로잉 상세 묘사
4. 주의사항 및 추가 안내

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
          maxOutputTokens: 1200
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
    const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return res.status(500).json({ error: 'AI 응답 결과가 비어 있습니다.' });
    }

    return res.status(200).json({ result: generatedText });
  } catch (error) {
    console.error('Server Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 처리 중 오류가 발생했습니다.' });
  }
}