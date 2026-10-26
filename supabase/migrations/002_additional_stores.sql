-- French market non-Amazon affiliate stores
INSERT INTO affiliate_stores (name, countries, url_template, affiliate_tag, is_non_affiliate, priority, created_at)
VALUES
  ('Fnac', '{FR}', 'https://www.fnac.com/SearchResult/ResultList.aspx?Search={isbn}', '', true, 2, now()),
  ('Decitre', '{FR}', 'https://www.decitre.fr/recherche/result.aspx?q={isbn}', '', true, 3, now())
ON CONFLICT DO NOTHING;

-- German market non-Amazon affiliate stores
INSERT INTO affiliate_stores (name, countries, url_template, affiliate_tag, is_non_affiliate, priority, created_at)
VALUES
  ('Thalia', '{DE}', 'https://www.thalia.de/suche?sq={isbn}', '', true, 2, now()),
  ('Bücher.de', '{DE}', 'https://www.buecher.de/suchergebnis/?q={isbn}', '', true, 3, now())
ON CONFLICT DO NOTHING;
