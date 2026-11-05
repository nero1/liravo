export function contentSecurityPolicy(nonce:string,supabase:boolean,development=false){
 if(!/^[A-Za-z0-9+/=_-]{20,100}$/.test(nonce))throw new Error('Invalid CSP nonce');
 return [
  "default-src 'self'",
  "script-src 'self' 'nonce-"+nonce+"' 'strict-dynamic' 'wasm-unsafe-eval' https://telegram.org https://hcaptcha.com https://*.hcaptcha.com"+(development?" 'unsafe-eval'":""),
  "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
  "img-src 'self' blob: data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'"+(supabase?" https://*.supabase.co wss://*.supabase.co":"")+" https://books.googleapis.com https://openlibrary.org https://hcaptcha.com https://*.hcaptcha.com https://huggingface.co https://cdn-lfs.huggingface.co https://cdn-lfs-us-1.hf.co https://cas-bridge.xethub.hf.co",
  "frame-src 'self' https://oauth.telegram.org https://www.youtube.com https://hcaptcha.com https://*.hcaptcha.com",
  "worker-src 'self' blob:","object-src 'none'","base-uri 'self'","frame-ancestors 'none'","form-action 'self'",
 ].join('; ');
}
