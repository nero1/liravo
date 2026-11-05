export function assertSessionProviderAvailable(error:{status?:number}|null){
 if(error&&![400,401,403].includes(error.status??0))throw new Error('Session verification unavailable');
}
