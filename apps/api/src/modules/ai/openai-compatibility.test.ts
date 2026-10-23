import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';
import { SpeechService } from './speech.service';

/** Real installed SDK, intercepted transport only: never a provider connectivity claim. */
describe('compatible SDK transport after validation dependency migration',()=>{
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  function configure(){vi.stubEnv('OPENAI_API_KEY','sdk-compat-fixture');vi.stubEnv('OPENAI_BASE_URL','https://compatibility.example.test/v1');vi.stubEnv('OPENAI_MODEL','compat-fixture-model');vi.stubEnv('MINIMAX_API_KEY','');}
  it('preserves configured chat JSON requests and returns analysis without changing scoring',async()=>{
    configure();const requests:Request[]=[],bodies:any[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:any,init:any)=>{const request=new Request(input,init);requests.push(request);bodies.push(await request.json());return new Response(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model:'compat-fixture-model',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({summary:'待核对的教学解释。',structuredResult:{correct:false},confidenceLevel:'low',reviewRequired:true})}}]}),{status:200,headers:{'content-type':'application/json'}});}));
    const store={nextId:()=> 'compatibility-insight',append:vi.fn()},events={publish:vi.fn()},service=new AiService(store as any,events as any,{} as any,{} as any,{} as any);
    const result=await service.analyzeAssessment({question:{id:'fixture-question',subject:'math',stem:'匿名测试题',answer:'2',analysis:'用于传输兼容性验证。'} as any,answer:'1'});
    expect(result).toMatchObject({source:'openai',reviewRequired:true,confidenceLevel:'low',structuredResult:{correct:false}});expect(requests).toHaveLength(1);expect(requests[0].url).toBe('https://compatibility.example.test/v1/chat/completions');expect(requests[0].headers.get('authorization')).toBe('Bearer sdk-compat-fixture');expect(bodies[0]).toMatchObject({model:'compat-fixture-model',response_format:{type:'json_object'}});expect(JSON.parse(bodies[0].messages[1].content)).toMatchObject({studentAnswer:'1',standardAnswer:'2'});expect(store.append).toHaveBeenCalledOnce();expect(store.append.mock.calls[0][0]).toBe('aiInsights');
  });
  it('preserves binary speech responses through the installed SDK',async()=>{
    configure();const audio=Buffer.from('ID3-anonymous-transport-fixture'),bodies:any[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:any,init:any)=>{const request=new Request(input,init);expect(request.url).toBe('https://compatibility.example.test/v1/audio/speech');bodies.push(await request.json());return new Response(audio,{status:200,headers:{'content-type':'audio/mpeg'}});}));
    const result=await new SpeechService().synthesize('匿名测试旁白。','alloy');expect(result).toMatchObject({provider:'openai',contentType:'audio/mpeg'});expect(result.content).toEqual(audio);expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({voice:'alloy',input:'匿名测试旁白。',response_format:'mp3'});
  });
  it('keeps SDK provider failures sanitized and avoids automatic application retries',async()=>{
    configure();const fetcher=vi.fn(async()=>new Response(JSON.stringify({error:{message:'private-provider-detail',type:'authentication_error',code:'invalid_api_key'}}),{status:401,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
    await expect(new SpeechService().synthesize('匿名测试旁白。','alloy')).rejects.toThrow('旁白暂时不可用');expect(fetcher).toHaveBeenCalledTimes(1);
    const service=new AiService({} as any,{} as any,{} as any,{} as any,{} as any),hint=await service.generateHint({question:{subject:'math',stem:'匿名测试题',analysis:'只测试失败回退。'} as any,answerHistoryCount:0});expect(hint.source).toBe('rules');expect(JSON.stringify(hint)).not.toMatch(/private-provider-detail|sdk-compat-fixture/);expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
