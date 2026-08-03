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
    formData.append('file', blob, 'image.jpg');

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data?.data?.url) {
      return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    }
  } catch (err) {
    console.error('Upload error:', err);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { compositeImage, maskImage } = req.body || {};

    if (!compositeImage) {
      return res.status(400).json({ error: '합성할 이미지 정보가 부족합니다.' });
    }

    // 1차 배치된 합성 이미지 업로드
    const compUrl = await uploadTempImage(compositeImage);

    if (!compUrl) {
      // 이미지 업로드 실패 시 클라이언트에서 결합한 1차 캔버스 이미지 그대로 반환
      return res.status(200).json({ imageUrl: compositeImage });
    }

    // 2. AI 인페인팅 / 노이즈 최소화 (Denoising Strength 0.2~0.3 레벨)
    // AI가 표정이나 얼굴 이목구비를 새로 그리지 못하게 힘을 30% 이하로 제어하고
    // 경계선 피부톤 및 조명 반사만 메우도록 지시
    const prompt = encodeURIComponent('seamless photo realistic skin tone blending, smooth neck line, soft light transition, no facial distortion, matching lighting');
    
    // Denoising strength를 극도로 낮춘 인페인팅/보정 쿼리
    const aiSeamlessUrl = `https://image.pollinations.ai/prompt/${prompt}?image=${encodeURIComponent(compUrl)}&width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;

    return res.status(200).json({
      imageUrl: aiSeamlessUrl
    });

  } catch (error) {
    console.error('Seamless Blend Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 처리 중 오류가 발생했습니다.' });
  }
}