import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '../messages/en.json';
import fr from '../messages/fr.json';
import de from '../messages/de.json';

interface Catalog { [key: string]: string | Catalog }
function flatten(catalog: Catalog, prefix=''): Record<string,string> {
  return Object.fromEntries(Object.entries(catalog).flatMap(([key,value]) =>
    typeof value === 'string' ? [[prefix+key,value]] : Object.entries(flatten(value,`${prefix}${key}.`))
  ));
}
for (const [locale,messages] of Object.entries({en,fr,de})) describe(`locale ${locale}`, () => {
  it('keeps keys and interpolation contracts complete and renders every message', () => {
    const source=flatten(en), target=flatten(messages);
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
    const t=createTranslator({locale,messages,onError:error=>{throw error;}});
    for(const [key,message] of Object.entries(source)) {
      const argumentsOf=(text: string)=>Array.from(text.matchAll(/\{(\w+)(?:\s*[,}])/g),m=>m[1]).sort();
      const names=argumentsOf(message);
      expect(argumentsOf(target[key])).toEqual(names);
      const numeric = new Set(Array.from(message.matchAll(/\{(\w+),\s*(?:plural|selectordinal|number)\b/g), match => match[1]));
      const values=Object.fromEntries(names.map(name=>[name,numeric.has(name)||['count','days','percent'].includes(name)?2:'Reader']));
      const rendered=t(key as Parameters<typeof t>[0],values);
      expect(rendered).toBeTruthy();
      expect(rendered).not.toContain('NaN');
    }
  });
  it('handles singular and plural reply counts', () => {
    const t=createTranslator({locale,messages});
    expect(t('book.replyCount',{count:1})).not.toBe(t('book.replyCount',{count:2}));
  });
});
