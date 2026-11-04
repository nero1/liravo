export function ShareRating({rating}:{rating:number}){
 return <div style={{display:'flex',gap:4}}>{Array.from({length:5},(_,index)=><svg key={index} width="28" height="28" viewBox="0 0 24 24" fill={index<Math.round(rating)?'#f59e0b':'none'} stroke="#f59e0b" strokeWidth="1.5"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg>)}</div>;
}
