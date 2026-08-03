// 캐릭터 이미지를 tmpfiles.org에 임시 업로드하여 직링크(Direct URL) 생성 함수
async function uploadTempImage(base64DataUrl) {
  if (!base64DataUrl || typeof base64DataUrl !== 'string') return null;
  
  try {
    const matches = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, 'character.jpg');

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data?.data?.url) {
      // tmpfiles.org의 페이지 URL을 직링크(/dl/) URL로 전환
      return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    }
  } catch (err) {
    console.error('Temp Upload Exception:', err);
  }
  return null;
}

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

    // Img2Img 전용 시스템 프롬프트: 원본 캐릭터 구조를 보존하도록 지시
    const systemPrompt = `
[AI의 역할]
너는 원본 캐릭터 사진의 구도, 포즈, 얼굴 이목구비 형태를 엄격히 보존하면서 드로잉 스타일을 자연스럽게 입히는 Img2Img 프롬프트 전문가이다.

[수행해야 할 일]
1. 두 번째 원본 캐릭터 이미지의 얼굴형, 머리스타일, 이목구비, 포즈, 구도를 정밀히 분석하라.
2. 첫 번째 드로잉 스타일 이미지의 색감, 질감, 선 느낌, 채색 기법을 분석하라.
3. 캐릭터의 원본 형태와 얼굴 구조를 100% 보존하면서 스타일만 덮어씌울 수 있도록, 핵심 형태 묘사어와 스타일 적용 텍스트를 포함한 영문 프롬프트(English Prompt)를 작성하라.

[결과 형식]
반드시 다음 JSON 형식만 출력하라 (마크다운 코드블록 없이 오직 순수 JSON만 반환):
{
  "englishPrompt": "Apply artistic drawing style to the base image, preserving the exact face shape, eyes, hair, pose, and composition of the character...",
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
      parts.push({ text: "\n[두 번째 업로드 이미지: 캐릭터 원본 참고 이미지]" });
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
          temperature: 0.5,
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

    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let englishPrompt = 'Apply drawing style while preserving original character face and pose structure';
    let analysisText = rawText;

    try {
      const jsonParsed = JSON.parse(rawText);
      if (jsonParsed.englishPrompt) englishPrompt = jsonParsed.englishPrompt;
      if (jsonParsed.analysis) analysisText = jsonParsed.analysis;
    } catch (e) {
      console.log('JSON 파싱 예외 처리:', e);
    }

    // 캐릭터 원본 이미지를 Img2Img 입력용 직링크 URL로 변환
    let characterDirectUrl = null;
    if (characterImage) {
      characterDirectUrl = await uploadTempImage(characterImage);
    }

    const randomSeed = Math.floor(Math.random() * 1000000);
    const encodedPrompt = encodeURIComponent(englishPrompt);

    // Img2Img 파라미터 적용: characterDirectUrl이 있을 경우 ?image= 파라미터에 원본 이미지 URL 전달
    let imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&model=flux&nologo=true`;
    if (characterDirectUrl) {
      imageUrl += `&image=${encodeURIComponent(characterDirectUrl)}`;
    }

    return res.status(200).json({ 
      result: analysisText,
      imageUrl: imageUrl 
    });

  } catch (error) {
    console.error('Server Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 처리 중 오류가 발생했습니다.' });
  }
}