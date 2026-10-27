import {expect,it} from 'vitest';
import {normalizeThemeCss} from '@/lib/theme-css';

it('normalizes light/dark variable overrides without altering application selectors',()=>{
  expect(normalizeThemeCss('/* theme */ .dark { --accent: #ABC; } :root { --radius: 0.5rem; --background: rgb(1 2 3 / .5); }')).toBe(':root{--radius:0.5rem;--background:rgb(1 2 3 / .5);}\n.dark{--accent:#abc;}');
  expect(normalizeThemeCss('')).toBe('');
});
it('rejects external resources, markup, unknown variables, competing blocks and non-variable CSS',()=>{
  for(const css of [':root{--accent:url(https://evil.test)}','</style><script>alert(1)</script>','@import "x";',':root{color:red;}',':root{--font-body:Arial;}',':root{--radius:101px;}','.other{--accent:#fff;}',':root{--accent:#fff;} :root{--accent:#000;}',':root{--accent:#fff;--accent:#000;}',':root{--accent:#12345;}',':root{--accent:#fff;}body{display:none;}'])expect(()=>normalizeThemeCss(css)).toThrow();
});
