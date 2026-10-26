import { expect, it, vi } from 'vitest';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

vi.mock('react',()=>({useRef:(value:unknown)=>({current:value})}));

it('retains failed-request keys independently when two controls submit concurrently',()=>{
  const intents=useRequestIntent();
  const first=intents.headers({voted:true},'first-entry');
  const second=intents.headers({voted:true},'second-entry');
  expect(first).not.toEqual(second);
  expect(intents.headers({voted:true},'first-entry')).toEqual(first);
  intents.complete('second-entry');
  expect(intents.headers({voted:true},'first-entry')).toEqual(first);
  expect(intents.headers({voted:true},'second-entry')).not.toEqual(second);
});

it('rotates a key only after acknowledgement or a changed payload',()=>{
  const intents=useRequestIntent();
  const initial=intents.headers({content:'First draft'});
  expect(intents.headers({content:'First draft'})).toEqual(initial);
  const edited=intents.headers({content:'Edited draft'});
  expect(edited).not.toEqual(initial);
  intents.complete();
  expect(intents.headers({content:'Edited draft'})).not.toEqual(edited);
});
