alter table users add column if not exists preferred_locale text not null default 'en'
  check (preferred_locale in ('en','fr','de'));
