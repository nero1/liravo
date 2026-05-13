-- French market non-Amazon affiliate stores
INSERT INTO affiliate_stores (name, country, base_url, affiliate_tag, is_primary, priority, created_at)
VALUES
  ('Fnac', 'FR', 'https://www.fnac.com/SearchResult/ResultList.aspx?Search=', '', false, 2, now()),
  ('Decitre', 'FR', 'https://www.decitre.fr/recherche/result.aspx?q=', '', false, 3, now())
ON CONFLICT DO NOTHING;

-- German market non-Amazon affiliate stores
INSERT INTO affiliate_stores (name, country, base_url, affiliate_tag, is_primary, priority, created_at)
VALUES
  ('Thalia', 'DE', 'https://www.thalia.de/suche?sq=', '', false, 2, now()),
  ('Bücher.de', 'DE', 'https://www.buecher.de/suchergebnis/?q=', '', false, 3, now())
ON CONFLICT DO NOTHING;
