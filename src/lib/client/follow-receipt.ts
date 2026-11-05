export type FollowReceipt={actorId:string;targetId:string;requestKey:string;action:'follow'|'unfollow';following:boolean;committedFollowing:boolean};
export function validFollowReceipt(value:unknown,actor:string,target:string,key:string):value is FollowReceipt{
 const receipt=value as FollowReceipt;return!!receipt&&receipt.actorId===actor&&receipt.targetId===target&&receipt.requestKey===key&&typeof receipt.following==='boolean'&&['follow','unfollow'].includes(receipt.action)&&receipt.committedFollowing===(receipt.action==='follow');
}
export async function recoverFollowReceipt(actor:string,target:string,key:string,signal?:AbortSignal){
 const response=await fetch('/api/users/'+target+'/follow?receipt='+encodeURIComponent(key),{headers:{'X-Liravo-Actor':actor},cache:'no-store',signal});if(response.status===404)return null;const receipt=await response.json();if(!response.ok||!validFollowReceipt(receipt,actor,target,key))throw Error('Follow unavailable');return receipt;
}
