import { HttpSpeechProvider } from './http-speech-provider.mjs';
import { VOICE_PROFILE_BY_ID } from '../voice-profiles.mjs';

export class OmniVoiceSpeechProvider extends HttpSpeechProvider {
  constructor({ baseUrl = 'http://127.0.0.1:18776', profiles = VOICE_PROFILE_BY_ID } = {}) {
    super({ id: 'omnivoice', voices: Object.keys(profiles), baseUrl, capabilities: ['speech.studio', 'speech.local', 'speech.voice-design'] });
    this.profiles = profiles;
    this.model = 'k2-fsa/OmniVoice';
  }

  async synthesize(request) {
    const voiceProfile = this.profiles[request.voice];
    if (!voiceProfile) throw new Error(`Unknown OmniVoice profile ${request.voice}`);
    return super.synthesize({
      ...request,
      voiceProfile: {
        id: voiceProfile.id,
        providerVoiceData: voiceProfile.providerVoiceData,
        generationSettings: voiceProfile.generationSettings,
      },
    });
  }
}
