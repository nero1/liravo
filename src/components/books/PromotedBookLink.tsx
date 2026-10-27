'use client';
import Link from 'next/link';
export function PromotedBookLink({listingId,bookId,children,className}:{listingId:string;bookId:string;children:React.ReactNode;className?:string}){
  return <Link href={`/book/${bookId}`} className={className} onClick={()=>{void fetch(`/api/promoted-listings/${listingId}/click`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});}}>{children}</Link>;
}
