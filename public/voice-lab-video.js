const start = document.getElementById('startVideo'), stop = document.getElementById('stopVideo'), status = document.getElementById('videoStatus');
let stream, recorder, chunks = [], metadata, timer;
const download = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
function finish() { if (recorder?.state === 'recording') recorder.stop(); }
start.onclick = async () => {
  if (!document.getElementById('unlock').hidden) { status.textContent = 'Unlock privately before starting video capture.'; return; }
  if (!navigator.mediaDevices?.getDisplayMedia || !globalThis.MediaRecorder) { status.textContent = 'Screen capture unavailable in this browser. Use an authorised local screen recorder instead.'; return; }
  start.disabled = true;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: true });
    const settings = stream.getVideoTracks()[0].getSettings();
    metadata = { started_at: new Date().toISOString(), width: settings.width, height: settings.height, frame_rate: settings.frameRate,
      audio_track: stream.getAudioTracks().length > 0, disclosure: 'Synthetic speech demonstration; unedited browser capture', physical_acceptance: 'Not inferred from video capture success' };
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6000000 }); chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); metadata.finished_at = new Date().toISOString();
      const extension = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type: recorder.mimeType }), `voice-lab-demonstration.${extension}`);
      download(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }), 'voice-lab-video-metadata.json');
      chunks = []; start.disabled = !document.getElementById('unlock').hidden; stop.disabled = true; status.textContent = metadata.capture_error ? 'Capture failed; partial video saved and marked FAILED. Not complete evidence.' : 'Capture stopped. Video and measured capture metadata downloaded locally; review before sharing.';
    };
    recorder.onerror = () => { metadata.capture_error = true; status.textContent = 'Capture failed. Do not treat this video as complete evidence.'; finish(); };
    stream.getVideoTracks()[0].onended = finish; recorder.start(1000); stop.disabled = false;
    timer = setTimeout(finish, 15 * 60 * 1000);
    status.textContent = `● CAPTURING ${settings.width}×${settings.height} · ${metadata.audio_track ? 'audio track present (verify playback in saved video)' : 'NO AUDIO TRACK — video alone will not prove audible qualification'} · stops after 15 minutes.`;
  } catch (error) { stream?.getTracks().forEach(t => t.stop()); start.disabled = false; status.textContent = `No capture started: ${error.message}`; }
};
stop.onclick = finish;
document.addEventListener('voice-lab-lock', () => { finish(); stream?.getTracks().forEach(t => t.stop()); });
window.addEventListener('pagehide', () => { clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); });
