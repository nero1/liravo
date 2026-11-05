export function publicAppPath(pathname:string){
  return /^\/book\/[^/]+\/?$/.test(pathname)||/^\/lists\/[^/]+\/?$/.test(pathname)&&!/^\/lists\/(new|following)\/?$/.test(pathname)
    ||/^\/author\/[^/]+\/?$/.test(pathname)&&!/^\/author\/(analytics|qa|arcs|books)\/?$/.test(pathname);
}
