import { expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import en from '../messages/en.json';

it('resolves literal translation calls against the English catalog', () => {
  const missing: string[] = [];
  const walk = (directory: string): string[] => readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(join(directory,entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory,entry.name)] : []);
  for (const file of walk('src')) {
    const contents=readFileSync(file,'utf8');
    if (!/\b(?:useTranslations|getTranslations)\s*\(/.test(contents)) continue;
    const source=ts.createSourceFile(file,contents,ts.ScriptTarget.Latest,true);
    const bindings=new Map<ts.Node,Map<string,string>>();
    const scopeOf = (node: ts.Node): ts.Node => {
      let parent=node.parent;
      while(parent && !ts.isFunctionLike(parent) && !ts.isSourceFile(parent)) parent=parent.parent;
      return parent ?? source;
    };
    const collect=(node: ts.Node) => {
      if(ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const value=ts.isAwaitExpression(node.initializer)?node.initializer.expression:node.initializer;
        if(ts.isCallExpression(value) && ts.isIdentifier(value.expression) && ['useTranslations','getTranslations'].includes(value.expression.text)) {
          const argument=value.arguments[0];
          const namespace=!argument?'':ts.isStringLiteral(argument)?argument.text:undefined;
          if(namespace!==undefined) {
            const scope=scopeOf(node), map=bindings.get(scope) ?? new Map<string,string>();
            map.set(node.name.text,namespace); bindings.set(scope,map);
          }
        }
      }
      ts.forEachChild(node,collect);
    };
    collect(source);
    const check=(node: ts.Node) => {
      if(ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const expression=ts.isPropertyAccessExpression(node.expression)?node.expression.expression:node.expression;
        if(ts.isIdentifier(expression)) {
          let scope: ts.Node | undefined=scopeOf(node), namespace: string | undefined;
          while(scope) {
            namespace=bindings.get(scope)?.get(expression.text);
            if(namespace!==undefined || ts.isSourceFile(scope)) break;
            scope=scopeOf(scope);
          }
          if(namespace!==undefined) {
            const key=[namespace,node.arguments[0].text].filter(Boolean).join('.');
            let value: unknown=en;
            for(const part of key.split('.')) value=value && typeof value==='object'?(value as Record<string,unknown>)[part]:undefined;
            if(typeof value!=='string') missing.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1} ${key}`);
          }
        }
      }
      ts.forEachChild(node,check);
    };
    check(source);
  }
  expect(missing).toEqual([]);
});

it('keeps localized sign-in and admin screens free of untranslated text and labels', () => {
  const literals: string[] = [];
  const adminFiles=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?adminFiles(join(directory,entry.name)):entry.name.endsWith('.tsx')?[join(directory,entry.name)]:[]);
  for(const file of ['src/app/(app)/settings/pin/PINSettingsClient.tsx','src/components/profile/ProfileEditForm.tsx','src/components/auth/OnboardingFlow.tsx','src/app/(app)/buddy-reads/[id]/page.tsx','src/app/(app)/settings/import/page.tsx','src/components/auth/LoginForm.tsx','src/app/login/page.tsx','src/components/creator/TipButton.tsx','src/components/creator/PayoutForm.tsx','src/components/creator/PayoutQueue.tsx','src/app/(app)/earnings/page.tsx','src/components/creator/CancelSubscriptionButton.tsx','src/app/(app)/tips/[id]/page.tsx','src/app/(app)/write/prompts/page.tsx','src/app/(app)/write/prompts/[id]/page.tsx','src/app/(app)/write/challenges/page.tsx','src/app/(app)/write/challenges/[id]/page.tsx','src/components/writing/ChallengeJoinButton.tsx','src/app/(app)/share/writing-challenge/[id]/route.tsx',...adminFiles('src/app/(app)/admin')]) {
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const check=(node: ts.Node) => {
      let value: string | undefined;
      if(ts.isJsxText(node)) value=node.text.trim();
      if(ts.isJsxAttribute(node) && ['title','placeholder','aria-label','alt'].includes(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) value=node.initializer.text;
      const technical = ts.isJsxText(node) && ts.isJsxElement(node.parent) && node.parent.openingElement.tagName.getText()==='code';
      const example = value && (/^https?:\/\//.test(value) || /^(?:[A-Z]{2}, )+[A-Z]{2}$/.test(value));
      if(value && /[A-Za-z]{2}/.test(value) && !['Liravo','liravo.org'].includes(value) && !technical && !example) literals.push(`${file}: ${value}`);
      ts.forEachChild(node,check);
    };
    check(source);
  }
  expect(literals).toEqual([]);
});

it('keeps admin fields named and switches stateful for assistive technology', () => {
  const files=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):entry.name.endsWith('.tsx')?[join(directory,entry.name)]:[]);
  const missing: string[]=[];
  for(const file of files('src/app/(app)/admin')) {
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    type Element=ts.JsxOpeningElement|ts.JsxSelfClosingElement;
    const attributes=(node:Element)=>new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute=>[attribute.name.getText(),attribute.initializer]));
    const value=(node:ts.JsxAttributeValue|undefined)=>node && ts.isStringLiteral(node)?node.text:node?.getText();
    const labels=new Set<string>();
    const collect=(node:ts.Node)=>{
      if(ts.isJsxOpeningElement(node)&&node.tagName.getText()==='label') {
        const target=value(attributes(node).get('htmlFor')); if(target) labels.add(target);
      }
      ts.forEachChild(node,collect);
    };
    collect(source);
    const check=(node:ts.Node)=>{
      if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
        const tag=node.tagName.getText(), attrs=attributes(node);
        if(['input','textarea','select'].includes(tag)&&value(attrs.get('type'))!=='hidden') {
          let parent:ts.Node|undefined=node.parent,wrapped=false;
          while(parent&&!ts.isFunctionLike(parent)) {
            if(ts.isJsxElement(parent)&&parent.openingElement.tagName.getText()==='label') wrapped=true;
            parent=parent.parent;
          }
          if(!wrapped&&!attrs.has('aria-label')&&!attrs.has('aria-labelledby')&&!labels.has(value(attrs.get('id'))??'')) missing.push(`${file}: unnamed ${tag}`);
        }
        if(value(attrs.get('role'))==='switch'&&(!attrs.has('aria-checked')||!attrs.has('aria-label'))) missing.push(`${file}: incomplete switch`);
        if(tag==='th'&&!attrs.has('scope')) missing.push(`${file}: unscoped table header`);
      }
      ts.forEachChild(node,check);
    };
    check(source);
  }
  expect(missing).toEqual([]);
});
