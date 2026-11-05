import {adminCatalogResponse} from '@/lib/admin-catalog';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>adminCatalogResponse(request,'books','books');
