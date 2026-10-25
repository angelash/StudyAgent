/* Synthetic frozen boards and real decodable WAVs, only in the isolated offline browser server. */
const path=require('node:path'),{createHash}=require('node:crypto');
exports.installWhiteboardMediaFixture=app=>{
  const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.env.STUDY_DATA_DIR??'.');
  if(!directory.startsWith(path.join(root,'data','qa')+path.sep)||process.env.STUDY_STORAGE!=='sqlite'||process.env.XIAOJIU_CHAT_ENABLED!=='false')throw Error('Whiteboard fixtures require isolated offline QA storage');
  const load=name=>require('../../apps/api/dist/apps/api/src/'+name+'.js');
  const store=app.get(load('infrastructure/in-memory-store.service').InMemoryStoreService),speech=app.get(load('modules/ai/speech.service').SpeechService);
  const {hashToken}=load('modules/auth/auth.service'),{requestToken}=load('common/auth.guard'),original=speech.synthesize.bind(speech);
  speech.synthesize=async(text,voice)=>{
    if(!text.includes('[whiteboard-fixture]'))return original(text,voice);
    if(voice==='fixture-delay')await new Promise(resolve=>setTimeout(resolve,1800));
    if(voice==='fixture-fail')throw new (require('@nestjs/common').ServiceUnavailableException)('Synthetic whiteboard audio failure');
    const rate=8000,count=16000,bytes=Buffer.alloc(44+count*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
    for(let i=0;i<count;i++)bytes.writeInt16LE(Math.round(800*Math.sin(i*2*Math.PI*220/rate)),44+i*2);
    return{content:bytes,contentType:'audio/wav'};
  };
  app.getHttpAdapter().getInstance().post('/api/qa/whiteboard-media',async(req,res)=>{
    try{const result=await store.transaction(()=>{
      const session=store.find('sessions',{tokenHash:hashToken(requestToken(req))}),owner=session&&store.find('users',{id:session.userId,role:'parent',status:'active'});
      if(!owner||session.revokedAt||Date.parse(session.expiresAt)<=Date.now()||!/^whiteboard-.*@local\.test$/.test(owner.principal))throw Error('Fixture authorization required');
      const board=store.find('studioWhiteboards',{id:req.body?.boardId});
      if(!board||!store.find('bindings',{studentId:board.studentId,parentUserId:owner.id,status:'active'}))throw Error('Fixture board authorization required');
      if(req.body.revoke===true){store.find('bindings',{studentId:board.studentId,parentUserId:owner.id,status:'active'}).status='revoked';return{revoked:true};}
      board.title='匿名逐句白板';board.scenes=[{id:'scene:1',kind:'steps',title:'统一单位',body:'完整正文首行。完整正文末行。',bullets:['先统一单位','再合并份数','最后验证'],narration:'[whiteboard-fixture] 先统一单位。 [whiteboard-fixture] 再合并份数。 [whiteboard-fixture] 最后验证。',durationMs:10},{id:'scene:2',kind:'check',title:'保留证据',body:'完整来源与笔记。',narration:'[whiteboard-fixture] 保留新的独立观察。',durationMs:10}];
      board.durationMs=20;board.fingerprint=createHash('sha256').update(JSON.stringify(board.scenes)).digest('hex');return board;
    });res.status(201).json({data:result});}catch{res.status(400).json({error:{message:'Synthetic whiteboard fixture unavailable'}});}
  });
};
