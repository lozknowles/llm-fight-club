// Presentation-only activity. Unknown next speakers are never guessed.
export function speakerActivity({participants=[],state,phase='idle',speakerId,audible=false,elapsed=0}) {
  const ended=['COMPLETED','STOPPED'].includes(state);
  let heading=ended?'Conversation finished':state==='PAUSED'?'Conversation paused':phase==='response'?'Preparing next response':phase==='error'?'Playback needs attention':'Ready';
  if(audible)heading='Speaking now';
  else if(!ended && state!=='PAUSED' && phase==='voice')heading='Preparing voice';
  return {heading,elapsed:(!audible && ['response','voice'].includes(phase) && !ended && state!=='PAUSED')?`${Math.max(0,Math.floor(elapsed))}s`:'',
    speakers:participants.map(p=>{
      const selected=p.id===speakerId;
      const activity=audible?(selected?'speaking':'listening'):state==='PAUSED'?'paused':ended?'finished':phase==='error'?(selected?'error':'waiting'):phase==='voice'?(selected?'preparing':'listening'):'waiting';
      return {id:p.id,name:p.name,role:p.role,activity,label:{speaking:'Talking',listening:'Listening',paused:'Paused',finished:'Finished',error:'Needs attention',preparing:'Preparing voice',waiting:phase==='response'?'Waiting for response':'Ready'}[activity]};
    })};
}

const face = i => `<svg class="speaker-head" viewBox="0 0 80 80" aria-hidden="true">
  <path class="headset" d="M11 43V34a29 29 0 0 1 58 0v9"/>
  <rect class="face" x="19" y="17" width="42" height="51" rx="${i%2?14:21}"/>
  <path class="brow" d="${i%2?'M27 32l8-2m10 0l8 2':'M27 30h8m10 0h8'}"/>
  <g class="eyes"><circle cx="31" cy="38" r="3"/><circle cx="49" cy="38" r="3"/></g>
  <rect class="mouth" x="32" y="53" width="16" height="4" rx="2"/>
  <rect class="ear" x="7" y="35" width="10" height="19" rx="4"/><rect class="ear" x="63" y="35" width="10" height="19" rx="4"/>
  <path class="headset" d="M68 51v9H54"/><circle class="ear" cx="53" cy="60" r="3"/>
</svg>`;

export class SpeakerStage {
  constructor(root){this.root=root;this.key='';}
  render(input){
    const view=speakerActivity(input),key=JSON.stringify(input.participants?.map(p=>[p.id,p.name,p.role]));
    this.root.hidden=!view.speakers.length;
    if(this.key!==key){
      this.key=key;this.root.replaceChildren();
      for(const [i,s] of view.speakers.entries()){
        const card=document.createElement('div');card.className=`speaker-card speaker-colour-${i%3}`;
        card.innerHTML=face(i)+'<div class="speaker-info"><strong></strong><small></small><span class="speaker-state"></span></div><span class="speaker-dots" aria-hidden="true">•••</span>';
        card.querySelector('strong').textContent=s.name;card.querySelector('small').textContent=s.role;
        this.root.append(card);
      }
    }
    view.speakers.forEach((s,i)=>{
      const card=this.root.children[i];
      if(card.dataset.activity!==s.activity)card.dataset.activity=s.activity;
      if(card.querySelector('.speaker-state').textContent!==s.label)card.querySelector('.speaker-state').textContent=s.label;
    });
    return view;
  }
}
