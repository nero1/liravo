import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const {createPipeline,model}=vi.hoisted(()=>({createPipeline:vi.fn(),model:vi.fn()}));
vi.mock('@huggingface/transformers',()=>({pipeline:createPipeline,env:{allowLocalModels:true}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();createPipeline.mockResolvedValue(model);model.mockResolvedValue([{label:'toxic',score:0.9}]);});
afterEach(()=>{vi.unstubAllGlobals();});
it('never loads a model during server rendering or for short browser input',async()=>{
  const {classifyReviewTone}=await import('@/lib/client/tone-classifier');
  expect(await classifyReviewTone('A sufficiently long review.')).toBe('unavailable');expect(createPipeline).not.toHaveBeenCalled();
  vi.stubGlobal('window',{});expect(await classifyReviewTone('Short')).toBe('unavailable');expect(createPipeline).not.toHaveBeenCalled();
});
it('preserves lazy browser inference, model reuse and warning thresholds',async()=>{
  vi.stubGlobal('window',{});const {classifyReviewTone}=await import('@/lib/client/tone-classifier');
  expect(await classifyReviewTone('A sufficiently long review.')).toBe('toxic');
  model.mockResolvedValueOnce([{label:'toxic',score:0.7}]);expect(await classifyReviewTone('Another sufficiently long review.')).toBe('warning');
  model.mockResolvedValueOnce([{label:'toxic',score:0.2}]);expect(await classifyReviewTone('A third sufficiently long review.')).toBe('safe');
  expect(createPipeline).toHaveBeenCalledTimes(1);expect(createPipeline).toHaveBeenCalledWith('text-classification','Xenova/toxic-bert',{device:'wasm'});
});

it('reports unavailable inference, retries failed loads and shares concurrent model initialization',async()=>{
 vi.stubGlobal('window',{});createPipeline.mockRejectedValueOnce(Error('Temporary model outage'));const {classifyReviewTone}=await import('@/lib/client/tone-classifier');
 expect(await classifyReviewTone('A sufficiently long review.')).toBe('unavailable');expect(await classifyReviewTone('Another sufficiently long review.')).toBe('unavailable');expect(createPipeline).toHaveBeenCalledOnce();
 vi.useFakeTimers();try{vi.setSystemTime(Date.now()+61000);await Promise.all([classifyReviewTone('A longer review one.'),classifyReviewTone('A longer review two.')]);expect(createPipeline).toHaveBeenCalledTimes(2);}finally{vi.useRealTimers();}
});
