export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { userInput } = req.body || {};
    if (!userInput) return res.status(400).json({ error: '입력값이 없습니다.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: '서버 환경 설정에 문제가 있습니다.' });

    let parsedInput = {};
    try {
      parsedInput = JSON.parse(userInput);
    } catch (e) {
      parsedInput = { requestText: userInput };
    }

    const { styleImage, characterImage, requestText } = parsedInput;

    const systemPrompt = `
[AI의 역할]
너는 이미지 레이어 합성 매칭 디자이너이다.
첫 번째 배경 스타일 이미지의 색조, 채도, 밝기, 분위기를 분석하고, 두 번째 원본 캐릭터 이미지가 이 배경과 자연스럽게 필터 합성될 수 있도록 최적의 CSS 합성 파라미터를 추천하라.

[결과 형식]
반드시 다음 JSON 형식으로만 반환하라 (마크다운 코드블록 없이 순수 JSON만 반환):
{
  "blendMode": "overlay", // "overlay", "soft-light", "multiply", "screen", "normal" 중 하나
  "opacity": 0.85, // 0.3 ~ 1.0 사이 값
  "filter": {
    "brightness": 105, // 80 ~ 130
    "contrast": 110, // 80 ~ 130
    "saturate": 120, // 50 ~ 180
    "hueRotate": 10, // 0 ~ 360
    "sepia": 15 // 0 ~ 50
  },
  "result": "1. 배경 색감 분석\n- ...\n\n2. 캐릭터 추천 합성 모드\n- ..."
}
`;

    const parts = [{ text: systemPrompt }];

    const extractBase64Data = (dataUrl) => {
      if (!dataUrl || typeof dataUrl !== 'string') return null;
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) return { mimeType: match[1], data: match[2] };
      return null;
    };

    if (styleImage) {
      const ext = extractBase64Data(styleImage);
      if (ext) parts.push({ text: "\n[1. 배경 스타일 이미지]" }, { inlineData: ext });
    }

    if (characterImage) {
      const ext = extractBase64Data(characterImage);
      if (ext) parts.push({ text: "\n[2. 원본 캐릭터 이미지]" }, { inlineData: ext });
    }

    parts.push({ text: `\n사용자 요청: ${requestText || '없음'}` });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!geminiResponse.ok) {
      return res.status(500).json({ error: 'AI 분석 요청에 실패했습니다.' });
    }

    const data = await geminiResponse.json();
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
      const jsonParsed = JSON.parse(rawText);
      return res.status(200).json(jsonParsed);
    } catch (e) {
      return res.status(200).json({
        blendMode: "overlay",
        opacity: 0.85,
        filter: { brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, sepia: 0 },
        result: rawText
      });
    }

  } catch (error) {
    console.error('Server Handler Error:', error);
    return res.status(500).json({ error: '서버 처리 오류가 발생했습니다.' });
  }
}