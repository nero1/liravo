import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
const config=[...nextVitals,...nextTypescript,{ignores:['node_modules/**','mobile/**','.next/**','tests/**','scripts/**','src/lib/db/schema.ts','src/types/database.generated.ts']},{rules:{'react-hooks/set-state-in-effect':'off','react-hooks/refs':'off','react-hooks/purity':'off','react-hooks/error-boundaries':'off'}}];
export default config;
