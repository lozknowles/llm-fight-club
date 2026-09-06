const router = process.env.SPEECH_ROUTER || 'http://127.0.0.1:18777';
const response = await fetch(`${router}/synthesize`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'Fallback remains audible.', voice: 'omnivoice-moderator', profile: 'OMNIVOICE' }),
});
const bytes = Buffer.from(await response.arrayBuffer());
const result = {
  status: response.status,
  provider: response.headers.get('x-tts-provider'),
  fallback: response.headers.get('x-tts-fallback'),
  contentType: response.headers.get('content-type'),
  bytes: bytes.length,
};
console.log(JSON.stringify(result));
if (!response.ok || result.provider !== 'ffmpeg-flite' || result.fallback !== 'true' || bytes.length < 44) process.exitCode = 1;
