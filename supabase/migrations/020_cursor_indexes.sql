create index if not exists notifications_user_cursor on notifications(user_id,created_at desc,id desc);
create index if not exists reading_lists_user_cursor on reading_lists(user_id,created_at desc,id desc);
create index if not exists reviews_user_cursor on reviews(user_id,created_at desc,id desc);
create index if not exists shelf_books_user_cursor on shelf_books(user_id,added_at desc,id desc);
