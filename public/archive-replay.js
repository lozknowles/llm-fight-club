// Playback only: this controller never calls conversation or speech generation APIs.
export class ArchiveReplay {
  constructor(player, {url, onState = () => {}}) {
    this.player = player; this.url = url; this.onState = onState;
    this.turns = []; this.index = -1; this.continuous = false; this.revision = 0;
    player.onended = () => {
      if (this.continuous && this.index + 1 < this.turns.length) this.play(this.index + 1, true);
      else { this.continuous = false; this.emit('Finished'); }
    };
    player.onerror = () => { this.continuous = false; this.emit('Saved audio could not be loaded. Retry this turn or skip it.'); };
    player.onplay = () => this.emit('Playing');
    player.onpause = () => { if (!player.ended) this.emit('Paused'); };
  }
  setConversation(conversation) {
    if (this.id !== conversation.id) { this.stop(); this.id = conversation.id; }
    this.turns = conversation.transcript.filter(t => t.audio_file);
  }
  emit(state) { this.onState({state, index:this.index, count:this.turns.length, turn:this.turns[this.index]}); }
  async play(index = 0, continuous = false) {
    if (!this.turns[index]) return;
    this.player.pause(); const revision = ++this.revision;
    this.index = index; this.continuous = continuous;
    this.player.src = this.url(this.id, this.turns[index].turn_id);
    this.emit('Loading saved audio');
    try { await this.player.play(); }
    catch { if (revision === this.revision) this.emit('Press play to resume saved audio.'); }
  }
  skip() {
    if (this.index + 1 < this.turns.length) return this.play(this.index + 1, this.continuous);
    this.stop(); this.emit('Finished');
  }
  stop() {
    this.revision++; this.continuous = false; this.player.pause();
    this.player.removeAttribute('src'); this.player.load(); this.index = -1; this.emit('Stopped');
  }
}
