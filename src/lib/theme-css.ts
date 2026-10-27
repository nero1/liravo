const colors=new Set(['background','foreground','muted','muted-foreground','border','input','primary','primary-foreground','secondary','secondary-foreground','accent','accent-foreground','card','card-foreground','destructive','destructive-foreground','ring']);
export function normalizeThemeCss(source:string){
  if(source.length>50000)throw new Error('Theme too large');
  const css=source.replace(/\/\*[\s\S]*?\*\//g,'').trim();if(!css)return '';
  const blocks=new Map<string,string>();let end=0;
  for(const match of css.matchAll(/(:root|\.dark)\s*\{([^{}]*)\}/g)){
    if(css.slice(end,match.index).trim()||blocks.has(match[1]))throw new Error('Invalid theme selectors');
    const declarations=new Map<string,string>();
    for(const raw of match[2].split(';').filter(value=>value.trim())){
      const declaration=/^\s*--([a-z-]+)\s*:\s*([^;]+?)\s*$/.exec(raw);
      if(!declaration)throw new Error('Invalid theme declaration');
      const [,name,value]=declaration;
      const validColor=colors.has(name)&&/^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|hsl)a?\([\d .,%/+\-]+\))$/i.test(value);
      const radius=/^(\d+(?:\.\d+)?)(rem|px)$/.exec(value);
      if(!(validColor||name==='radius'&&radius&&Number(radius[1])<=(radius[2]==='rem'?10:100))||declarations.has(name))throw new Error('Invalid theme variable');
      declarations.set(name,value.toLowerCase());
    }
    if(!declarations.size)throw new Error('Empty theme block');
    blocks.set(match[1],[...declarations].map(([name,value])=>`--${name}:${value};`).join(''));end=match.index+match[0].length;
  }
  if(css.slice(end).trim()||!blocks.size)throw new Error('Invalid theme CSS');
  return [':root','.dark'].filter(selector=>blocks.has(selector)).map(selector=>`${selector}{${blocks.get(selector)}}`).join('\n');
}
