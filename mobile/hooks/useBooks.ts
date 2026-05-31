import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/constants/api';
import type { BookRow, ReviewRow, QuoteRow } from '@/types';

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
    queryFn: () => api.get<{ book: BookRow }>(ENDPOINTS.books.byId(id)),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { book_id: string; shelf_type: string; google_books_id?: string }) =>
      api.post(ENDPOINTS.shelfBooks.toggle, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shelves'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useTrackAffiliateClick() {
  return useMutation({
    mutationFn: (body: { book_id: string; link_type: string; store_name?: string }) =>
      api.post(ENDPOINTS.books.click, body),
  });
}
