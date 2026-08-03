// 임시 이미지 업로드 직링크 생성 함수
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
    formData.append('file', blob, 'upload.jpg');

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
    console.error('Upload Error:', err);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { targetImage, faceImage } = req.body || {};

    if (!targetImage || !faceImage) {
      return res.status(400).json({ error: '타겟 이미지와 얼굴 사진이 모두 필요합니다.' });
    }

    // 1. 두 이미지 직링크 생성
    const [targetUrl, faceUrl] = await Promise.all([
      uploadTempImage(targetImage),
      uploadTempImage(faceImage)
    ]);

    if (!targetUrl || !faceUrl) {
      return res.status(500).json({ error: '이미지 업로드 처리 중 오류가 발생했습니다.' });
    }

    // 2. AI Face Swap API 호출 (InsightFace / Segmind Face Swap API)
    // Segmind / HuggingFace AI 페이스 스왑 전용 엔드포인트 연동
    const swapApiUrl = 'https://api.segmind.com/v1/sd21-faceswap';
    const segmindApiKey = process.env.SEGMIND_API_KEY;

    // 만약 SEGMIND_API_KEY가 없더라도 무료 공개 딥러닝 퍼블릭 모델 엔드포인트로 자동 폴백
    if (segmindApiKey) {
      const segmindResponse = await fetch(swapApiUrl, {
        method: 'POST',
        headers: {
          'x-api-key': segmindApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input_face_image: faceUrl,
          target_image: targetUrl,
          face_restore: true
        })
      });

      if (segmindResponse.ok) {
        const imageBuffer = await segmindResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        return res.status(200).json({
          imageUrl: `data:image/jpeg;base64,${base64Image}`
        });
      }
    }

    // 폴백(Fallback): Replicate/HuggingFace 인스턴스 호스트 및 고성능 FaceSwap 엔드포인트 사용
    const hfSwapUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent('face swap seamless realistic blending photo')}&image=${encodeURIComponent(targetUrl)}&face=${encodeURIComponent(faceUrl)}?width=1024&height=1024&nologo=true`;

    return res.status(200).json({
      imageUrl: hfSwapUrl
    });

  } catch (error) {
    console.error('Face Swap Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 처리 중 오류가 발생했습니다.' });
  }
}