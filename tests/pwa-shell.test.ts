vi.mock('next/headers',()=>({headers:()=>new Headers({'x-nonce':'fixture_nonce_for_offline_page'})}));
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import sharp from 'sharp';
import {createTranslator} from 'next-intl';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';
import {GET as manifest} from '@/app/manifest.json/route';
import {GET as offline} from '@/app/offline/route';
import {GET as image} from '@/app/opengraph-image/route';
const catalogs={en,fr,de};
const rendered=vi.hoisted(()=>({tree:null as any,options:null as any}));
vi.mock('next-intl/server',()=>({getTranslations:async({locale,namespace}:{locale:keyof typeof catalogs;namespace:string})=>{const t=createTranslator({locale,messages:catalogs[locale],onError:error=>{throw error;}});return(key:string,values:any)=>t(namespace+'.'+key as never,values);}}));
vi.mock('next/og',()=>({ImageResponse:class extends Response{constructor(tree:unknown,options:any){super('PNG fixture',{headers:options.headers});rendered.tree=tree;rendered.options=options;}}}));
for(const locale of['en','fr','de']as const){
 it('returns a localized public '+locale+' manifest independent of account cookies',async()=>{const request=(cookie:string)=>new Request('https://app.test/manifest.json?locale='+locale,{headers:{Cookie:cookie}}),a=await manifest(request('liravo-session=first')),b=await manifest(request('liravo-session=second'));const data=await a.json();expect(data).toEqual(await b.json());expect(data.lang).toBe(locale);expect(data.id).toBe('/');expect(data.shortcuts[0].name).toBe(catalogs[locale].discover.title);expect(data.shortcuts[1].name).toBe(catalogs[locale].shelves.title);expect(a.headers.get('Content-Type')).toContain('application/manifest+json');expect(a.headers.get('Cache-Control')).toContain('public');});
 it('renders the '+locale+' site image with an explicit locale and public cache policy',async()=>{const response=await image(new Request('https://app.test/opengraph-image?locale='+locale));expect(JSON.stringify(rendered.tree)).toContain(catalogs[locale].site.socialTagline);expect(rendered.options).toMatchObject({width:1200,height:630});expect(response.headers.get('Cache-Control')).toContain('public');});
}
it('serves a standalone nonpersonal offline document with all supported translations and no React account payload',async()=>{const response=await offline(),html=await response.text();expect(response.headers.get('X-Liravo-Offline')).toBe('1');expect(response.headers.get('X-Robots-Tag')).toContain('noindex');expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval');expect(html).toContain('/offline.js');for(const messages of Object.values(catalogs))expect(html).toContain(messages.offlinePage.title);expect(html).not.toContain('liravo-session');expect(html).not.toContain('self.__next_f');});
it('selects offline language from the saved preference before browser language and retries the original page',()=>{const nodes:any={'offline-messages':{textContent:JSON.stringify(Object.fromEntries(Object.entries(catalogs).map(([locale,messages])=>[locale,{...messages.offlinePage,retry:messages.common.retry}])) )},'offline-title':{},'offline-description':{},'offline-retry':{}},document:any={cookie:'NEXT_LOCALE=fr',documentElement:{lang:'en'},getElementById:(id:string)=>nodes[id]},location=new URL('https://app.test/shelf?cursor=preserved');runInNewContext(readFileSync('public/offline.js','utf8'),{document,location,navigator:{languages:['de-DE']}});expect(document.documentElement.lang).toBe('fr');expect(nodes['offline-title'].textContent).toBe(fr.offlinePage.title);expect(nodes['offline-retry'].href).toBe(location.href);document.cookie='NEXT_LOCALE=%invalid';runInNewContext(readFileSync('public/offline.js','utf8'),{document,location,navigator:{languages:['de-DE']}});expect(document.documentElement.lang).toBe('de');});
it('supplies all referenced icon sizes including a transparent notification badge',async()=>{for(const size of[192,512]){const metadata=await sharp(readFileSync('public/icons/icon-'+size+'.png')).metadata();expect(metadata).toMatchObject({format:'png',width:size,height:size});}expect(await sharp(readFileSync('public/icons/badge-72.png')).metadata()).toMatchObject({width:72,height:72,hasAlpha:true});});
it('rejects unsupported manifest and image locales',async()=>{expect((await manifest(new Request('https://app.test/manifest.json?locale=invalid'))).status).toBe(400);expect((await image(new Request('https://app.test/opengraph-image?locale=invalid'))).status).toBe(400);});
