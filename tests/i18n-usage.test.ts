import { expect, it } from 'vitest';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import en from '../messages/en.json';

it('resolves literal translation calls against the English catalog', () => {
  const missing: string[] = [];
  const walk = (directory: string): string[] => readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(join(directory,entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory,entry.name)] : []);
  for (const file of walk('src')) {
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
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

it('keeps localized sign-in screens free of untranslated text and labels', () => {
  const literals: string[] = [];
  for(const file of ['src/components/auth/LoginForm.tsx','src/app/login/page.tsx']) {
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const check=(node: ts.Node) => {
      let value: string | undefined;
      if(ts.isJsxText(node)) value=node.text.trim();
      if(ts.isJsxAttribute(node) && ['title','placeholder','aria-label','alt'].includes(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer)) value=node.initializer.text;
      if(value && /[A-Za-z]{2}/.test(value) && value!=='Liravo') literals.push(`${file}: ${value}`);
      ts.forEachChild(node,check);
    };
    check(source);
  }
  expect(literals).toEqual([]);
});
