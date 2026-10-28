'use client';

import {useRequestIntent} from './useRequestIntent';

export function useBookLinkClick(bookId:string,userId:string){
  const intent=useRequestIntent(userId);
  return async(linkId:string)=>{
    const body={bookId,linkId},scope='book-link:'+bookId+':'+linkId;
    const response=await fetch('/api/books/click',{method:'POST',headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body),keepalive:true});
    if(!response.ok)throw new Error('Click recording unavailable');
    const result=await response.json();if(result.ok!==true||typeof result.clickId!=='string')throw new Error('Invalid click receipt');intent.complete(scope);
  };
}
