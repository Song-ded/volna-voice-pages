import {joinRoom} from './trystero.js';
const $=id=>document.getElementById(id), peers=new Map();
let room,stream,profile,chat,screenEvents,screenStream,cameraStream,muted=false,deaf=false,context,animation,joining=false,session=0,noise=true;
const seenMessages=new Set();
const screens=new Map(),stoppedScreens=new Set();
const status=t=>$('status').textContent=t;
function updateViewOverlays(){
 for(const view of screens.values()){
 if(view.kind!=='camera')continue;
 view.chatPreview.replaceChildren(...Array.from($('messages').children||[]).slice(-3).map(n=>n.cloneNode(true)));
 const local=view.peerId!=='self'?cameraStream:null;view.selfPreview.hidden=!local;
 if(view.selfPreview.srcObject!==local){view.selfPreview.srcObject=local;if(local)view.selfPreview.play().catch(()=>{})}
 }
}
const validCode=s=>/^[a-zA-Z0-9_-]{6,64}$/.test(s);
const hash=location.hash.slice(1);if(validCode(hash)){$('code').value=hash;$('join').textContent='Войти'}
$('name').value=localStorage.getItem('volna-name')||'';
function card(id,name,self=false){
 const node=document.createElement('div');node.className='person';
 const avatar=document.createElement('div');avatar.className='avatar';avatar.textContent=name.slice(0,1).toUpperCase();
 const title=document.createElement('strong');title.textContent=name+(self?' · ты':'');
 const detail=document.createElement('small');detail.textContent=self?'Микрофон готов':'Соединение установлено';
 node.append(avatar,title,detail);
 const entry={node,title,detail,audio:null};
 if(!self){const volume=document.createElement('input');volume.type='range';volume.min=0;volume.max=1;volume.step=.05;volume.value=1;volume.setAttribute('aria-label','Громкость '+name);volume.oninput=()=>{if(entry.audio)entry.audio.volume=+volume.value};entry.volume=volume;node.append(volume)}
 else{const meter=document.createElement('div');meter.className='meter';const bar=document.createElement('i');meter.append(bar);node.append(meter);entry.bar=bar}
 $('people').append(node);peers.set(id,entry);return entry;
}
function announce(){profile?.send({name:$('name').value.trim()||'Гость',muted}).catch(()=>{});}
function updateCount(){status(peers.size===1?'Ждём остальных':'Участников: '+peers.size);}
function removeScreen(id,streamId){
 const item=screens.get(id);if(!item||(streamId&&item.streamId!==streamId))return;
 item.video.pause();item.video.srcObject=null;if(item.selfPreview){item.selfPreview.pause();item.selfPreview.srcObject=null}item.node.remove();if(item.kind==='camera')peers.get(item.peerId)?.node.classList.remove('has-camera');screens.delete(id);
 $('screens').hidden=![...screens.values()].some(s=>s.kind==='screen');$('cameras').hidden=![...screens.values()].some(s=>s.kind==='camera');document.body.classList.toggle('presenting',screens.size>0);
}
function showScreen(remote,id,kind='screen'){
 if(stoppedScreens.has(id+':'+remote.id))return;
 const key=kind==='camera'?id+':camera':id;removeScreen(key);
 const node=document.createElement('section');node.className='screen '+kind;
 const heading=document.createElement('div');heading.className='screen-heading';
 const title=document.createElement('span');title.textContent=(id==='self'?'Ты':peers.get(id)?.title.textContent||'Участник')+(kind==='screen'?' · экран':'');
 const full=document.createElement('button');full.className='secondary';full.textContent='Развернуть';
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.srcObject=remote;
 full.onclick=async()=>{try{if(document.fullscreenElement===node)await document.exitFullscreen();else if(node.requestFullscreen)await node.requestFullscreen();else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();else status('Полный экран недоступен')}catch{status('Не удалось развернуть экран')}};
 node.addEventListener('fullscreenchange',()=>{full.textContent=document.fullscreenElement===node?'Свернуть':'Развернуть'});
 heading.append(title,full);node.append(heading,video);
 if(kind==='camera'){const person=peers.get(id)||card(id,'Участник');person.node.append(node);person.node.classList.add('has-camera');full.textContent='⛶';full.setAttribute('aria-label','Развернуть камеру')}
 else{$('screens').append(node);$('screens').hidden=false}
 const view={node,video,title,kind,peerId:id,streamId:remote.id};
 if(kind==='camera'){
 const overlay=document.createElement('div');overlay.className='camera-overlay';
 view.chatPreview=document.createElement('div');view.chatPreview.className='camera-chat';view.chatPreview.setAttribute('aria-label','Последние сообщения');
 view.selfPreview=document.createElement('video');view.selfPreview.className='self-preview';view.selfPreview.autoplay=true;view.selfPreview.muted=true;view.selfPreview.playsInline=true;view.selfPreview.setAttribute('aria-label','Твоя камера');
 overlay.append(view.chatPreview,view.selfPreview);node.append(overlay);
 }
 screens.set(key,view);updateViewOverlays();document.body.classList.add('presenting');
 video.play().catch(()=>{$('resume').hidden=false});
 remote.addEventListener('inactive',()=>removeScreen(key,remote.id),{once:true});
 remote.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>removeScreen(key,remote.id),{once:true}));
}
function addMessage(data,peerId,self=false){
 if(!data||typeof data.id!=='string'||data.id.length>64||typeof data.text!=='string'||!data.text.trim()||data.text.length>2000)return;
 const key=peerId+':'+data.id;if(seenMessages.has(key))return;seenMessages.add(key);if(seenMessages.size>500)seenMessages.delete(seenMessages.values().next().value);
 const log=$('messages'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
 const node=document.createElement('div');node.className='message'+(self?' own':'');
 const author=document.createElement('strong');author.textContent=self?'Ты':peers.get(peerId)?.title.textContent||'Участник';
 const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const text=document.createElement('p');text.textContent=data.text;node.append(author,time,text);log.append(node);
 if(log.childElementCount>200)log.firstElementChild.remove();if(self||nearBottom)log.scrollTop=log.scrollHeight;
 updateViewOverlays();
}
$('chatForm').onsubmit=async event=>{
 event.preventDefault();const text=$('message').value.trim();if(!room||!chat||!text||text.length>2000||$('send').disabled)return;
 const currentSession=session,data={id:crypto.randomUUID(),text};$('send').disabled=true;
 try{await chat.send(data);if(currentSession!==session)return;addMessage(data,'self',true);$('message').value='';$('message').focus()}
 catch{if(currentSession===session)status('Сообщение не отправлено. Попробуй ещё раз.')}
 finally{if(currentSession===session)$('send').disabled=false}
};
async function stopCamera(){
 const old=cameraStream;if(!old)return;cameraStream=null;old.getTracks().forEach(t=>t.stop());removeScreen('self:camera');updateViewOverlays();
 $('camera').textContent='Камера: выкл';$('camera').setAttribute('aria-pressed','false');
 try{await screenEvents?.send({stopped:old.id})}catch{}
 try{await room?.removeStream(old)}catch{}
}
let cameraPreview, cameraChoiceVersion=0, cameraPickerSession;
function clearCameraPreview(){cameraPreview?.getTracks().forEach(t=>t.stop());cameraPreview=null;$('cameraPreview').srcObject=null}
function closeCameraPicker(){cameraChoiceVersion++;clearCameraPreview();if($('cameraDialog').open)$('cameraDialog').close()}
async function previewCamera(){
 const version=++cameraChoiceVersion;clearCameraPreview();$('cameraConfirm').disabled=true;$('cameraNote').textContent='Подключаю камеру…';
 const choice=$('cameraChoice').value;
 try{
 const video=choice==='front'?{facingMode:{ideal:'user'}}:choice==='back'?{facingMode:{exact:'environment'}}:{deviceId:{exact:choice}};
 const captured=await navigator.mediaDevices.getUserMedia({audio:false,video:{...video,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}});
 if(version!==cameraChoiceVersion||session!==cameraPickerSession||!$('cameraDialog').open){captured.getTracks().forEach(t=>t.stop());return}
 cameraPreview=captured;$('cameraPreview').srcObject=captured;await $('cameraPreview').play().catch(()=>{});$('cameraNote').textContent='';$('cameraConfirm').disabled=false;
 const devices=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);if(version!==cameraChoiceVersion)return;
 for(const device of devices.filter(d=>d.kind==='videoinput')){if(Array.from($('cameraChoice').options).some(o=>o.value===device.deviceId))continue;const option=document.createElement('option');option.value=device.deviceId;option.textContent=device.label||'Камера '+($('cameraChoice').options.length-1);$('cameraChoice').append(option)}
 }catch(e){if(version===cameraChoiceVersion)$('cameraNote').textContent=e.name==='NotAllowedError'?'Разреши доступ к камере':choice==='back'?'Задняя камера недоступна. Выбери другую.':'Камера недоступна. Выбери другую.'}
}
$('cameraChoice').onchange=()=>void previewCamera();
$('cameraCancel').onclick=closeCameraPicker;
$('cameraDialog').addEventListener('cancel',closeCameraPicker);
$('cameraDialog').addEventListener('close',()=>{cameraChoiceVersion++;clearCameraPreview()});
$('cameraConfirm').onclick=()=>{
 if(!cameraPreview||!room||session!==cameraPickerSession)return;
 const captured=cameraPreview;cameraPreview=null;cameraChoiceVersion++;$('cameraPreview').srcObject=null;$('cameraDialog').close();
 cameraStream=captured;captured.getVideoTracks()[0].addEventListener('ended',()=>{if(cameraStream===captured)void stopCamera()},{once:true});
 showScreen(captured,'self','camera');room.addStream(captured,{metadata:{kind:'camera'}});$('camera').textContent='Камера: вкл';$('camera').setAttribute('aria-pressed','true');
};
$('camera').onclick=async()=>{
 if(cameraStream){await stopCamera();return}if(!room)return;
 cameraPickerSession=session;$('cameraChoice').value='front';$('cameraDialog').showModal();void previewCamera();
};
$('noise').onclick=async()=>{
 const track=stream?.getAudioTracks()[0];if(!track)return;
 const currentSession=session,next=!noise;$('noise').disabled=true;
 try{await track.applyConstraints({noiseSuppression:{exact:next}});if(session!==currentSession)return;const actual=track.getSettings().noiseSuppression;if(typeof actual!=='boolean'||actual!==next)throw Error();noise=actual;$('noise').textContent='Шумодав: '+(noise?'вкл':'выкл');$('noise').setAttribute('aria-pressed',String(noise))}
 catch{if(session===currentSession)status('Браузер не позволяет переключить шумодав')}
 finally{if(session===currentSession)$('noise').disabled=false}
};
async function stopScreen(){
 const old=screenStream;if(!old)return;screenStream=null;
 old.getTracks().forEach(t=>t.stop());removeScreen('self');
 $('screenShare').textContent='Показать экран';$('screenShare').setAttribute('aria-pressed','false');
 try{await screenEvents?.send({stopped:old.id})}catch{}
 try{await room?.removeStream(old)}catch{}
 if(room)updateCount();
}
async function sendScreen(target){
 if(!room||!screenStream)return;
 const activeRoom=room,activeStream=screenStream;
 try{
 await Promise.all([].concat(activeRoom.addStream(activeStream,{...(target?{target}:{}),metadata:{kind:'screen'}})));
 for(const connection of Object.values(activeRoom.getPeers())){
 for(const sender of connection.getSenders()){
 if(sender.track?.id!==activeStream.getVideoTracks()[0].id)continue;
 const params=sender.getParameters();params.degradationPreference='maintain-framerate';
 for(const encoding of params.encodings||[])encoding.maxFramerate=60;
 await sender.setParameters(params).catch(()=>{});
 }
 }
 }catch{if(room===activeRoom)status('Не удалось передать экран. Перезапусти показ.')}
}
$('screenShare').onclick=async()=>{
 if(screenStream){await stopScreen();return}
 if(!room)return;
 if(!navigator.mediaDevices?.getDisplayMedia){status('Показ экрана доступен в Chrome, Edge или Firefox на компьютере');return}
 const currentRoom=room,currentSession=session;$('screenShare').disabled=true;
 try{
 const captured=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:60,max:60}},audio:false});
 if(room!==currentRoom||session!==currentSession){captured.getTracks().forEach(t=>t.stop());return}
 screenStream=captured;const track=captured.getVideoTracks()[0];track.contentHint='motion';
 track.addEventListener('ended',()=>{if(screenStream===captured)void stopScreen()},{once:true});
 showScreen(captured,'self');void sendScreen();
 $('screenShare').textContent='Остановить показ';$('screenShare').setAttribute('aria-pressed','true');status('Экран показывается');
 }catch(e){await stopScreen();status(e.name==='NotAllowedError'?'Показ отменён':e.name==='NotReadableError'?'Не удалось захватить экран. Выбери другое окно.':'Не удалось запустить показ экрана')}
 finally{$('screenShare').disabled=false}
};
async function cleanup(){
 session++;closeCameraPicker();
 chat=null;seenMessages.clear();$('messages').replaceChildren();$('message').value='';$('send').disabled=false;
 await stopCamera();
 await stopScreen();for(const id of [...screens.keys()])removeScreen(id);stoppedScreens.clear();screenEvents=null;
 cancelAnimationFrame(animation);stream?.getTracks().forEach(t=>t.stop());stream=null;
 if(context){await context.close().catch(()=>{});context=null}
 const old=room;room=null;profile=null;await old?.leave().catch(()=>{});
 peers.forEach(p=>{p.audio?.pause();if(p.audio)p.audio.srcObject=null;p.node.remove()});peers.clear();
 $('call').hidden=true;$('lobby').hidden=false;$('resume').hidden=true;muted=false;deaf=false;$('mute').setAttribute('aria-pressed','false');$('deafen').setAttribute('aria-pressed','false');
 $('mute').textContent='Микрофон: вкл';$('deafen').textContent='Звук: вкл';
 $('noise').disabled=false;
}
$('join').onclick=async()=>{
 if(joining||room)return;joining=true;$('join').disabled=true;
 try{
 let code=$('code').value.trim();if(code&&!validCode(code))throw Error('Код: 6–64 латинских букв, цифр, _ или -.');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Открой сайт через HTTPS в современном браузере.');
 status('Доступ к микрофону…');
 stream=await navigator.mediaDevices.getUserMedia({audio:{noiseSuppression:true,echoCancellation:true,autoGainControl:true,channelCount:1},video:false});
 const noiseSetting=stream.getAudioTracks()[0].getSettings().noiseSuppression;noise=noiseSetting===true;$('noise').textContent=typeof noiseSetting==='boolean'?'Шумодав: '+(noise?'вкл':'выкл'):'Шумодав недоступен';$('noise').disabled=typeof noiseSetting!=='boolean';$('noise').setAttribute('aria-pressed',String(noise));
 code=code||crypto.randomUUID().replaceAll('-','').slice(0,20);$('code').value=code;location.hash=code;
 localStorage.setItem('volna-name',$('name').value.trim());
 room=joinRoom({appId:'volna-voice-aloha-1014'},code);
 profile=room.makeAction('profile');
 chat=room.makeAction('chat');chat.onMessage=(data,{peerId})=>addMessage(data,peerId);
 screenEvents=room.makeAction('screen');
 screenEvents.onMessage=(data,{peerId})=>{if(typeof data?.stopped==='string'&&data.stopped.length<128){stoppedScreens.add(peerId+':'+data.stopped);removeScreen(peerId,data.stopped);removeScreen(peerId+':camera',data.stopped)}};
 profile.onMessage=(data,{peerId})=>{const p=peers.get(peerId);if(p&&typeof data?.name==='string'){p.title.textContent=data.name.slice(0,32);p.detail.textContent=data.muted?'Микрофон: выкл':'Микрофон: вкл';const view=screens.get(peerId);if(view)view.title.textContent=data.name.slice(0,32)+' · экран';const cameraView=screens.get(peerId+':camera');if(cameraView)cameraView.title.textContent=data.name.slice(0,32)}};
 room.onPeerJoin=id=>{if(!room)return;card(id,'Участник');room.addStream(stream,{target:id});if(screenStream)void sendScreen(id);if(cameraStream)room.addStream(cameraStream,{target:id,metadata:{kind:'camera'}});announce();updateCount()};
 room.onPeerLeave=id=>{removeScreen(id);removeScreen(id+':camera');const p=peers.get(id);p?.audio?.pause();p?.node.remove();peers.delete(id);updateCount()};
 room.onPeerStream=(remote,id,metadata)=>{if(remote.getVideoTracks().length){showScreen(remote,id,metadata?.kind==='camera'?'camera':'screen');return}const p=peers.get(id)||card(id,'Участник');p.audio?.pause();const a=new Audio();a.autoplay=true;a.srcObject=remote;a.muted=deaf;a.volume=+p.volume.value;p.audio=a;a.play().catch(()=>{$('resume').hidden=false;status('Нажми «Включить звук».')});announce()};
 const self=card('self',$('name').value.trim()||'Гость',true);
 self.detail.textContent='Микрофон: вкл';$('join').textContent='Войти';
 $('roomTitle').textContent='Комната';$('call').hidden=false;$('lobby').hidden=true;updateCount();
 try{context=new AudioContext();await context.resume();const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);const values=new Uint8Array(256);const tick=()=>{analyser.getByteTimeDomainData(values);let sum=0;for(const x of values)sum+=(x-128)**2;self.bar.style.width=(muted?0:Math.min(100,Math.sqrt(sum/values.length)*5))+'%';animation=requestAnimationFrame(tick)};tick()}catch{}
 }catch(e){await cleanup();status(e.name==='NotAllowedError'?'Разреши доступ к микрофону в настройках браузера и попробуй снова.':e.name==='NotFoundError'?'Микрофон не найден. Подключи его и попробуй снова.':e.message||'Не удалось подключиться. Попробуй ещё раз.')}
 finally{joining=false;$('join').disabled=false}
};
$('mute').onclick=()=>{muted=!muted;$('mute').setAttribute('aria-pressed',String(muted));stream?.getAudioTracks().forEach(t=>t.enabled=!muted);$('mute').textContent=muted?'Микрофон: выкл':'Микрофон: вкл';peers.get('self').detail.textContent=muted?'Микрофон: выкл':'Микрофон: вкл';announce()};
$('deafen').onclick=()=>{deaf=!deaf;$('deafen').setAttribute('aria-pressed',String(deaf));peers.forEach(p=>{if(p.audio)p.audio.muted=deaf});$('deafen').textContent=deaf?'Звук: выкл':'Звук: вкл'};
$('resume').onclick=async()=>{try{await Promise.all([...peers.values()].filter(p=>p.audio).map(p=>p.audio.play()).concat([...screens.values()].map(s=>s.video.play())));$('resume').hidden=true;updateCount()}catch{status('Браузер блокирует звук. Попробуй открыть ссылку в Chrome или Firefox.')}};
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);status('Скопировано')}catch{status('Скопируй адрес сайта.')}};
$('leave').onclick=async()=>{await cleanup();status('Ты вышел')};
addEventListener('pagehide',()=>{clearCameraPreview();cameraStream?.getTracks().forEach(t=>t.stop());screenStream?.getTracks().forEach(t=>t.stop());stream?.getTracks().forEach(t=>t.stop());room?.leave()});
