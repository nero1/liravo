import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {useAuthStore} from '@/stores/auth';
import {useRequestIntent} from '@/hooks/useRequestIntent';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import type { AffiliateLink, BookRow, ReviewRow, QuoteRow,UserRow,WorkCatalog } from '@/types';

export function useBookSearch(query: string) {
  return useQuery({
    queryKey: ['books', 'search', query],
    queryFn: () => api.get<{ books: BookRow[] }>(ENDPOINTS.books.search, { q: query }),
    enabled: query.length >= 2,
    staleTime: 1000 * 30,
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: () => api.get<WorkCatalog&{book:BookRow;affiliateLinks:AffiliateLink[];audibleLink:AffiliateLink|null}>(ENDPOINTS.books.byId(id)),
  });
}

export function useBookReviews(bookId: string) {
  return useQuery({
    queryKey: ['book', bookId, 'reviews'],
    queryFn: () => api.get<{ reviews: ReviewRow[] }>(ENDPOINTS.books.reviews(bookId)),
  });
}

export function useBookQuotes(bookId: string) {
  return useQuery({
    queryKey: ['book', bookId, 'quotes'],
    queryFn: () => api.get<{ quotes: QuoteRow[] }>(ENDPOINTS.books.quotes(bookId)),
  });
}

export function useToggleShelf() {
  const qc = useQueryClient(),owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  return useMutation({
    mutationFn:async(body:{bookId:string;shelfId:string;action:'add'|'remove'})=>{
      const scope='shelf.'+body.shelfId+'.'+body.bookId,result=await api.post<{ok:boolean;new_total:number;xp_awarded:number}>(ENDPOINTS.shelfBooks.toggle,body,await intent.durableHeaders(body,scope));
      if(result.ok!==true||!Number.isInteger(result.new_total))throw new Error('Invalid shelf receipt');await intent.complete(scope);
      return result;
    },
    onSuccess: (_data,body) => {
      if(useAuthStore.getState().user?.id!==owner)return;
      void api.get<{user:UserRow}>(ENDPOINTS.users.me).then(({user})=>{if(user.id===owner&&useAuthStore.getState().user?.id===owner)useAuthStore.getState().setUser(user);}).catch(()=>{});
      qc.invalidateQueries({queryKey:['stats','reading']});
      qc.invalidateQueries({queryKey:['book',body.bookId]});
      qc.invalidateQueries({ queryKey: ['shelves'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['shelf'] });
      qc.invalidateQueries({ queryKey: ['reading-goals'] });
    },
  });
}

export function useTrackAffiliateClick(){
  const owner=useAuthStore(state=>state.user?.id),intent=useRequestIntent(owner);
  return useMutation({mutationFn:async(body:{bookId:string;linkId:string})=>{
    const scope='book.link.'+body.bookId+'.'+body.linkId,result=await api.post<{ok:boolean;clickId:string}>(ENDPOINTS.books.click,body,await intent.durableHeaders(body,scope));
    if(result.ok!==true||typeof result.clickId!=='string')throw new Error('Invalid click receipt');await intent.complete(scope);return result;
  }});
}
