import {z} from 'zod';

const user=z.object({id:z.string().uuid(),display_name:z.string().nullable(),username:z.string(),avatar_url:z.string().nullable()}),book=z.object({id:z.string().uuid(),title:z.string(),author_name:z.string(),cover_url:z.string().nullable()});
const common={id:z.string(),timestamp:z.string().datetime({offset:true}),userId:z.string().uuid(),user,book,wantToRead:z.boolean()};
export const socialFeedItem=z.discriminatedUnion('type',[
  z.object({...common,type:z.literal('shelf_book'),shelf:z.object({name:z.string(),default_type:z.string().nullable()}),finishedAt:z.string().nullable()}),
  z.object({...common,type:z.literal('review'),reviewId:z.string().uuid(),rating:z.number().int().min(1).max(5),reviewType:z.string(),excerpt:z.string().nullable(),hasSpoilers:z.boolean()}),
]);
export type SocialFeedItem=z.infer<typeof socialFeedItem>;
