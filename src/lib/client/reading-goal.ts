import {z} from 'zod';
import type {ReadingGoalData} from '@/types/database';
const goalSchema=z.object({id:z.string().uuid(),user_id:z.string().uuid(),year:z.number().int(),target_books:z.number().int().min(1).max(10000)});
export function validReadingGoal(value:unknown,actorId:string,year:number):value is NonNullable<ReadingGoalData['goal']>{const result=goalSchema.safeParse(value);return result.success&&result.data.user_id===actorId&&result.data.year===year;}
export function validReadingGoalData(value:unknown,actorId:string,year:number):value is ReadingGoalData{
 const result=z.object({actorId:z.literal(actorId),goal:goalSchema.nullable(),progress:z.object({books_read:z.number().int().nonnegative(),year:z.literal(year),percentage:z.number().min(0).max(100).nullable()})}).safeParse(value);
 return result.success&&(result.data.goal===null||validReadingGoal(result.data.goal,actorId,year));
}
